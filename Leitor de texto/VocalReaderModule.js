/**
 * ============================================================================
 * PROJETO: Módulo de Síntese de Voz Nativa e Leitura Inteligente
 * ARQUIVO: VocalReaderModule.js
 * VERSÃO: 2.0.0 (Phase 2 - Ecossistema de Treinamento de Idiomas)
 * DESCRIÇÃO: Motor auto-suficiente de síntese vocal client-side (Custo Zero).
 *            Implementa o algoritmo "Caçador de Vozes Neurais" para rankear,
 *            selecionar e executar leitura humanizada em en-US e pt-BR.
 * ============================================================================
 */

class VocalReaderModule {
    /**
     * Construtor do Módulo VocalReader
     * @param {Object} options - Configurações opcionais e callbacks
     */
    constructor(options = {}) {
        // Configurações padrão
        this.config = {
            defaultLang: options.defaultLang || 'en-US',
            defaultRate: options.defaultRate || 1.0,
            defaultPitch: options.defaultPitch || 1.0,
            defaultVolume: options.defaultVolume || 1.0,
            ...options
        };

        // Estado interno do módulo
        this.state = {
            isInitialized: false,
            isSupported: false,
            isPlaying: false,
            isPaused: false,
            currentLang: this.config.defaultLang,
            currentRate: this.config.defaultRate,
            currentPitch: this.config.defaultPitch,
            currentVolume: this.config.defaultVolume,
            availableVoices: [],
            catalogedVoicesByLang: {},
            selectedVoice: null,
            currentUtterance: null,
            startTime: 0,
            elapsedTimer: null
        };

        // Callbacks de Eventos
        this.callbacks = {
            onStart: options.onStart || (() => {}),
            onEnd: options.onEnd || (() => {}),
            onPause: options.onPause || (() => {}),
            onResume: options.onResume || (() => {}),
            onError: options.onError || (() => {}),
            onVoiceSelected: options.onVoiceSelected || (() => {}),
            onBoundary: options.onBoundary || (() => {}),
            onVoicesChanged: options.onVoicesChanged || (() => {}),
            onTimeUpdate: options.onTimeUpdate || (() => {})
        };

        // Validação de Suporte do Navegador
        this._checkSupport();
    }

    /**
     * Verifica se o navegador possui suporte à Web Speech API (SpeechSynthesis)
     * @private
     */
    _checkSupport() {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
            this.state.isSupported = true;
        } else {
            this.state.isSupported = false;
            const errorMsg = 'Seu navegador não possui suporte nativo à Web Speech API (speechSynthesis). Por favor, utilize o Google Chrome, Microsoft Edge, Safari ou Firefox atualizados.';
            console.error(`[VocalReaderModule] ERRO: ${errorMsg}`);
            this.callbacks.onError({ type: 'unsupported_browser', message: errorMsg });
        }
    }

    /**
     * Inicializa o módulo, carrega e cataloga as vozes disponíveis no sistema.
     * Trata automaticamente o evento assíncrono `onvoiceschanged`.
     * @returns {Promise<Object>} Resolução com o status de inicialização e a voz eleita.
     */
    async init() {
        if (!this.state.isSupported) {
            throw new Error('Web Speech API não suportada neste ambiente.');
        }

        // WAKE-UP HACK PARA CHROME NO WINDOWS / FILE://:
        // No protocolo file:// ou na inicialização do Chrome, solicitar um cancel() acorda o motor SAPI/Nuvem para carregar as vozes!
        try {
            window.speechSynthesis.cancel();
        } catch (e) {}

        return new Promise((resolve) => {
            const loadVoices = () => {
                const voices = window.speechSynthesis.getVoices();
                if (voices && voices.length > 0) {
                    // Se já inicializou e a quantidade de vozes não mudou, resolve imediatamente e evita recálculos
                    if (this.state.isInitialized && voices.length === this.state.availableVoices.length) {
                        resolve({
                            success: true,
                            lang: this.state.currentLang,
                            selectedVoice: this.state.selectedVoice,
                            totalVoices: voices.length
                        });
                        return true;
                    }
                    this._catalogAndRankVoices(voices);
                    this.state.isInitialized = true;
                    this.setLanguage(this.state.currentLang, true); // Eleger melhor voz inicial
                    this.callbacks.onVoicesChanged(this.state.catalogedVoicesByLang);
                    resolve({
                        success: true,
                        lang: this.state.currentLang,
                        selectedVoice: this.state.selectedVoice,
                        totalVoices: voices.length
                    });
                    return true;
                } else if (this.state.isInitialized) {
                    resolve({
                        success: true,
                        lang: this.state.currentLang,
                        selectedVoice: this.state.selectedVoice,
                        totalVoices: this.state.availableVoices.length
                    });
                    return true;
                }
                return false;
            };

            // Tentar carregamento síncrono imediato
            if (!loadVoices()) {
                // Manter o listener ativo permanentemente para capturar vozes que o Chrome só libera após interação do usuário (clique)
                if (window.speechSynthesis.onvoiceschanged !== undefined) {
                    window.speechSynthesis.onvoiceschanged = () => {
                        loadVoices();
                    };
                }
                // Polling de segurança de 5 segundos (50 tentativas a cada 100ms)
                let attempts = 0;
                const interval = setInterval(() => {
                    attempts++;
                    if (loadVoices() || attempts > 50) {
                        clearInterval(interval);
                        if (!this.state.isInitialized) {
                            console.warn('[VocalReaderModule] Aviso: Nenhuma voz detectada após 5 segundos.');
                            resolve({ success: false, reason: 'no_voices_detected' });
                        }
                    }
                }, 100);
            }
        });
    }

    /**
     * ALGORITMO "CAÇADOR DE VOZES NEURAIS" (Ranking Inteligente)
     * Varre as vozes disponíveis e atribui pontuações de qualidade acusticamente otimizadas.
     * @private
     * @param {SpeechSynthesisVoice[]} voices - Array bruto de vozes do sistema
     */
    _catalogAndRankVoices(voices) {
        this.state.availableVoices = voices;
        this.state.catalogedVoicesByLang = {};

        voices.forEach((voice) => {
            // Normalizar código do idioma (ex: 'en_US', 'en-us' -> 'en-US')
            const langCode = voice.lang.replace('_', '-');
            const baseLang = langCode.split('-')[0].toLowerCase(); // ex: 'en', 'pt'
            const fullLang = langCode.toLowerCase(); // ex: 'en-us', 'pt-br'

            const scoredVoice = this._calculateVoiceScore(voice);

            // Agrupar por idioma completo e idioma base
            if (!this.state.catalogedVoicesByLang[fullLang]) {
                this.state.catalogedVoicesByLang[fullLang] = [];
            }
            if (!this.state.catalogedVoicesByLang[baseLang]) {
                this.state.catalogedVoicesByLang[baseLang] = [];
            }

            this.state.catalogedVoicesByLang[fullLang].push(scoredVoice);
            // Evitar duplicatas no array de língua base
            if (!this.state.catalogedVoicesByLang[baseLang].some(v => v.voice === voice)) {
                this.state.catalogedVoicesByLang[baseLang].push(scoredVoice);
            }
        });

        // Ordenar cada lista por pontuação decrescente (a campeã no índice 0)
        Object.keys(this.state.catalogedVoicesByLang).forEach((key) => {
            this.state.catalogedVoicesByLang[key].sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                // Critério de desempate: priorizar vozes locais/nativas sobre remotas genéricas se pontuação for igual
                return (b.voice.localService ? 1 : 0) - (a.voice.localService ? 1 : 0);
            });
        });
    }

    /**
     * Atribui pontuação à voz conforme critérios de fidelidade e humanização
     * @private
     * @param {SpeechSynthesisVoice} voice - Objeto de voz do navegador
     * @returns {Object} Objeto enriquecido com pontuação e metadados
     */
    _calculateVoiceScore(voice) {
        let score = 0;
        let tier = 'Standard';
        let badge = '⚪';
        const name = voice.name || '';
        const lang = (voice.lang || '').toLowerCase();

        // 🟢 +100 pontos: Vozes Neurais da Microsoft Edge / Azure (Natural / Online)
        if (/Natural|Online/i.test(name)) {
            score += 100;
            tier = 'Neural Ultra-Human (Edge/Azure)';
            badge = '🟢';
        }
        // 🔵 +80 pontos: Vozes de alta definição na nuvem do Google (Chrome)
        else if (/^Google|Google /i.test(name)) {
            score += 80;
            tier = 'Cloud High-Def (Google Chrome)';
            badge = '🔵';
        }
        // 🟡 +70 pontos: Vozes neurais e nativas premium da Apple / macOS / iOS
        else if (/Samantha|Luciana|Siri|Karen|Daniel|Joana|Victoria|Alex|Premium|Enhanced/i.test(name)) {
            score += 70;
            tier = 'Native Premium (Apple/iOS/macOS)';
            badge = '🟡';
        }
        // ⚪ +50 pontos: Vozes padrão offline / sistema (Microsoft Zira, David, etc.)
        else {
            score += 50;
            tier = 'System Standard / Offline';
            badge = '⚪';
        }

        // Bônus adicional de leveza acústica
        if (voice.default) score += 5; // Pequeno bônus se o OS marcar como recomendada para aquele idioma

        // 🎯 PREFERÊNCIA DE GÊNERO POR IDIOMA
        // en-US: Preferir vozes MASCULINAS (+25 pts) | pt-BR: Preferir vozes FEMININAS (+25 pts)
        const maleNames = /\b(David|Mark|Guy|Andrew|Christopher|Eric|Ryan|Brian|Roger|James|Thomas|Steffan|Richard|Sean|Conrad|Liam|Adam|Ravi|Male)\b/i;
        const femaleNames = /\b(Zira|Jenny|Aria|Sara|Sonia|Samantha|Victoria|Karen|Joana|Luciana|Francisca|Maria|Ana|Fernanda|Tessa|Heera|Female|Linda|Catherine|Hazel|Susan|Michelle)\b/i;

        // Vozes Google sem "Male" explícito no nome são femininas por padrão (ex: "Google US English" = feminina)
        const isGoogleFemaleDefault = /^Google/i.test(name) && !/Male/i.test(name);

        const isMale = maleNames.test(name);
        const isFemale = femaleNames.test(name) || isGoogleFemaleDefault;

        if (lang.startsWith('en')) {
            // Inglês: bônus forte para vozes masculinas
            if (isMale) score += 25;
            if (isFemale) score -= 15;
        } else if (lang.startsWith('pt')) {
            // Português: bônus forte para vozes femininas
            if (isFemale) score += 25;
            if (isMale) score -= 15;
        }

        return {
            voice: voice,
            name: voice.name,
            lang: voice.lang,
            score: score,
            tier: tier,
            badge: badge,
            isLocal: voice.localService,
            id: `${voice.name} (${voice.lang})`
        };
    }

    /**
     * Alterna instantaneamente entre idiomas (ex: 'en-US', 'pt-BR'), recalculando e
     * elegendo a melhor voz nativa disponível.
     * @param {string} lang - Código do idioma desejado ('en-US' ou 'pt-BR')
     * @param {boolean} [silent=false] - Se true, não emite log ou callback de mudança (usado na inicialização)
     * @returns {Object|null} A voz campeã selecionada para o novo idioma
     */
    setLanguage(lang, silent = false) {
        const normalizedLang = lang.replace('_', '-');
        this.state.currentLang = normalizedLang;

        // Buscar lista de vozes catalogadas pelo código completo ou idioma base
        const fullLangKey = normalizedLang.toLowerCase();
        const baseLangKey = normalizedLang.split('-')[0].toLowerCase();

        let candidates = this.state.catalogedVoicesByLang[fullLangKey] || 
                         this.state.catalogedVoicesByLang[baseLangKey] || [];

        if (candidates.length === 0) {
            // Tentar busca flexível via filter na lista geral
            candidates = this.state.availableVoices
                .filter(v => v.lang.toLowerCase().includes(baseLangKey))
                .map(v => this._calculateVoiceScore(v))
                .sort((a, b) => b.score - a.score);
        }

        if (candidates && candidates.length > 0) {
            // A voz campeã está sempre no topo (índice 0) após a ordenação do algoritmo
            const champion = candidates[0];
            this.state.selectedVoice = champion;

            if (!silent) {
                console.log(`[VocalReaderModule] 🏆 Idioma alternado para [${normalizedLang}]. Voz Campeã Eleita:`, champion);
            }
            this.callbacks.onVoiceSelected(champion, candidates);
            return champion;
        } else {
            console.warn(`[VocalReaderModule] Aviso: Nenhuma voz nativa encontrada para "${normalizedLang}". Utilizando fallback padrão.`);
            this.state.selectedVoice = null;
            if (!silent) {
                this.callbacks.onVoiceSelected(null, []);
            }
            return null;
        }
    }

    /**
     * Permite overriding manual da voz selecionada pelo algoritmo
     * (Essencial para o Painel Inspetor de Voz permitir comparação entre vozes!)
     * @param {string|SpeechSynthesisVoice} voiceIdentifier - Nome, URI ou objeto da voz
     * @returns {Object|null} A nova voz selecionada
     */
    setVoice(voiceIdentifier) {
        if (!voiceIdentifier) return null;

        let found = null;
        if (typeof voiceIdentifier === 'string') {
            const allScored = this.getAvailableVoices(this.state.currentLang);
            found = allScored.find(v => v.name === voiceIdentifier || v.id === voiceIdentifier);
            if (!found) {
                // Tentar buscar em todos os idiomas se não achou no atual
                const allVoices = this.state.availableVoices;
                const rawVoice = allVoices.find(v => v.name === voiceIdentifier || v.voiceURI === voiceIdentifier);
                if (rawVoice) found = this._calculateVoiceScore(rawVoice);
            }
        } else if (voiceIdentifier instanceof SpeechSynthesisVoice) {
            found = this._calculateVoiceScore(voiceIdentifier);
        } else if (voiceIdentifier.voice instanceof SpeechSynthesisVoice) {
            found = voiceIdentifier;
        }

        if (found) {
            this.state.selectedVoice = found;
            console.log(`[VocalReaderModule] 🎯 Voz selecionada manualmente: ${found.name} (${found.score} pts)`);
            this.callbacks.onVoiceSelected(found, this.getAvailableVoices(this.state.currentLang));
            return found;
        }
        return null;
    }

    /**
     * Ajusta a velocidade de leitura (Rate)
     * @param {number} rate - Valor entre 0.5 e 2.0 (ex: 0.75 lento, 1.0 normal, 1.25 rápido)
     */
    setRate(rate) {
        const parsed = parseFloat(rate);
        if (!isNaN(parsed)) {
            // Clamping entre 0.5x e 2.0x para manter inteligibilidade acústica
            this.state.currentRate = Math.max(0.5, Math.min(2.0, parsed));
        }
    }

    /**
     * Ajusta o tom (Pitch) da voz
     * @param {number} pitch - Valor entre 0.5 e 1.5 (padrão 1.0)
     */
    setPitch(pitch) {
        const parsed = parseFloat(pitch);
        if (!isNaN(parsed)) {
            this.state.currentPitch = Math.max(0.5, Math.min(1.5, parsed));
        }
    }

    /**
     * Ajusta o volume da leitura
     * @param {number} volume - Valor entre 0.0 e 1.0 (padrão 1.0)
     */
    setVolume(volume) {
        const parsed = parseFloat(volume);
        if (!isNaN(parsed)) {
            this.state.currentVolume = Math.max(0.0, Math.min(1.0, parsed));
        }
    }

    /**
     * Lê o texto em voz alta utilizando a voz campeã selecionada.
     * Cancela qualquer leitura em andamento antes de iniciar (evita encavalamento).
     * @param {string} text - Texto a ser sintetizado e falado
     * @returns {boolean} Retorna true se iniciou com sucesso
     */
    speak(text) {
        if (!this.state.isSupported) {
            const err = { type: 'unsupported_browser', message: 'Navegador incompatível com síntese de voz.' };
            this.callbacks.onError(err);
            return false;
        }

        const cleanText = (text || '').trim();
        if (!cleanText) {
            console.warn('[VocalReaderModule] Aviso: Tentativa de leitura com texto vazio.');
            return false;
        }

        // 1. OBRIGATÓRIO: Cancelar leituras anteriores para não encavalar
        this.stop();

        // 2. Criar instância de SpeechSynthesisUtterance
        const utterance = new SpeechSynthesisUtterance(cleanText);

        // 3. Aplicar parâmetros acústicos (Rate, Pitch, Volume, Lang)
        utterance.rate = this.state.currentRate;
        utterance.pitch = this.state.currentPitch;
        utterance.volume = this.state.currentVolume;
        utterance.lang = this.state.currentLang;

        // 4. Tentar recarregar vozes no momento da fala caso o Chrome no file:// tenha retornado vazio na inicialização
        if (!this.state.isInitialized || !this.state.selectedVoice) {
            const voices = window.speechSynthesis.getVoices();
            if (voices && voices.length > 0) {
                this._catalogAndRankVoices(voices);
                this.state.isInitialized = true;
                this.setLanguage(this.state.currentLang, true);
                this.callbacks.onVoicesChanged(this.state.catalogedVoicesByLang);
            }
        }

        // Conectar a voz campeã (ou manual selecionada)
        if (this.state.selectedVoice && this.state.selectedVoice.voice) {
            utterance.voice = this.state.selectedVoice.voice;
        } else {
            console.warn('[VocalReaderModule] Aviso: Nenhuma voz específica eleita, usando voz padrão do sistema para', this.state.currentLang);
        }

        // 5. Vincular Callbacks de Eventos da Utterance
        utterance.onstart = (event) => {
            this.state.isPlaying = true;
            this.state.isPaused = false;
            this.state.startTime = performance.now();
            this._startTimer();
            console.log(`[VocalReaderModule] 🔊 Leitura iniciada: "${cleanText.substring(0, 40)}..."`);
            this.callbacks.onStart({
                text: cleanText,
                lang: this.state.currentLang,
                voice: this.state.selectedVoice,
                rate: this.state.currentRate,
                event: event
            });
        };

        utterance.onend = (event) => {
            this._cleanStateOnEnd();
            console.log('[VocalReaderModule] ✅ Leitura concluída com sucesso.');
            this.callbacks.onEnd({ event, text: cleanText });
        };

        utterance.onerror = (event) => {
            // Ignorar erros acionados voluntariamente pelo método .cancel() (interrupção pelo usuário)
            if (event.error === 'canceled' || event.error === 'interrupted') {
                this._cleanStateOnEnd();
                return;
            }
            this._cleanStateOnEnd();
            const errMsg = `Erro na síntese vocal: ${event.error || 'Erro desconhecido'}`;
            console.error(`[VocalReaderModule] ❌ ${errMsg}`, event);
            this.callbacks.onError({ type: 'synthesis_error', message: errMsg, event: event });
        };

        utterance.onpause = (event) => {
            this.state.isPaused = true;
            this._stopTimer();
            console.log('[VocalReaderModule] ⏸️ Leitura pausada.');
            this.callbacks.onPause({ event });
        };

        utterance.onresume = (event) => {
            this.state.isPaused = false;
            this._startTimer();
            console.log('[VocalReaderModule] ▶️ Leitura continuada.');
            this.callbacks.onResume({ event });
        };

        // EVENTO DE FRONTEIRA (Boundary): Captura cada palavra ou sentença sendo falada em tempo real!
        utterance.onboundary = (event) => {
            if (event.name === 'word' || event.name === 'sentence' || event.charIndex !== undefined) {
                const charIndex = event.charIndex || 0;
                const charLength = event.charLength || this._estimateWordLength(cleanText, charIndex);
                const currentWord = cleanText.substring(charIndex, charIndex + charLength);

                this.callbacks.onBoundary({
                    name: event.name || 'word',
                    charIndex: charIndex,
                    charLength: charLength,
                    word: currentWord,
                    elapsedTime: event.elapsedTime || (performance.now() - this.state.startTime),
                    originalEvent: event
                });
            }
        };

        // Armazenar referência da utterance para evitar garbage collection prematuro (bug conhecido do Chrome)
        this.state.currentUtterance = utterance;

        // 6. Disparar leitura através da engine do navegador
        try {
            window.speechSynthesis.speak(utterance);
            // Fix para bug do Chrome que pausa falas longas após ~15 segundos
            this._applyChromeLongSpeechFix();
            return true;
        } catch (err) {
            console.error('[VocalReaderModule] Erro crítico ao tentar executar speak():', err);
            this.callbacks.onError({ type: 'execution_error', message: err.message, error: err });
            return false;
        }
    }

    /**
     * Estima o comprimento da palavra com base no índice atual se a API não fornecer charLength
     * @private
     */
    _estimateWordLength(text, startIndex) {
        const remaining = text.substring(startIndex);
        const match = remaining.match(/^[^\s,.;:!?()"]+/);
        return match ? match[0].length : 1;
    }

    /**
     * Interrompe (cancela) imediatamente a leitura em curso.
     */
    stop() {
        if (!this.state.isSupported) return;
        
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending || this.state.isPlaying) {
            window.speechSynthesis.cancel();
            this._cleanStateOnEnd();
        }
    }

    /**
     * Pausa a leitura atual.
     */
    pause() {
        if (!this.state.isSupported) return;
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
            window.speechSynthesis.pause();
            this.state.isPaused = true;
            this._stopTimer();
        }
    }

    /**
     * Retoma a leitura previamente pausada.
     */
    resume() {
        if (!this.state.isSupported) return;
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
            this.state.isPaused = false;
            this._startTimer();
        }
    }

    /**
     * Retorna a lista de vozes disponíveis para o idioma especificado,
     * rigorosamente ordenadas por pontuação do algoritmo "Caçador de Vozes Neurais".
     * @param {string} [lang] - Código do idioma (ex: 'en-US', 'pt-BR'). Se omitido, retorna o idioma ativo.
     * @returns {Array<Object>} Lista de vozes enriquecidas com pontuação e badge
     */
    getAvailableVoices(lang = this.state.currentLang) {
        const normalizedLang = lang.replace('_', '-').toLowerCase();
        const baseLang = normalizedLang.split('-')[0];

        let list = this.state.catalogedVoicesByLang[normalizedLang] || 
                   this.state.catalogedVoicesByLang[baseLang] || [];

        if (list.length === 0 && this.state.availableVoices.length > 0) {
            list = this.state.availableVoices
                .filter(v => v.lang.toLowerCase().includes(baseLang))
                .map(v => this._calculateVoiceScore(v))
                .sort((a, b) => b.score - a.score);
        }

        // Marcar qual é a campeã ativa
        return list.map((item, idx) => ({
            ...item,
            isChampion: idx === 0,
            isSelected: this.state.selectedVoice && this.state.selectedVoice.voice === item.voice
        }));
    }

    /**
     * Retorna todas as vozes instaladas no navegador do usuário catalogadas e rankeadas
     * @returns {Array<Object>}
     */
    getAllVoicesRanked() {
        return this.state.availableVoices
            .map(v => this._calculateVoiceScore(v))
            .sort((a, b) => b.score - a.score);
    }

    /**
     * Retorna o estado atual completo do módulo
     * @returns {Object}
     */
    getStatus() {
        return {
            isSupported: this.state.isSupported,
            isInitialized: this.state.isInitialized,
            isPlaying: this.state.isPlaying,
            isPaused: this.state.isPaused,
            currentLang: this.state.currentLang,
            currentRate: this.state.currentRate,
            currentPitch: this.state.currentPitch,
            selectedVoice: this.state.selectedVoice,
            totalVoicesAvailable: this.state.availableVoices.length
        };
    }

    /**
     * Limpa temporizadores e redefine variáveis ao finalizar a leitura
     * @private
     */
    _cleanStateOnEnd() {
        this.state.isPlaying = false;
        this.state.isPaused = false;
        this.state.currentUtterance = null;
        this._stopTimer();
        if (this._chromeFixInterval) {
            clearInterval(this._chromeFixInterval);
            this._chromeFixInterval = null;
        }
    }

    /**
     * Inicia temporizador interno de acompanhamento de tempo de leitura
     * @private
     */
    _startTimer() {
        this._stopTimer();
        this.state.elapsedTimer = setInterval(() => {
            if (this.state.isPlaying && !this.state.isPaused) {
                const elapsed = performance.now() - this.state.startTime;
                this.callbacks.onTimeUpdate({
                    elapsedMs: elapsed,
                    elapsedFormatted: this._formatTime(elapsed)
                });
            }
        }, 100);
    }

    /**
     * Para o temporizador de tempo decorrido
     * @private
     */
    _stopTimer() {
        if (this.state.elapsedTimer) {
            clearInterval(this.state.elapsedTimer);
            this.state.elapsedTimer = null;
        }
    }

    /**
     * Formata tempo em milissegundos para MM:SS
     * @private
     */
    _formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    /**
     * Workaround para o bug conhecido da engine de TTS do Google Chrome,
     * onde leituras longas (> 15 segundos) congelam ou são interrompidas silenciosamente.
     * @private
     */
    _applyChromeLongSpeechFix() {
        if (this._chromeFixInterval) clearInterval(this._chromeFixInterval);
        this._chromeFixInterval = setInterval(() => {
            if (!this.state.isPlaying || this.state.isPaused) {
                clearInterval(this._chromeFixInterval);
                return;
            }
            if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
                try {
                    window.speechSynthesis.pause();
                    setTimeout(() => {
                        if (this.state.isPlaying && !this.state.isPaused) {
                            window.speechSynthesis.resume();
                        }
                    }, 50);
                } catch (e) {
                    console.warn('[VocalReaderModule] Workaround pause/resume falhou, ignorando.');
                }
            }
        }, 12000); // Executar micro pausa-retomada a cada 12 segundos
    }
}
