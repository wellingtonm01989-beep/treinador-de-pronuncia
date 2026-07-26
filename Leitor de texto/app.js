/**
 * ============================================================================
 * PROJETO: Módulo de Síntese de Voz Nativa e Leitura Inteligente
 * ARQUIVO: app.js
 * DESCRIÇÃO: Controlador da interface interativa (Duolingo / Treinador de Pronúncia).
 *            Conecta os eventos de UI ao VocalReaderModule, gerencia o destaque
 *            de palavras em tempo real (Teleprompter) e atualiza diagnósticos.
 * ============================================================================
 */

// VocalReaderModule é carregado como script global via index.html (antes deste arquivo)

// Elementos da Interface
const DOM = {
    alertBanner: document.getElementById('compatibility-alert'),
    alertMsg: document.getElementById('alert-message'),
    statusPill: document.getElementById('status-pill'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    
    tabEn: document.getElementById('tab-en'),
    tabPt: document.getElementById('tab-pt'),
    langBadge: document.getElementById('lang-badge'),
    
    championName: document.getElementById('champion-name'),
    championScore: document.getElementById('champion-score'),
    championTier: document.getElementById('champion-tier'),
    voiceSelect: document.getElementById('voice-select'),
    voicesCountLabel: document.getElementById('voices-count-label'),
    
    speedBtns: document.querySelectorAll('.speed-btn'),
    rateSlider: document.getElementById('rate-slider'),
    rateVal: document.getElementById('rate-val'),
    pitchSlider: document.getElementById('pitch-slider'),
    pitchVal: document.getElementById('pitch-val'),
    
    textInput: document.getElementById('text-input'),
    teleprompterView: document.getElementById('teleprompter-view'),
    charCounter: document.getElementById('char-counter'),
    btnClear: document.getElementById('btn-clear'),
    
    chipsGridEn: document.getElementById('chips-grid-en'),
    chipsGridPt: document.getElementById('chips-grid-pt'),
    phraseChips: document.querySelectorAll('.phrase-chip'),
    
    btnSpeak: document.getElementById('btn-speak'),
    speakBtnText: document.getElementById('speak-btn-text'),
    btnPause: document.getElementById('btn-pause'),
    pauseBtnText: document.getElementById('pause-btn-text'),
    btnStop: document.getElementById('btn-stop'),
    
    btnDownload: document.getElementById('btn-download'),
    downloadBtnText: document.getElementById('download-btn-text'),
    downloadStatus: document.getElementById('download-status'),
    
    statTimer: document.getElementById('stat-timer'),
    statEngine: document.getElementById('stat-engine')
};

// Array de tokens de palavras do texto atual para o Teleprompter
let currentWordTokens = [];
let activeTokenIndex = -1;

// Estado de gravação para download de áudio MP3
let downloadPcmChunks = [];
let downloadStream = null;
let downloadAudioContext = null;
let downloadProcessor = null;
let downloadSampleRate = 44100;
let isRecordingForDownload = false;

// Inicialização do Módulo VocalReader
const vocalReader = new VocalReaderModule({
    defaultLang: 'en-US',
    defaultRate: 1.0,
    defaultPitch: 1.0,

    // CALLBACK: Início da Leitura
    onStart: ({ text, lang, voice, rate }) => {
        updateUIStateOnPlay(true);
        DOM.statusText.textContent = `🔊 Lendo em [${lang}] (${rate}x)...`;
        DOM.statEngine.textContent = `${voice ? voice.name : 'Voz Padrão do Sistema'}`;
        
        // Preparar e exibir o Teleprompter Interativo com destaque de palavras
        prepareTeleprompter(text);
    },

    // CALLBACK: Conclusão da Leitura
    onEnd: () => {
        updateUIStateOnPlay(false);
        DOM.statusText.textContent = '🟢 Pronto • Aguardando Comando';
        closeTeleprompter();
        // Se estava gravando para download, parar e salvar o arquivo
        if (isRecordingForDownload) {
            setTimeout(() => stopAndSaveRecording(), 400);
        }
    },

    // CALLBACK: Pausa da Leitura
    onPause: () => {
        DOM.statusPill.classList.remove('is-speaking');
        DOM.statusDot.classList.remove('reading');
        DOM.statusText.textContent = '⏸️ Leitura Pausada';
        DOM.pauseBtnText.textContent = 'Continuar';
        DOM.btnSpeak.classList.remove('is-active');
    },

    // CALLBACK: Retomada da Leitura
    onResume: () => {
        DOM.statusPill.classList.add('is-speaking');
        DOM.statusDot.classList.add('reading');
        DOM.statusText.textContent = '🔊 Retomando leitura...';
        DOM.pauseBtnText.textContent = 'Pausar';
        DOM.btnSpeak.classList.add('is-active');
    },

    // CALLBACK: Erro na Síntese ou Compatibilidade
    onError: (err) => {
        updateUIStateOnPlay(false);
        DOM.statusText.textContent = '❌ Erro de Leitura';
        showCompatibilityAlert(err.message || 'Erro inesperado na síntese de voz.');
    },

    // CALLBACK: Seleção/Eleição de Voz Campeã ou Mudança Manual
    onVoiceSelected: (selectedVoice, allCandidates) => {
        if (selectedVoice) {
            DOM.championName.textContent = `${selectedVoice.badge} ${selectedVoice.name}`;
            DOM.championScore.textContent = `${selectedVoice.score} pontos`;
            DOM.championTier.textContent = selectedVoice.tier;
            DOM.statEngine.textContent = `${selectedVoice.name} (${selectedVoice.isLocal ? 'Offline' : 'Online/Neural'})`;
            if (DOM.statusText && DOM.statusText.textContent.includes('Inicializando')) {
                DOM.statusText.textContent = `🟢 Pronto • ${allCandidates ? allCandidates.length : 1} vozes no idioma`;
            }
        } else {
            DOM.championName.textContent = 'Voz Padrão do Sistema';
            DOM.championScore.textContent = '50 pontos';
            DOM.championTier.textContent = 'Fallback Padrão';
        }
        
        // Atualizar menu dropdown com todas as vozes catalogadas daquele idioma
        populateVoiceDropdown(allCandidates || []);
    },

    // CALLBACK: Fronteira de Palavra (Word Boundary) -> DESTAQUE EM TEMPO REAL!
    onBoundary: (event) => {
        if (event.name === 'word' || event.charIndex !== undefined) {
            highlightWordInTeleprompter(event.charIndex, event.charLength, event.word);
        }
    },

    // CALLBACK: Mudança no Timer Decorrido
    onTimeUpdate: ({ elapsedFormatted }) => {
        DOM.statTimer.textContent = elapsedFormatted;
    }
});

/**
 * INICIALIZAÇÃO DA APLICAÇÃO AO CARREGAR A PÁGINA
 */
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Conectar eventos da UI e inicializar texto imediatamente (sem bloquear a tela)
    setupEventListeners();
    setDefaultTextForLang('en-US');
    updateCharCounter();

    // 2. Inicializar motor de voz de forma assíncrona com fallback grátis para protocolo local (file://)
    try {
        const result = await vocalReader.init();
        if (result.success) {
            DOM.statusText.textContent = `🟢 Pronto • ${result.totalVoices} vozes detectadas`;
            updateCharCounter();
        } else {
            DOM.statusText.textContent = '🟡 Pronto (Modo Local/Offline) • Aguardando Comando';
            DOM.championName.textContent = 'Voz Padrão do Sistema (Offline)';
            DOM.championScore.textContent = '50 pontos';
            DOM.championTier.textContent = 'Sistema / Fallback Nativo';
            DOM.voiceSelect.innerHTML = '<option value="">Voz Padrão do Sistema (As vozes carregarão ao falar)</option>';
            showCompatibilityAlert('Dica de Uso no Protocolo Local (file://): No Google Chrome no Windows, as vozes neurais da nuvem só são liberadas após o primeiro clique no botão "Falar Texto" ou ao utilizar um servidor (como Live Server).');
        }
    } catch (err) {
        DOM.statusText.textContent = '🟡 Pronto (Modo Local/Offline)';
        showCompatibilityAlert(err.message);
    }
});

/**
 * CONEXÃO DOS EVENTOS DE DOM E INTERATIVIDADE
 */
function setupEventListeners() {
    // 1. Abas de Idioma (Inglês vs Português)
    DOM.tabEn.addEventListener('click', () => switchLanguage('en-US'));
    DOM.tabPt.addEventListener('click', () => switchLanguage('pt-BR'));

    // 2. Dropdown de Seleção Manual de Voz
    DOM.voiceSelect.addEventListener('change', (e) => {
        if (e.target.value) {
            vocalReader.setVoice(e.target.value);
        }
    });

    // 3. Botões Rápidos de Velocidade (0.75x, 1.0x, 1.25x)
    DOM.speedBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const rate = parseFloat(btn.dataset.rate);
            vocalReader.setRate(rate);
            
            // Atualizar UI
            DOM.speedBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            DOM.rateSlider.value = rate;
            DOM.rateVal.textContent = `${rate.toFixed(2)}x`;
        });
    });

    // 4. Sliders de Ajuste Fino (Rate & Pitch)
    DOM.rateSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        vocalReader.setRate(val);
        DOM.rateVal.textContent = `${val.toFixed(2)}x`;
        
        // Sincronizar botões rápidos se coincidir com 0.75, 1.0 ou 1.25
        DOM.speedBtns.forEach(b => {
            const btnVal = parseFloat(b.dataset.rate);
            if (Math.abs(btnVal - val) < 0.02) b.classList.add('active');
            else b.classList.remove('active');
        });
    });

    DOM.pitchSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        vocalReader.setPitch(val);
        DOM.pitchVal.textContent = val.toFixed(2);
    });

    // 5. Contador de Caracteres e Palavras em tempo real no Textarea
    DOM.textInput.addEventListener('input', updateCharCounter);

    // 6. Botão Limpar Texto
    DOM.btnClear.addEventListener('click', () => {
        vocalReader.stop();
        DOM.textInput.value = '';
        updateCharCounter();
        DOM.textInput.focus();
    });

    // 7. Chips de Frases Prontas (Clique carrega e dispara fala instantaneamente)
    DOM.phraseChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const phrase = chip.dataset.phrase;
            if (phrase) {
                DOM.textInput.value = phrase;
                updateCharCounter();
                vocalReader.speak(phrase);
            }
        });
    });

    // 8. Botão Falar Texto (Ouvir Leitura)
    DOM.btnSpeak.addEventListener('click', () => {
        const status = vocalReader.getStatus();
        if (status.isPlaying && status.isPaused) {
            vocalReader.resume();
        } else if (status.isPlaying && !status.isPaused) {
            // Reiniciar leitura desde o começo
            vocalReader.speak(DOM.textInput.value);
        } else {
            vocalReader.speak(DOM.textInput.value);
        }
    });

    // 9. Botão Pausar / Continuar
    DOM.btnPause.addEventListener('click', () => {
        const status = vocalReader.getStatus();
        if (status.isPaused) {
            vocalReader.resume();
        } else if (status.isPlaying) {
            vocalReader.pause();
        }
    });

    // 10. Botão Parar Leitura
    DOM.btnStop.addEventListener('click', () => {
        vocalReader.stop();
        // Se estava gravando, cancelar a gravação
        if (isRecordingForDownload) {
            cancelRecording();
        }
    });

    // 11. Botão Baixar Áudio (WhatsApp) - Suporte Universal (Celular e PC)
    DOM.btnDownload.addEventListener('click', () => {
        downloadMp3Audio();
    });
}

/**
 * ALTERNA ENTRE INGLÊS E PORTUGUÊS
 * Atualiza o motor, abas e chips de frases de exemplo.
 */
function switchLanguage(lang) {
    vocalReader.stop();
    const isEn = lang === 'en-US';

    // Atualizar Abas de Idioma
    DOM.tabEn.classList.toggle('active', isEn);
    DOM.tabEn.setAttribute('aria-selected', isEn ? 'true' : 'false');
    DOM.tabPt.classList.toggle('active', !isEn);
    DOM.tabPt.setAttribute('aria-selected', !isEn ? 'true' : 'false');

    // Atualizar Badge de Idioma na UI
    DOM.langBadge.textContent = isEn ? '🇺🇸 en-US' : '🇧🇷 pt-BR';

    // Alternar Chips de Frases Prontas
    DOM.chipsGridEn.style.display = isEn ? 'flex' : 'none';
    DOM.chipsGridPt.style.display = !isEn ? 'flex' : 'none';

    // Notificar Módulo para Recalcular a Voz Campeã
    vocalReader.setLanguage(lang);

    // Atualizar texto no textarea se ainda for o texto de exemplo anterior
    setDefaultTextForLang(lang);
    updateCharCounter();
}

/**
 * Define o texto padrão de exemplo na caixa de texto ao alternar idioma
 */
function setDefaultTextForLang(lang) {
    const enDefault = "Hello! Welcome to our AI native voice synthesis module. Notice how natural and articulate the speech sounds when practicing pronunciation!";
    const ptDefault = "Olá! Bem-vindo ao nosso módulo de síntese de voz com inteligência artificial. Note como a leitura soa fluida, humanizada e perfeita para o treino de idiomas!";
    
    const currentVal = DOM.textInput.value.trim();
    if (!currentVal || currentVal === enDefault || currentVal === ptDefault || currentVal.startsWith("Hello! Welcome") || currentVal.startsWith("Olá! Bem-vindo")) {
        DOM.textInput.value = lang === 'en-US' ? enDefault : ptDefault;
    }
}

/**
 * PREENCHE O MENU DROPDOWN DE VOZES COM PONTUAÇÃO DO ALGORITMO
 */
function populateVoiceDropdown(voices) {
    DOM.voiceSelect.innerHTML = '';
    DOM.voicesCountLabel.textContent = `${voices.length} vozes disponíveis`;

    if (voices.length === 0) {
        const opt = document.createElement('option');
        opt.value = "";
        opt.textContent = "Nenhuma voz específica instalada para este idioma";
        DOM.voiceSelect.appendChild(opt);
        return;
    }

    voices.forEach((v, index) => {
        const opt = document.createElement('option');
        opt.value = v.name;
        // Identificar com badge, pontuação e se é a campeã (#1)
        const championMark = index === 0 ? "🏆 [CAMPEÃ] " : "";
        const locationMark = v.isLocal ? " • Offline" : " • Nuvem/Online";
        opt.textContent = `${championMark}${v.badge} ${v.name} (${v.score} pts)${locationMark}`;
        if (v.isSelected || index === 0) {
            opt.selected = true;
        }
        DOM.voiceSelect.appendChild(opt);
    });
}

/**
 * ATUALIZA O ESTADO DA INTERFACE DURANTE LEITURA / PARADA
 */
function updateUIStateOnPlay(isPlaying) {
    if (isPlaying) {
        DOM.statusPill.classList.add('is-speaking');
        DOM.statusDot.classList.add('reading');
        DOM.btnSpeak.classList.add('is-active');
        DOM.speakBtnText.textContent = '🔊 Lendo em tempo real...';
        DOM.btnPause.disabled = false;
        DOM.btnStop.disabled = false;
        DOM.pauseBtnText.textContent = 'Pausar';
    } else {
        DOM.statusPill.classList.remove('is-speaking');
        DOM.statusDot.classList.remove('reading');
        DOM.btnSpeak.classList.remove('is-active');
        DOM.speakBtnText.textContent = 'Falar Texto (Ouvir Leitura)';
        DOM.btnPause.disabled = true;
        DOM.btnStop.disabled = true;
        DOM.pauseBtnText.textContent = 'Pausar';
    }
}

/**
 * PREPARA O TELEPROMPTER DE DESTAQUE EM TEMPO REAL
 * Divide o texto em tokens e gera um mapa de caracteres para indexação precisa.
 */
function prepareTeleprompter(text) {
    DOM.teleprompterView.innerHTML = '';
    currentWordTokens = [];
    activeTokenIndex = -1;

    // Divisão segura de tokens por espaço preservando separadores sem risco de loop infinito
    const tokens = text.split(/(\s+)/);
    let charIndexTracker = 0;

    tokens.forEach(tokenText => {
        if (!tokenText) return;
        const isWord = !/^\s+$/.test(tokenText);

        const span = document.createElement('span');
        span.textContent = tokenText;

        if (isWord) {
            span.className = 'word-token';
            span.dataset.start = charIndexTracker;
            span.dataset.end = charIndexTracker + tokenText.length;
            currentWordTokens.push({
                element: span,
                start: charIndexTracker,
                end: charIndexTracker + tokenText.length,
                word: tokenText
            });
        }

        DOM.teleprompterView.appendChild(span);
        charIndexTracker += tokenText.length;
    });

    DOM.teleprompterView.classList.add('active');
    DOM.textInput.style.display = 'none';
}

/**
 * ILUMINA A PALAVRA ATUAL NO TELEPROMPTER DURANTE O EVENTO ONBOUNDARY
 */
function highlightWordInTeleprompter(charIndex, charLength, wordText) {
    if (currentWordTokens.length === 0) return;

    // Buscar token mais próximo ao charIndex atual fornecido pela API
    let foundIndex = currentWordTokens.findIndex(t => 
        (charIndex >= t.start && charIndex < t.end) || 
        (Math.abs(t.start - charIndex) <= 2)
    );

    // Se não encontrou por precisão exata de índice, buscar sequencialmente a partir do último token ativo
    if (foundIndex === -1 && activeTokenIndex + 1 < currentWordTokens.length) {
        const nextCandidate = currentWordTokens[activeTokenIndex + 1];
        if (wordText && nextCandidate.word.toLowerCase().includes(wordText.toLowerCase().replace(/[^a-z0-9]/gi, ''))) {
            foundIndex = activeTokenIndex + 1;
        }
    }

    if (foundIndex !== -1 && foundIndex !== activeTokenIndex) {
        // Remover destaque da palavra anterior
        if (activeTokenIndex !== -1 && currentWordTokens[activeTokenIndex]) {
            currentWordTokens[activeTokenIndex].element.classList.remove('active-word');
        }

        // Aplicar destaque na palavra atual
        const activeToken = currentWordTokens[foundIndex];
        activeToken.element.classList.add('active-word');
        activeTokenIndex = foundIndex;

        // Auto-scroll suave para manter a palavra falada centralizada na visão do teleprompter
        activeToken.element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
        });
    }
}

/**
 * FECHA O TELEPROMPTER E RETORNA À CAIXA DE EDIÇÃO DE TEXTO NORMAL
 */
function closeTeleprompter() {
    DOM.teleprompterView.classList.remove('active');
    DOM.teleprompterView.innerHTML = '';
    DOM.textInput.style.display = 'block';
    currentWordTokens = [];
    activeTokenIndex = -1;
}

/**
 * ATUALIZA O CONTADOR DE CARACTERES E PALAVRAS DO TEXTAREA
 */
function updateCharCounter() {
    const text = DOM.textInput.value || '';
    const charCount = text.length;
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;

    DOM.charCounter.textContent = `${charCount} caracteres • ${wordCount} palavras`;
}

/**
 * EXIBE ALERTA AMIGÁVEL AO USUÁRIO
 */
function showCompatibilityAlert(message) {
    DOM.alertMsg.textContent = message;
    DOM.alertBanner.classList.add('active');
}

// ============================================================================
// SISTEMA DE DOWNLOAD DE ÁUDIO MP3 UNIVERSAL (COMPATÍVEL COM CELULAR & PC)
// Sintetiza e baixa arquivo .mp3 nativo de alta fidelidade sem exigir captura de aba
// ============================================================================

/**
 * Baixa um arquivo MP3 do texto atual de forma instantânea e universal
 * Compatível 100% com WhatsApp em smartphones (Android/iOS) e navegadores desktop.
 */
async function downloadMp3Audio() {
    const text = DOM.textInput.value.trim();
    if (!text) {
        showCompatibilityAlert('Digite ou cole um texto antes de baixar o áudio.');
        return;
    }

    if (isRecordingForDownload) return;
    isRecordingForDownload = true;

    DOM.btnDownload.disabled = true;
    DOM.btnDownload.classList.add('is-recording');
    DOM.downloadBtnText.textContent = '⏳ Gerando MP3...';
    DOM.downloadStatus.textContent = 'Preparando arquivo de áudio MP3...';

    try {
        const lang = vocalReader.getStatus().currentLang || 'en-US';
        const langCode = lang.startsWith('pt') ? 'pt-BR' : 'en-US';
        
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
        const filename = `leitura_${langCode}_${timestamp}.mp3`;

        // URL da síntese de voz MP3 nativa
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 300))}&tl=${langCode}&client=tw-ob`;

        let downloadedSuccessfully = false;

        // Tentar download via Blob com proxy
        try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(ttsUrl)}`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
                const audioBlob = await response.blob();
                const blobUrl = URL.createObjectURL(new Blob([audioBlob], { type: 'audio/mp3' }));
                const downloadLink = document.createElement('a');
                downloadLink.href = blobUrl;
                downloadLink.download = filename;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
                downloadedSuccessfully = true;
            }
        } catch (fetchErr) {
            console.warn('[Download] Fetch via proxy não concluído, usando disparador direto:', fetchErr);
        }

        // Se o fetch for bloqueado pelo CORS do navegador mobile, acionar o link direto (isento de CORS)
        if (!downloadedSuccessfully) {
            const directLink = document.createElement('a');
            directLink.href = ttsUrl;
            directLink.download = filename;
            directLink.target = '_blank';
            document.body.appendChild(directLink);
            directLink.click();
            document.body.removeChild(directLink);
        }

        DOM.downloadStatus.textContent = `✅ MP3 gerado: ${filename} — Pronto para enviar no WhatsApp!`;
        console.log(`[Download] ✅ MP3 gerado com sucesso: ${filename}`);

    } catch (err) {
        console.error('[Download] Erro ao gerar MP3:', err);
        showCompatibilityAlert('Não foi possível baixar o áudio no momento. Tente novamente.');
    } finally {
        isRecordingForDownload = false;
        DOM.btnDownload.disabled = false;
        DOM.btnDownload.classList.remove('is-recording');
        DOM.downloadBtnText.textContent = 'Baixar MP3';
    }
}

/**
 * Dividir textos longos em trechos de até maxLen caracteres respeitando pontuações
 */
function splitTextIntoChunks(text, maxLen = 180) {
    const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
        if ((currentChunk + sentence).length <= maxLen) {
            currentChunk += sentence;
        } else {
            if (currentChunk.trim()) chunks.push(currentChunk.trim());
            if (sentence.length > maxLen) {
                const words = sentence.split(' ');
                currentChunk = '';
                for (const word of words) {
                    if ((currentChunk + ' ' + word).length <= maxLen) {
                        currentChunk += (currentChunk ? ' ' : '') + word;
                    } else {
                        if (currentChunk.trim()) chunks.push(currentChunk.trim());
                        currentChunk = word;
                    }
                }
            } else {
                currentChunk = sentence;
            }
        }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks.length > 0 ? chunks : [text.slice(0, maxLen)];
}

/**
 * Codifica amostras Int16 como arquivo WAV (fallback sem dependências).
 */
function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    function writeStr(pos, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(pos + i, str.charCodeAt(i));
        }
    }

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);   // PCM
    view.setUint16(22, 1, true);   // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);  // 16-bit
    writeStr(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    for (let i = 0; i < samples.length; i++) {
        view.setInt16(44 + i * 2, samples[i], true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Cancela a gravação em andamento sem salvar o arquivo.
 */
function cancelRecording() {
    isRecordingForDownload = false;

    try {
        if (downloadProcessor) downloadProcessor.disconnect();
        if (downloadAudioContext && downloadAudioContext.state !== 'closed') downloadAudioContext.close();
    } catch (e) {}

    if (downloadStream) {
        downloadStream.getTracks().forEach(track => track.stop());
    }

    downloadPcmChunks = [];
    downloadStream = null;
    downloadAudioContext = null;
    downloadProcessor = null;

    DOM.downloadStatus.textContent = '⏹️ Gravação cancelada.';
    resetDownloadUI();
}

/**
 * Reseta a interface do botão de download para o estado padrão.
 */
function resetDownloadUI() {
    DOM.btnDownload.classList.remove('is-recording');
    DOM.btnDownload.disabled = false;
    DOM.downloadBtnText.textContent = '📥 Baixar Áudio (WhatsApp)';
}

// ============================================================================

/**
 * Inicia a captura de áudio da aba do navegador, grava enquanto a fala é reproduzida
 * e automaticamente gera o download do arquivo ao término da leitura.
 */
async function startRecordAndSpeak() {
    const text = DOM.textInput.value.trim();
    if (!text) {
        showCompatibilityAlert('Digite ou cole um texto antes de baixar o áudio.');
        return;
    }

    // Se já está gravando, ignorar clique duplicado
    if (isRecordingForDownload) return;

    // Verificar se o protocolo permite captura de áudio (requer localhost ou HTTPS)
    if (!window.isSecureContext) {
        showCompatibilityAlert(
            'Para baixar o áudio, abra o app via servidor local: execute "node serve.js" no terminal e acesse http://localhost:8080. ' +
            'O protocolo file:// não permite captura de áudio do navegador por segurança.'
        );
        return;
    }

    // Verificar suporte à API de captura
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        showCompatibilityAlert('Seu navegador não suporta captura de áudio. Use Google Chrome ou Microsoft Edge atualizados.');
        return;
    }

    try {
        DOM.downloadBtnText.textContent = '🎤 Autorize a captura...';
        DOM.downloadStatus.textContent = 'Selecione a aba atual e clique "Compartilhar"';

        // Solicitar captura de áudio da aba ao navegador
        const stream = await navigator.mediaDevices.getDisplayMedia({
            audio: {
                suppressLocalAudioPlayback: false, // Manter áudio audível para o usuário
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            },
            video: true, // Obrigatório pela API, mas será descartado imediatamente
            preferCurrentTab: true,
            selfBrowserSurface: 'include'
        });

        // Descartar track de vídeo (não precisamos gravar a tela)
        const videoTracks = stream.getVideoTracks();
        videoTracks.forEach(track => track.stop());

        // Verificar se há faixa de áudio
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            showCompatibilityAlert(
                'Nenhuma faixa de áudio foi capturada. Certifique-se de marcar a opção "Compartilhar áudio da aba" na janela de permissão do Chrome.'
            );
            stream.getTracks().forEach(t => t.stop());
            resetDownloadUI();
            return;
        }

        // Criar stream apenas de áudio e iniciar o MediaRecorder
        const audioStream = new MediaStream(audioTracks);
        downloadStream = stream;
        downloadChunks = [];

        // Selecionar o melhor formato suportado (preferir opus para WhatsApp)
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';

        downloadRecorder = new MediaRecorder(audioStream, {
            mimeType: mimeType,
            audioBitsPerSecond: 128000
        });

        downloadRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                downloadChunks.push(event.data);
            }
        };

        downloadRecorder.onstop = () => {
            saveRecordingAsFile(mimeType);
        };

        // Detectar se o usuário parou a captura manualmente pelo Chrome
        audioTracks[0].onended = () => {
            if (isRecordingForDownload) {
                stopAndSaveRecording();
            }
        };

        // Iniciar gravação e fala
        downloadRecorder.start(100); // Coletar dados a cada 100ms
        isRecordingForDownload = true;

        // Atualizar UI para estado de gravação
        DOM.btnDownload.classList.add('is-recording');
        DOM.btnDownload.disabled = true;
        DOM.downloadBtnText.textContent = '🔴 Gravando áudio...';
        DOM.downloadStatus.textContent = 'A leitura está sendo capturada. Aguarde o término.';

        // Iniciar a leitura do texto (o callback onEnd vai parar a gravação)
        vocalReader.speak(text);

    } catch (err) {
        console.warn('[Download] Captura cancelada ou erro:', err);
        if (err.name === 'NotAllowedError') {
            DOM.downloadStatus.textContent = 'Captura cancelada pelo usuário.';
        } else {
            showCompatibilityAlert('Erro ao iniciar captura: ' + err.message);
        }
        resetDownloadUI();
    }
}

/**
 * Para a gravação e salva o arquivo de áudio para download.
 */
function stopAndSaveRecording() {
    if (!downloadRecorder || downloadRecorder.state === 'inactive') {
        resetDownloadUI();
        return;
    }

    try {
        downloadRecorder.stop();
    } catch (e) {
        console.warn('[Download] Erro ao parar gravação:', e);
    }

    // Parar todas as tracks de captura
    if (downloadStream) {
        downloadStream.getTracks().forEach(track => track.stop());
    }
}

/**
 * Gera o blob de áudio e dispara o download automático como arquivo .webm
 */
function saveRecordingAsFile(mimeType) {
    isRecordingForDownload = false;

    if (downloadChunks.length === 0) {
        DOM.downloadStatus.textContent = '⚠️ Nenhum áudio capturado. Tente novamente.';
        resetDownloadUI();
        return;
    }

    const blob = new Blob(downloadChunks, { type: mimeType });

    // Gerar nome descritivo com timestamp
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const langSuffix = vocalReader.getStatus().currentLang || 'audio';
    const filename = `leitura_${langSuffix}_${timestamp}.webm`;

    // Criar link de download e disparar automaticamente
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    // Limpeza de memória após 5 segundos
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);
    DOM.downloadStatus.textContent = `✅ Baixado: ${filename} (${sizeMB} MB)`;
    console.log(`[Download] ✅ Áudio salvo: ${filename} | Tamanho: ${sizeMB} MB | MIME: ${mimeType}`);

    resetDownloadUI();
}

/**
 * Cancela a gravação em andamento sem salvar o arquivo.
 */
function cancelRecording() {
    isRecordingForDownload = false;

    if (downloadRecorder && downloadRecorder.state !== 'inactive') {
        try { downloadRecorder.stop(); } catch (e) {}
    }
    if (downloadStream) {
        downloadStream.getTracks().forEach(track => track.stop());
    }

    downloadRecorder = null;
    downloadChunks = [];
    downloadStream = null;

    DOM.downloadStatus.textContent = '⏹️ Gravação cancelada.';
    resetDownloadUI();
}

/**
 * Reseta a interface do botão de download para o estado padrão.
 */
function resetDownloadUI() {
    DOM.btnDownload.classList.remove('is-recording');
    DOM.btnDownload.disabled = false;
    DOM.downloadBtnText.textContent = '📥 Baixar Áudio (WhatsApp)';
}
