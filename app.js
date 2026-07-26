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

    // Diagnósticos no Rodapé
    const diagRate = document.getElementById('diagRate');
    const diagChannels = document.getElementById('diagChannels');
    const diagCodec = document.getElementById('diagCodec');
    const diagSpeech = document.getElementById('diagSpeech');

    // Estado local da Transcrição
    let transcriptHistory = [];
    let animationFrameId = null;

    /**
     * 1. INICIALIZAÇÃO DO MÓDULO DE ÁUDIO (DEFESA EM CAMADAS)
     */
    const audioModule = new AudioCaptureModule({
        onStateChange: (state) => {
            updateUiState(state);
            updateDiagnostics();
        },
        onTranscript: ({ final, interim }) => {
            renderTranscript(final, interim);
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
            statusText.textContent = 'Capturando & Filtrando em Tempo Real';
            
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
            statusText.textContent = 'Gravação Concluída • Áudio Limpo e Pronto';
            
            btnRecord.disabled = false;
            btnRecord.className = 'btn btn-record';
            recordBtnText.textContent = 'Iniciar Gravação';
            audioLevelText.textContent = 'Nível: -∞ dB';
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
     * 3. RENDERIZAÇÃO DA TRANSCRIÇÃO EM TEMPO REAL
     */
    function renderTranscript(finalText, interimText) {
        if (placeholderText) placeholderText.style.display = 'none';

        if (finalText && !transcriptHistory.includes(finalText)) {
            transcriptHistory.push(finalText);
        }

        // Limpa e reconstrói o box para manter a ordem limpa do diálogo
        transcriptContent.innerHTML = '';

        // Renderiza blocos finalizados (Estilo Duolingo / Chat)
        transcriptHistory.forEach(text => {
            const div = document.createElement('div');
            div.className = 'transcript-final';
            div.textContent = text;
            transcriptContent.appendChild(div);
        });

        // Renderiza texto intermediário (em digitação/análise ao vivo)
        if (interimText) {
            const interimDiv = document.createElement('div');
            interimDiv.className = 'transcript-interim';
            interimDiv.textContent = interimText + ' ...';
            transcriptContent.appendChild(interimDiv);
        }

        // Rolagem automática suave para a última frase
        transcriptContent.scrollTop = transcriptContent.scrollHeight;
    }

    /**
     * 4. MANIPULAÇÃO DE ÁUDIO GRAVADO (AUDITORIA & DOWNLOAD)
     */
    function handleRecordingComplete(audioUrl, audioBlob, durationSec) {
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
        if (audioModule.isRecording) {
            audioModule.stopRecording();
            if ('vibrate' in navigator) {
                try { navigator.vibrate([50, 50, 50]); } catch(e) {}
            }
        } else {
            // Se já houver um áudio tocando, pausa
            audioPlayer.pause();
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

    // Botões Auxiliares da Transcrição
    btnCopy.addEventListener('click', () => {
        const fullText = transcriptHistory.join(' ');
        if (!fullText) return;

        navigator.clipboard.writeText(fullText).then(() => {
            const originalText = btnCopy.innerHTML;
            btnCopy.innerHTML = '<span>✅</span> <span>Copiado!</span>';
            setTimeout(() => btnCopy.innerHTML = originalText, 2000);
        });
    });

    btnClear.addEventListener('click', () => {
        transcriptHistory = [];
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

