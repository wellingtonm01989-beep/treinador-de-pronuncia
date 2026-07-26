/**
 * app.js
 * Controlador da interface da página de teste (UI Controller),
 * gerenciador de eventos DOM, animação do Canvas DSP e interatividade.
 */

import { AudioCaptureModule } from './AudioCaptureModule.js';

document.addEventListener('DOMContentLoaded', () => {
    // Referências DOM
    const btnRecord = document.getElementById('btnRecord');
    const recordBtnText = document.getElementById('recordBtnText');
    const btnPlay = document.getElementById('btnPlay');
    const audioPlayer = document.getElementById('audioPlayer');
    const playbackSection = document.getElementById('playbackSection');
    const btnDownload = document.getElementById('btnDownload');
    const durationChip = document.getElementById('durationChip');
    const timerDisplay = document.getElementById('timerDisplay');
    
    // Toggles de Auditoria DSP
    const toggleNative = document.getElementById('toggleNative');
    const boxNative = document.getElementById('boxNative');
    const toggleDsp = document.getElementById('toggleDsp');
    const boxDsp = document.getElementById('boxDsp');

    // Visualizador & Status
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const audioLevelText = document.getElementById('audioLevelText');
    const canvas = document.getElementById('audioVisualizer');
    const ctx = canvas.getContext('2d');

    // Transcrição
    const transcriptContent = document.getElementById('transcriptContent');
    const placeholderText = document.getElementById('placeholderText');
    const btnCopy = document.getElementById('btnCopy');
    const btnClear = document.getElementById('btnClear');
    const speechStatus = document.getElementById('speechStatus');
    const langSelector = document.getElementById('langSelector');

    // Diagnósticos no Rodapé
    const diagRate = document.getElementById('diagRate');
    const diagChannels = document.getElementById('diagChannels');
    const diagCodec = document.getElementById('diagCodec');
    const diagSpeech = document.getElementById('diagSpeech');

    // Terminal Ao Vivo (Audit Logs do Celular/PC)
    const liveLogBox = document.getElementById('liveLogBox');
    const btnCopyLogs = document.getElementById('btnCopyLogs');
    const btnClearLogs = document.getElementById('btnClearLogs');

    // Sistema de Interceptação de Logs na Tela
    function logToScreen(type, ...args) {
        if (!liveLogBox) return;
        const text = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
        const timeStr = new Date().toLocaleTimeString('pt-BR');
        
        let cssClass = 'log-info';
        if (type === 'warn' || text.includes('Aviso') || text.includes('warn')) cssClass = 'log-warn';
        else if (type === 'error' || text.includes('Erro') || text.includes('Falha') || text.includes('error')) cssClass = 'log-error';
        else if (text.includes('sucesso') || text.includes('iniciado') || text.includes('[SpeechRecognition]')) cssClass = 'log-success';
        else if (text.includes('[AudioCaptureModule]') || text.includes('[System]') || text.includes('[PWA]')) cssClass = 'log-sys';

        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.innerHTML = `<span class="log-time">[${timeStr}]</span> <span class="log-text ${cssClass}">${text}</span>`;
        
        liveLogBox.appendChild(entry);
        while (liveLogBox.children.length > 150) {
            liveLogBox.removeChild(liveLogBox.firstChild);
        }
        liveLogBox.scrollTop = liveLogBox.scrollHeight;
    }

    // Intercepta métodos nativos do console para capturar tudo na tela
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    const origDebug = console.debug;

    console.log = (...args) => { origLog.apply(console, args); logToScreen('log', ...args); };
    console.warn = (...args) => { origWarn.apply(console, args); logToScreen('warn', ...args); };
    console.error = (...args) => { origError.apply(console, args); logToScreen('error', ...args); };
    console.debug = (...args) => { origDebug.apply(console, args); logToScreen('debug', ...args); };

    if (btnCopyLogs) {
        btnCopyLogs.addEventListener('click', () => {
            const logsText = Array.from(liveLogBox.querySelectorAll('.log-entry')).map(el => el.textContent).join('\n');
            navigator.clipboard.writeText(logsText).then(() => {
                const oldTitle = btnCopyLogs.textContent;
                btnCopyLogs.textContent = '✅ Copiado!';
                setTimeout(() => btnCopyLogs.textContent = oldTitle, 2000);
            }).catch(() => alert('Não foi possível copiar os logs.'));
        });
    }

    if (btnClearLogs) {
        btnClearLogs.addEventListener('click', () => {
            liveLogBox.innerHTML = '<div class="log-entry"><span class="log-time">[' + new Date().toLocaleTimeString('pt-BR') + ']</span> <span class="log-text log-sys">🧹 Console limpo pelo usuário.</span></div>';
        });
    }

    // Log inicial de auditoria no carregamento da tela
    console.log(`[System] Dispositivo detectado: ${navigator.userAgent}`);
    console.log(`[System] Web Speech API (Transcrição): ${Boolean(window.SpeechRecognition || window.webkitSpeechRecognition) ? 'Suportado no Navegador ✅' : 'Não suportado ❌'}`);
    console.log(`[System] Web Audio API (DSP Frequência): ${Boolean(window.AudioContext || window.webkitAudioContext) ? 'Suportado ✅' : 'Não suportado ❌'}`);

    // Estado local da Transcrição
    let transcriptHistory = [];
    let sessionChunks = [];
    let pendingInterim = '';
    let lastConfidence = 96;
    let lastAlternatives = [];
    let isProcessingUnification = false;
    let animationFrameId = null;

    /**
     * 1. INICIALIZAÇÃO DO MÓDULO DE ÁUDIO (DEFESA EM CAMADAS & IA VOCAL)
     */
    const audioModule = new AudioCaptureModule({
        lang: langSelector ? langSelector.value : 'en-US',
        onStateChange: (state) => {
            updateUiState(state);
            updateDiagnostics();
        },
        onTranscript: ({ final, interim, confidence, alternatives, lang }) => {
            if (confidence) lastConfidence = confidence;
            if (alternatives && alternatives.length) lastAlternatives = alternatives;

            if (final && final.trim()) {
                const clean = final.trim();
                if (!sessionChunks.length) {
                    sessionChunks.push(clean);
                } else {
                    const last = sessionChunks[sessionChunks.length - 1];
                    if (clean.toLowerCase().startsWith(last.toLowerCase())) {
                        sessionChunks[sessionChunks.length - 1] = clean;
                    } else if (!last.toLowerCase().endsWith(clean.toLowerCase())) {
                        sessionChunks.push(clean);
                    }
                }
                pendingInterim = '';
            } else if (interim && interim.trim()) {
                pendingInterim = interim.trim();
            }

            renderLiveRecordingStatus();
        },
        onRecordingComplete: (audioUrl, audioBlob, durationSec) => {
            handleRecordingComplete(audioUrl, audioBlob, durationSec);
        },
        onError: (error, context) => {
            handleError(error, context);
        }
    });

    // Atualiza diagnósticos iniciais no rodapé
    updateDiagnostics();

    /**
     * 2. GERENCIAMENTO DE ESTADOS DA INTERFACE
     */
    function updateUiState(state) {
        if (state === 'initializing') {
            statusDot.className = 'status-dot active';
            statusText.textContent = 'Solicitando permissão ao microfone...';
            btnRecord.disabled = true;
            recordBtnText.textContent = 'Aguardando Permissão...';
        } 
        else if (state === 'recording') {
            // Vibração tátil ao iniciar (se suportado no dispositivo móvel)
            if (audioModule.durationSec === 0 && 'vibrate' in navigator) {
                try { navigator.vibrate(100); } catch(e) {}
            }

            statusDot.className = 'status-dot recording';
            statusText.textContent = 'Capturando & Filtrando em Tempo Real (Aguardando término para gerar texto único)';
            
            btnRecord.disabled = false;
            btnRecord.className = 'btn btn-record is-recording';
            recordBtnText.textContent = 'Parar Gravação';
            
            // Atualiza cronômetro
            const mins = String(Math.floor(audioModule.durationSec / 60)).padStart(2, '0');
            const secs = String(audioModule.durationSec % 60).padStart(2, '0');
            timerDisplay.textContent = `${mins}:${secs}`;

            // Remove placeholder de texto se for a primeira gravação
            if (placeholderText && placeholderText.parentElement) {
                placeholderText.style.display = 'none';
            }
        } 
        else if (state === 'stopped') {
            statusDot.className = 'status-dot active';
            statusText.textContent = 'Gravação Concluída • Texto Único Gerado';
            
            btnRecord.disabled = false;
            btnRecord.className = 'btn btn-record';
            recordBtnText.textContent = 'Iniciar Gravação';
            audioLevelText.textContent = 'Nível: -∞ dB';

            renderTranscriptArea();
        }
        else if (state === 'error') {
            statusDot.className = 'status-dot';
            statusText.textContent = 'Erro na Captura de Áudio';
            btnRecord.disabled = false;
            btnRecord.className = 'btn btn-record';
            recordBtnText.textContent = 'Tentar Novamente';
        }
    }

    /**
     * Renderização em Tempo Real (Mostra apenas indicativo de gravação ativa sem gerar cards intermediários)
     */
    function renderLiveRecordingStatus() {
        if (placeholderText && (transcriptHistory.length > 0 || sessionChunks.length > 0 || pendingInterim)) {
            placeholderText.style.display = 'none';
        }

        renderTranscriptArea(true);
    }

    /**
     * 3. RENDERIZAÇÃO DA TRANSCRIÇÃO FINAL UNIFICADA (1 ÚNICA LINHA POR GRAVAÇÃO)
     */
    function renderTranscriptArea(isLive = false) {
        transcriptContent.innerHTML = '';

        // 1. Renderiza os cards de frases finalizadas de gravações anteriores
        transcriptHistory.forEach(item => {
            const textStr = typeof item === 'string' ? item : item.text;
            const confVal = typeof item === 'string' ? 95 : item.confidence;
            const alts = typeof item === 'string' ? [] : item.alternatives;

            const div = document.createElement('div');
            div.className = 'transcript-final';
            
            const confClass = confVal < 88 ? 'medium' : '';
            div.innerHTML = `<div><span>${textStr}</span> <span class="transcript-confidence ${confClass}">🎯 ${confVal}% Confiança</span></div>`;
            
            if (alts && alts.length > 1) {
                const altsDiv = document.createElement('div');
                altsDiv.className = 'transcript-alts';
                altsDiv.innerHTML = `<span>💡 Outras percepções da IA:</span> ` + alts.slice(1).map(a => `<span class="alt-chip">${a.text} (${a.confidence}%)</span>`).join('');
                div.appendChild(altsDiv);
            }

            transcriptContent.appendChild(div);
        });

        // 2. Se estiver no meio de uma gravação ativa, exibe o preview do texto sendo acumulado em 1 único card temporário
        if (isLive && audioModule.isRecording) {
            const previewText = sessionChunks.concat(pendingInterim ? [pendingInterim] : []).join(' ').trim();
            const div = document.createElement('div');
            div.className = 'transcript-final live-updating';
            
            div.innerHTML = `<div><span>${previewText || 'Gravando fala...'}</span> <span style="font-size:0.75rem; color:var(--secondary); font-style:italic;">🔴 Capturando áudio...</span></div>`;
            transcriptContent.appendChild(div);
        }

        transcriptContent.scrollTop = transcriptContent.scrollHeight;
    }

    /**
     * 4. MANIPULAÇÃO DE ÁUDIO GRAVADO (AUDITORIA & DOWNLOAD)
     */
    function handleRecordingComplete(audioUrl, audioBlob, durationSec) {
        if (!audioUrl) {
            console.log('[App] Sessão de transcrição mobile concluída com êxito.');
            return;
        }
        // Habilita Botão 2 (Reproduzir)
        btnPlay.disabled = false;
        btnPlay.style.borderColor = 'var(--accent)';
        btnPlay.style.color = 'var(--accent)';
        
        // Configura Player Incorporado
        audioPlayer.src = audioUrl;
        playbackSection.classList.add('visible');
        durationChip.textContent = `Duração: ${durationSec}s | Tamanho: ${(audioBlob.size / 1024).toFixed(1)} KB`;

        // Configura Link Bônus de Download
        btnDownload.href = audioUrl;
        const timestamp = new Date().toISOString().slice(11, 19).replace(/:/g, '-');
        btnDownload.download = `VocalClean_DSP_${timestamp}.webm`;

        console.log('[App] Gravação finalizada e vinculada para auditoria.');
    }

    /**
     * 5. EVENTOS DOS BOTÕES PRINCIPAIS
     */
    btnRecord.addEventListener('click', () => {
        if (isProcessingUnification) return;

        if (audioModule.isRecording) {
            isProcessingUnification = true;
            audioModule.stopRecording();
            
            if ('vibrate' in navigator) {
                try { navigator.vibrate([50, 50, 50]); } catch(e) {}
            }

            // Exibe contagem regressiva de 2 segundos para compilação do texto único
            btnRecord.disabled = true;
            recordBtnText.textContent = '⏳ Unificando Texto (2s)...';
            statusDot.className = 'status-dot active';
            statusText.textContent = 'Aguardando 2 segundos para compilar e gerar um texto único...';

            setTimeout(() => {
                if (pendingInterim) {
                    const cleanInterim = pendingInterim.trim();
                    if (!sessionChunks.length || !sessionChunks.join(' ').includes(cleanInterim)) {
                        sessionChunks.push(cleanInterim);
                    }
                }

                // Une todas as frases e pausas de respiração em UM ÚNICO TEXTO FINAL
                const unifiedText = sessionChunks.join(' ').replace(/\s+/g, ' ').trim();
                
                if (unifiedText) {
                    const exists = transcriptHistory.some(item => (typeof item === 'string' ? item : item.text) === unifiedText);
                    if (!exists) {
                        transcriptHistory.push({
                            text: unifiedText,
                            confidence: lastConfidence || 96,
                            alternatives: lastAlternatives || []
                        });
                    }
                }

                // Limpa buffers da sessão
                sessionChunks = [];
                pendingInterim = '';
                isProcessingUnification = false;

                // Atualiza UI para estado finalizado
                updateUiState('stopped');
            }, 2000);
        } else {
            // Se já houver um áudio tocando, pausa
            audioPlayer.pause();
            sessionChunks = [];
            pendingInterim = '';
            isProcessingUnification = false;
            audioModule.startRecording();
        }
    });

    btnPlay.addEventListener('click', () => {
        if (!audioPlayer.src) return;

        if (audioPlayer.paused) {
            audioPlayer.play();
            btnPlay.innerHTML = '<span>⏸️</span> <span>Pausar Áudio</span>';
        } else {
            audioPlayer.pause();
            btnPlay.innerHTML = '<span>▶️</span> <span>Reproduzir Som Gravado</span>';
        }
    });

    audioPlayer.addEventListener('ended', () => {
        btnPlay.innerHTML = '<span>▶️</span> <span>Reproduzir Som Gravado</span>';
    });

    audioPlayer.addEventListener('pause', () => {
        btnPlay.innerHTML = '<span>▶️</span> <span>Reproduzir Som Gravado</span>';
    });

    // Auditoria de Filtros em Tempo Real (Toggles A/B)
    toggleNative.addEventListener('change', (e) => {
        audioModule.setNativeSuppression(e.target.checked);
        boxNative.classList.toggle('active', e.target.checked);
    });

    toggleDsp.addEventListener('change', (e) => {
        audioModule.setDspFilters(e.target.checked);
        boxDsp.classList.toggle('active', e.target.checked);
    });

    // Seletor Inteligente de Idiomas (Foco em Inglês/Multilingue)
    if (langSelector) {
        langSelector.addEventListener('change', (e) => {
            const newLang = e.target.value;
            audioModule.setLanguage(newLang);
            if (speechStatus) {
                const flagMap = { 'en-US': '🇺🇸 en-US', 'en-GB': '🇬🇧 en-GB', 'pt-BR': '🇧🇷 pt-BR', 'es-ES': '🇪🇸 es-ES', 'fr-FR': '🇫🇷 fr-FR' };
                speechStatus.textContent = `${flagMap[newLang] || newLang} Ativo`;
            }
        });
    }

    // Botões Auxiliares da Transcrição
    btnCopy.addEventListener('click', () => {
        const fullText = transcriptHistory.map(i => typeof i === 'string' ? i : i.text).join(' ');
        if (!fullText) return;

        navigator.clipboard.writeText(fullText).then(() => {
            const originalText = btnCopy.innerHTML;
            btnCopy.innerHTML = '<span>✅</span> <span>Copiado!</span>';
            setTimeout(() => btnCopy.innerHTML = originalText, 2000);
        });
    });

    btnClear.addEventListener('click', () => {
        transcriptHistory = [];
        currentSessionData = { text: '', isFinal: false, confidence: 96, alternatives: [] };
        transcriptContent.innerHTML = '';
        if (placeholderText) {
            placeholderText.style.display = 'flex';
            transcriptContent.appendChild(placeholderText);
        }
    });

    /**
     * 6. ATUALIZAÇÃO DO DIAGNÓSTICO DO SISTEMA
     */
    function updateDiagnostics() {
        const diag = audioModule.getDiagnostics();
        diagRate.textContent = `${diag.sampleRate} Hz`;
        diagChannels.textContent = `${diag.channelCount} (Mono)`;
        diagCodec.textContent = diag.mimeType || 'Padrão do Sistema';
        
        if (diag.speechRecognitionSupported) {
            speechStatus.textContent = '🇧🇷 pt-BR Ativo (Web Speech API)';
            speechStatus.className = 'badge green';
            diagSpeech.textContent = 'Nativo Suportado';
        } else {
            speechStatus.textContent = '⚠️ Transcrição Indisponível';
            speechStatus.className = 'badge';
            diagSpeech.textContent = 'Não Suportado no Navegador';
        }
    }

    /**
     * 7. VISUALIZADOR GRÁFICO EM TEMPO REAL (CANVAS DSP)
     */
    function drawVisualizer() {
        animationFrameId = requestAnimationFrame(drawVisualizer);

        const analyser = audioModule.getAnalyser();
        const width = canvas.width;
        const height = canvas.height;

        // Limpa o canvas com rastro sutil para suavidade de movimento
        ctx.fillStyle = 'rgba(5, 7, 14, 0.3)';
        ctx.fillRect(0, 0, width, height);

        if (!audioModule.isRecording || !analyser) {
            // Desenha onda de repouso (Onda senoidal respirando)
            ctx.beginPath();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
            const time = Date.now() * 0.002;
            for (let x = 0; x < width; x++) {
                const y = height / 2 + Math.sin(x * 0.02 + time) * 6;
                if (x === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
            return;
        }

        // Obtém os dados de frequência (espectro) do sinal DSP
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        // Obtém os dados de tempo (onda sonora para cálculo do RMS / Nível dB)
        const timeData = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(timeData);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            const amplitude = (timeData[i] - 128) / 128;
            sum += amplitude * amplitude;
        }
        const rms = Math.sqrt(sum / bufferLength);
        const db = rms > 0.001 ? Math.round(20 * Math.log10(rms)) : -100;
        audioLevelText.textContent = `Nível: ${db <= -90 ? '-∞' : db} dB`;

        // Renderiza Barras de Frequência DSP (Gráfico Espectro)
        const bars = 48; // Número de barras visíveis no gráfico
        const step = Math.floor(bufferLength * 0.5 / bars); // Foca no espectro vocal (até ~8kHz)
        const barWidth = (width / bars) - 3;

        for (let i = 0; i < bars; i++) {
            const value = dataArray[i * step] || 0;
            const percent = value / 255;
            const barHeight = Math.max(4, percent * (height - 20));
            const x = i * (barWidth + 3);
            const y = height - barHeight;

            // Gradiente dinâmico baseado na intensidade e frequência
            const gradient = ctx.createLinearGradient(0, height, 0, 0);
            if (i < bars * 0.3) {
                // Graves e médios (Esmeralda para Ciano)
                gradient.addColorStop(0, '#10b981');
                gradient.addColorStop(1, '#06b6d4');
            } else {
                // Agudos e altas frequências (Ciano para Violeta)
                gradient.addColorStop(0, '#06b6d4');
                gradient.addColorStop(1, '#6366f1');
            }

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
            ctx.fill();

            // Efeito de brilho no topo da barra em picos de voz
            if (percent > 0.6) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(x, y - 3, barWidth, 2);
            }
        }
    }

    // Inicia o loop de animação contínua do Canvas
    drawVisualizer();

    /**
     * 8. TRATAMENTO DE ERROS AMIGÁVEIS
     */
     function handleError(error, context) {
        console.error(`[App] Erro em [${context}]:`, error);
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            alert('⚠️ Acesso ao microfone negado! Por favor, autorize o microfone nas configurações do seu navegador para testar o módulo DSP.');
            statusText.textContent = '🚫 Microfone Bloqueado • Clique no Cadeado 🔒 na barra de endereços para Permitir';
            if (recordBtnText) recordBtnText.textContent = 'Permissão Negada';
            if (btnRecord) btnRecord.className = 'btn btn-record';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            alert('⚠️ Nenhum microfone detectado neste dispositivo!');
            statusText.textContent = '⚠️ Nenhum microfone encontrado no computador';
        } else if (context === 'speech_recognition' && error.message.includes('not-allowed')) {
            speechStatus.textContent = '🚫 Permissão de Voz Negada';
            speechStatus.className = 'badge';
        }
    }

    /**
     * 9. REGISTRO DE SERVICE WORKER (PWA OFFLINE READY)
     */
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('[PWA] Service Worker registrado com sucesso no escopo:', reg.scope))
            .catch(err => console.warn('[PWA] Falha ao registrar Service Worker:', err));
    }
});

