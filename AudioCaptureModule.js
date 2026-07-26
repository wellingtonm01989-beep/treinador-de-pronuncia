/**
 * AudioCaptureModule.js
 * Módulo ES6 Avançado para Captura Acústica, Filtragem DSP (Web Audio API),
 * Supressão de Ruído Nativa (WebRTC), Gravação em Memória e Transcrição de Voz (Web Speech API).
 * 
 * Arquitetura: 100% Client-Side / Zero Custo / PWA Ready.
 */

export class AudioCaptureModule {
    /**
     * @param {Object} options - Configurações e Callbacks de retorno
     * @param {Function} options.onStateChange - Callback chamado nas mudanças de estado (init, recording, stopped, error)
     * @param {Function} options.onTranscript - Callback para texto transcrito: (texto, isFinal) => {}
     * @param {Function} options.onRecordingComplete - Callback quando o áudio é salvo: (audioUrl, audioBlob, durationSec) => {}
     * @param {Function} options.onError - Callback de tratamento de erros: (error, context) => {}
     */
    constructor(options = {}) {
        this.onStateChange = options.onStateChange || (() => {});
        this.onTranscript = options.onTranscript || (() => {});
        this.onRecordingComplete = options.onRecordingComplete || (() => {});
        this.onError = options.onError || (() => {});
        this.lang = options.lang || 'en-US'; // Padrão inteligente em Inglês Americano para Treinador de Pronúncia

        // Estados do sistema
        this.isRecording = false;
        this.isPaused = false;
        this.startTime = 0;
        this.timerInterval = null;
        this.durationSec = 0;

        // Configurações dos Filtros (Iniciam ativados por padrão para máxima qualidade)
        this.nativeSuppressionEnabled = true;
        this.dspFiltersEnabled = true;

        // Instâncias das APIs Web
        this.stream = null;
        this.audioContext = null;
        this.mediaRecorder = null;
        this.speechRecognition = null;
        this.audioChunks = [];
        this.mimeType = '';

        // Nós do Web Audio API (DSP)
        this.sourceNode = null;
        this.highPassFilter = null;
        this.presenceBoost = null;
        this.lowPassFilter = null;
        this.compressorNode = null;
        this.analyserNode = null;
        this.destinationNode = null;

        // Compatibilidade de Speech Recognition
        this.hasSpeechRecognition = ('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window);
        this.initSpeechRecognition();
    }

    /**
     * Inicializa a API de Reconhecimento de Voz (Web Speech API)
     */
    initSpeechRecognition() {
        if (!this.hasSpeechRecognition) {
            console.warn('[AudioCaptureModule] Web Speech API não suportada neste navegador.');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.speechRecognition = new SpeechRecognition();
        
        // Configurações otimizadas para conversação contínua no PC e Celular
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.speechRecognition.lang = this.lang;
        this.speechRecognition.continuous = true;
        this.speechRecognition.interimResults = true;
        // No mobile, 1 alternativa reduz drasticamente a latência e evita timeouts em redes móveis (3G/4G/5G)
        this.speechRecognition.maxAlternatives = isMobile ? 1 : 5;

        this.speechRecognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            let bestConfidence = 0;
            let alternatives = [];

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const result = event.results[i];
                if (result.isFinal) {
                    finalTranscript += result[0].transcript;
                    bestConfidence = Math.round((result[0].confidence || 0.96) * 100);
                    for (let j = 0; j < result.length && j < 3; j++) {
                        if (result[j] && result[j].transcript) {
                            alternatives.push({
                                text: result[j].transcript.trim(),
                                confidence: Math.round((result[j].confidence || 0.90) * 100)
                            });
                        }
                    }
                } else {
                    interimTranscript += result[0].transcript;
                }
            }

            if (finalTranscript || interimTranscript) {
                this.onTranscript({
                    final: finalTranscript.trim(),
                    interim: interimTranscript.trim(),
                    confidence: bestConfidence,
                    alternatives: alternatives,
                    lang: this.lang
                });
            }
        };

        this.speechRecognition.onerror = (event) => {
            // Se o erro for apenas "no-speech" ou "aborted", não encerramos a gravação de áudio
            if (event.error === 'no-speech' || event.error === 'aborted') {
                console.log(`[SpeechRecognition] Evento normal de escuta/pausa (${event.error}).`);
                return;
            }
            console.error(`[SpeechRecognition] Exceção/Erro na Transcrição: ${event.error} (detalhe: ${event.message || 'sem detalhes adicionais'})`);
            // No mobile, erros transitórios de rede ou concorrência de áudio não devem desativar o módulo de gravação
            if (event.error !== 'aborted' && event.error !== 'service-not-allowed') {
                this.onError(new Error(`Erro de Transcrição: ${event.error}`), 'speech_recognition');
            }
        };

        // Reconhecimento de voz em navegadores como Chrome encerra automaticamente em silêncio.
        // Reativamos automaticamente se o usuário ainda estiver com a gravação ativa!
        this.speechRecognition.onend = () => {
            if (this.isRecording && !this.isPaused) {
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                setTimeout(() => {
                    if (this.isRecording && !this.isPaused) {
                        try {
                            this.speechRecognition.start();
                        } catch (e) {
                            console.warn(`[SpeechRecognition] Aviso na reativação automática (silêncio/pausa): ${e.message || e}`);
                        }
                    }
                }, isMobile ? 150 : 300);
            }
        };
    }

    /**
     * Determina o melhor formato de gravação de áudio suportado pelo navegador
     */
    getBestMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4',
            'audio/aac'
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return ''; // Retorna string vazia para usar o fallback padrão do navegador
    }

    /**
     * Inicia o fluxo de captura, constrói a cadeia DSP, o gravador em memória e a transcrição.
     */
    async startRecording() {
        if (this.isRecording) return;

        try {
            this.onStateChange('initializing');

            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

            // CAMADA 1: Supressão Nativa via MediaStream Constraints
            // CRÍTICO NO CELULAR: No Android e iOS, ativar echoCancellation ou noiseSuppression no getUserMedia
            // aciona o modo exclusivo de hardware (AudioSource.VOICE_COMMUNICATION no Android / Voice Processing no iOS),
            // o que FAZ O SISTEMA OPERACIONAL SILENCIAR COMPLETAMENTE o Google Web Speech API (SpeechRecognition)!
            // Por isso, no mobile, desativamos obrigatoriamente as constraints nativas do WebRTC,
            // usando o modo de microfone compartilhado (AudioSource.MIC) para que gravação e transcrição funcionem juntos.
            const useNativeSuppression = isMobile ? false : this.nativeSuppressionEnabled;

            const constraints = {
                audio: {
                    noiseSuppression: useNativeSuppression,
                    echoCancellation: useNativeSuppression,
                    autoGainControl: useNativeSuppression,
                    channelCount: 1, // Áudio mono é ideal para voz e processamento DSP
                    sampleRate: isMobile ? undefined : 48000
                },
                video: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);

            // CAMADA 2: Web Audio API & DSP de Frequência Vocal
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContextClass();
            
            // Em alguns navegadores, o contexto pode iniciar suspenso
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Nó de Entrada (Microfone)
            this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

            // Filtro Passa-Alta (High-Pass): ~80 Hz (Corta roncos, motores, vento, AC)
            this.highPassFilter = this.audioContext.createBiquadFilter();
            this.highPassFilter.type = 'highpass';
            this.highPassFilter.frequency.value = 80;
            this.highPassFilter.Q.value = 0.707; // Resposta Butterworth plana

            // Nó de Reforço de Presença Vocal (Peaking EQ): 2800 Hz (+3.5 dB)
            // Realça sibilantes e fricativas do Inglês (th, s, ch, sh, r) com máxima nitidez de estúdio
            this.presenceBoost = this.audioContext.createBiquadFilter();
            this.presenceBoost.type = 'peaking';
            this.presenceBoost.frequency.value = 2800;
            this.presenceBoost.Q.value = 1.0;
            this.presenceBoost.gain.value = 3.5;

            // Filtro Passa-Baixa (Low-Pass): ~8500 Hz (Preserva agudos consonantais do inglês)
            this.lowPassFilter = this.audioContext.createBiquadFilter();
            this.lowPassFilter.type = 'lowpass';
            this.lowPassFilter.frequency.value = 8500;
            this.lowPassFilter.Q.value = 0.707;

            // Compressor Dinâmico (Estabiliza ganho da voz em tempo real contra picos súbitos)
            this.compressorNode = this.audioContext.createDynamicsCompressor();
            this.compressorNode.threshold.value = -24; // dB
            this.compressorNode.knee.value = 30;       // Suavidade da transição
            this.compressorNode.ratio.value = 12;      // Taxa de compressão para voz firme
            this.compressorNode.attack.value = 0.003;  // Resposta rápida a picos (3ms)
            this.compressorNode.release.value = 0.25;  // Retorno suave (250ms)

            // Analisador de Espectro / Visualizador
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 2048;
            this.analyserNode.smoothingTimeConstant = 0.8;

            // Nó de Destino para Gravação Limpa
            this.destinationNode = this.audioContext.createMediaStreamDestination();

            // Aplica o roteamento baseado na configuração de DSP ativa
            this.updateRouting();

            // CAMADA 3: Gravação na Memória RAM (MediaRecorder API)
            this.mimeType = this.getBestMimeType();
            const recorderOptions = this.mimeType ? { mimeType: this.mimeType } : {};
            
            // Gravamos a partir do fluxo resultante do DestinationNode (já filtrado se o DSP estiver ON)
            this.mediaRecorder = new MediaRecorder(this.destinationNode.stream, recorderOptions);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { 
                    type: this.mimeType || 'audio/webm' 
                });
                const audioUrl = URL.createObjectURL(audioBlob);
                this.onRecordingComplete(audioUrl, audioBlob, this.durationSec);
            };

            // Inicia coleta de chunks a cada 250ms para precisão de memória
            this.mediaRecorder.start(250);

            // CAMADA 4 (Início da Transcrição): Após o getUserMedia abrir o microfone em modo compartilhado (MIC),
            // iniciamos a transcrição em 100ms para garantir que o fluxo de gravação esteja 100% ativo e sem conflito de hardware!
            if (this.speechRecognition) {
                console.log('[SpeechRecognition] Agendando disparo do motor de transcrição para 100ms...');
                setTimeout(() => {
                    if (this.isRecording && !this.isPaused) {
                        try {
                            console.log('[SpeechRecognition] Executando comando speechRecognition.start()...');
                            this.speechRecognition.start();
                            console.log('[SpeechRecognition] Comando .start() acionado sem exceções imediatas!');
                        } catch (e) {
                            console.error(`[SpeechRecognition] Exceção crítica ao executar .start(): ${e.message || e}`);
                        }
                    } else {
                        console.warn('[SpeechRecognition] Disparo cancelado: gravação foi pausada ou encerrada antes dos 100ms.');
                    }
                }, 100);
            } else {
                console.error('[SpeechRecognition] IMPOSSÍVEL iniciar transcrição: objeto speechRecognition é NULO (API não suportada ou desativada)!');
            }

            // Atualiza estados e cronômetro
            this.isRecording = true;
            this.startTime = Date.now();
            this.durationSec = 0;
            
            this.timerInterval = setInterval(() => {
                this.durationSec = Math.floor((Date.now() - this.startTime) / 1000);
                this.onStateChange('recording');
            }, 500);

            this.onStateChange('recording');

        } catch (error) {
            console.error('[AudioCaptureModule] Erro ao iniciar captura:', error);
            this.stopRecording();
            this.onError(error, 'initialization');
            this.onStateChange('error');
        }
    }

    /**
     * Roteia e conecta os nós DSP do Web Audio API de forma dinâmica
     * Permite teste A/B em tempo real (Filtros ON vs OFF)
     */
    updateRouting() {
        if (!this.audioContext || !this.sourceNode) return;

        // Desconecta todas as saídas do source e nós para evitar rotas duplicadas
        try {
            this.sourceNode.disconnect();
            this.highPassFilter.disconnect();
            if (this.presenceBoost) this.presenceBoost.disconnect();
            this.lowPassFilter.disconnect();
            this.compressorNode.disconnect();
            this.analyserNode.disconnect();
        } catch (e) {
            // Ignora erro caso algum nó ainda não estivesse conectado
        }

        if (this.dspFiltersEnabled) {
            // Rota Limpa (DSP Ativado):
            // Microfone -> HighPass (80Hz) -> Presence Boost (+3.5dB@2.8kHz) -> LowPass (8.5kHz) -> Compressor -> Analisador & Gravador
            this.sourceNode.connect(this.highPassFilter);
            if (this.presenceBoost) {
                this.highPassFilter.connect(this.presenceBoost);
                this.presenceBoost.connect(this.lowPassFilter);
            } else {
                this.highPassFilter.connect(this.lowPassFilter);
            }
            this.lowPassFilter.connect(this.compressorNode);
            
            // O analisador e o destino de gravação recebem o som limpo e estabilizado
            this.compressorNode.connect(this.analyserNode);
            this.compressorNode.connect(this.destinationNode);
            console.log('[AudioCaptureModule] DSP Roteado: FILTROS ATIVOS (80Hz - 8.5kHz + Presença Vocal + Compressor)');
        } else {
            // Rota Direta (DSP Desativado - Apenas áudio bruto/nativo):
            // Microfone -> Analisador & Gravador (sem passar pelos filtros biquad)
            this.sourceNode.connect(this.analyserNode);
            this.sourceNode.connect(this.destinationNode);
            console.log('[AudioCaptureModule] DSP Roteado: FILTROS DESATIVADOS (Áudio Direto)');
        }
    }

    /**
     * Alterna a supressão de ruído nativa (WebRTC Constraints) em tempo real ou na próxima captura
     * @param {boolean} enabled 
     */
    async setNativeSuppression(enabled) {
        this.nativeSuppressionEnabled = Boolean(enabled);
        console.log(`[AudioCaptureModule] Supressão Nativa (WebRTC) alterada para: ${this.nativeSuppressionEnabled}`);

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const useNativeSuppression = isMobile ? false : this.nativeSuppressionEnabled;

        // Se o fluxo estiver ativo, aplica as novas constraints em tempo real usando applyConstraints!
        if (this.stream && this.stream.getAudioTracks().length > 0) {
            const track = this.stream.getAudioTracks()[0];
            if (track && typeof track.applyConstraints === 'function') {
                try {
                    await track.applyConstraints({
                        noiseSuppression: useNativeSuppression,
                        echoCancellation: useNativeSuppression,
                        autoGainControl: useNativeSuppression
                    });
                    console.log('[AudioCaptureModule] Constraints nativas aplicadas à trilha ativa com sucesso!');
                } catch (err) {
                    console.warn('[AudioCaptureModule] Não foi possível alterar constraints nativas em tempo real no dispositivo/navegador atual:', err);
                }
            }
        }
    }

    /**
     * Alterna a filtragem de frequência vocal DSP (85Hz - 7kHz) em tempo real
     * @param {boolean} enabled 
     */
    setDspFilters(enabled) {
        this.dspFiltersEnabled = Boolean(enabled);
        if (this.isRecording) {
            this.updateRouting();
        }
    }

    /**
     * Altera o idioma de transcrição vocal em tempo real (ex: en-US, pt-BR, en-GB)
     * @param {string} lang 
     */
    setLanguage(lang) {
        this.lang = lang;
        console.log(`[AudioCaptureModule] Idioma de transcrição atualizado para: ${this.lang}`);
        if (this.speechRecognition) {
            this.speechRecognition.lang = this.lang;
            if (this.isRecording && !this.isPaused) {
                try {
                    this.speechRecognition.stop(); // O evento onend religará automaticamente o motor no novo idioma!
                } catch (e) {}
            }
        }
    }

    /**
     * Para completamente a gravação, libera hardware, memória e encerra transcrição
     */
    stopRecording() {
        if (!this.isRecording && !this.stream) return;

        this.isRecording = false;
        clearInterval(this.timerInterval);
        this.timerInterval = null;

        // Encerra Speech Recognition
        if (this.speechRecognition) {
            try {
                this.speechRecognition.stop();
            } catch (e) {
                // Ignore
            }
        }

        // Encerra MediaRecorder (isto acionará o evento onstop e o callback de complete)
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            try {
                this.mediaRecorder.stop();
            } catch (e) {
                console.warn('[AudioCaptureModule] Erro ao parar MediaRecorder:', e);
            }
        }

        // Desliga as trilhas de microfone (apaga o LED vermelho do navegador/sistema operacional)
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // Fecha e limpa o AudioContext para liberar memória e threads da CPU
        if (this.audioContext && this.audioContext.state !== 'closed') {
            try {
                this.audioContext.close();
            } catch (e) {
                console.warn('[AudioCaptureModule] Erro ao fechar AudioContext:', e);
            }
            this.audioContext = null;
        }

        this.onStateChange('stopped');
    }

    /**
     * Retorna o nó analisador de áudio atual para renderização no Canvas
     * @returns {AnalyserNode|null}
     */
    getAnalyser() {
        return this.analyserNode;
    }

    /**
     * Retorna se a transcrição de voz é suportada neste ambiente
     * @returns {boolean}
     */
    isSpeechSupported() {
        return this.hasSpeechRecognition;
    }

    /**
     * Retorna estatísticas de diagnóstico da sessão atual
     */
    getDiagnostics() {
        const track = this.stream ? this.stream.getAudioTracks()[0] : null;
        const settings = track ? track.getSettings() : {};
        return {
            isRecording: this.isRecording,
            durationSec: this.durationSec,
            mimeType: this.mimeType || 'default (audio/webm ou aac)',
            sampleRate: this.audioContext ? this.audioContext.sampleRate : (settings.sampleRate || 'N/A'),
            channelCount: settings.channelCount || 1,
            nativeSuppression: this.nativeSuppressionEnabled,
            dspFilters: this.dspFiltersEnabled,
            speechRecognitionSupported: this.hasSpeechRecognition
        };
    }
}
