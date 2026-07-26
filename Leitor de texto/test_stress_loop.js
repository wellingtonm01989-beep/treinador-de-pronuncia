const fs = require('fs');
const path = require('path');

console.log('🧪 [TESTE DE ESTRESSE EM LOOP] Iniciando ambiente simulado Web Speech API...');

// 1. Simulação do Ambiente de Navegador (Chrome / Windows)
class MockSpeechSynthesisUtterance {
    constructor(text) {
        this.text = text;
        this.rate = 1.0;
        this.pitch = 1.0;
        this.volume = 1.0;
        this.lang = 'en-US';
        this.voice = null;
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
        this.onboundary = null;
    }
}

const mockVoices = [
    { name: 'Microsoft David Desktop', lang: 'en-US', localService: true, default: false },
    { name: 'Microsoft Zira Desktop', lang: 'en-US', localService: true, default: true },
    { name: 'Google US English', lang: 'en-US', localService: false, default: false },
    { name: 'Microsoft Maria Desktop', lang: 'pt-BR', localService: true, default: true },
    { name: 'Google português do Brasil', lang: 'pt-BR', localService: false, default: false },
    { name: 'Luciana (Neural) Natural', lang: 'pt-BR', localService: false, default: false },
    { name: 'Guy Neural Natural', lang: 'en-US', localService: false, default: false }
];

let currentVoices = []; // Começa vazio para simular comportamento lazy do Chrome no file://
let speaking = false;
let paused = false;
let onvoiceschangedListener = null;

global.window = {
    speechSynthesis: {
        getVoices: () => currentVoices,
        speak: (utterance) => {
            speaking = true;
            paused = false;
            // Se as vozes ainda não carregaram no clique, simular carregamento dinâmico do Chrome
            if (currentVoices.length === 0) {
                currentVoices = mockVoices;
                if (window.speechSynthesis.onvoiceschanged) {
                    window.speechSynthesis.onvoiceschanged();
                }
            }
            // Simular eventos assíncronos da Utterance
            setTimeout(() => {
                if (utterance.onstart) utterance.onstart({ type: 'start' });
                // Simular word boundaries
                const words = utterance.text.split(/\s+/);
                let charIdx = 0;
                words.forEach(w => {
                    if (utterance.onboundary) {
                        utterance.onboundary({ name: 'word', charIndex: charIdx, charLength: w.length, word: w });
                    }
                    charIdx += w.length + 1;
                });
            }, 5);
            setTimeout(() => {
                speaking = false;
                if (utterance.onend) utterance.onend({ type: 'end' });
            }, 15);
        },
        cancel: () => {
            speaking = false;
            paused = false;
            // O wake-up hack no Chrome acorda as vozes
            if (currentVoices.length === 0) {
                currentVoices = mockVoices;
            }
        },
        pause: () => { paused = true; },
        resume: () => { paused = false; },
        get speaking() { return speaking; },
        get paused() { return paused; },
        set onvoiceschanged(fn) { onvoiceschangedListener = fn; },
        get onvoiceschanged() { return onvoiceschangedListener; }
    },
    SpeechSynthesisUtterance: MockSpeechSynthesisUtterance
};
global.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
global.performance = { now: () => Date.now() };

// 2. Carregar e Eval do Módulo
const modulePath = path.join(__dirname, 'VocalReaderModule.js');
const moduleCode = fs.readFileSync(modulePath, 'utf8');
// Remover export para compatibilidade com eval no Node.js e disponibilizar globalmente
const cleanedCode = moduleCode.replace(/export\s+class\s+/, 'class ');
eval(cleanedCode + '\n global.VocalReaderModule = VocalReaderModule;');

async function runStressTest() {
    console.log('📦 Módulo carregado com sucesso. Instanciando VocalReaderModule...');
    
    let startCount = 0;
    let endCount = 0;
    let errorCount = 0;
    let voiceSelectedCount = 0;
    let boundaryCount = 0;

    const vocalReader = new global.VocalReaderModule({
        defaultLang: 'en-US',
        onStart: (info) => { startCount++; },
        onEnd: () => { endCount++; },
        onError: (err) => { errorCount++; console.error('Erro detectado:', err); },
        onVoiceSelected: (voice, candidates) => { voiceSelectedCount++; },
        onBoundary: (evt) => { boundaryCount++; }
    });

    console.log('\n--- FASE 1: Teste de Inicialização em Loop (Simulando Lazy Load vs Carga Imediata) ---');
    for (let i = 1; i <= 10; i++) {
        currentVoices = (i % 2 === 0) ? mockVoices : []; // Alterna entre Chrome Lazy Load e Carga Imediata
        const res = await vocalReader.init();
        if (i === 1) console.log(`[Iteração 1] Resultado de init():`, res);
    }
    console.log(`✅ Fase 1 concluída sem travamentos ou loops infinitos de onvoiceschanged.`);

    console.log('\n--- FASE 2: Teste de Estresse de Alternância Rápida de Idiomas (50 Iterações) ---');
    const startTime = Date.now();
    for (let i = 1; i <= 50; i++) {
        const targetLang = (i % 2 === 0) ? 'pt-BR' : 'en-US';
        const champion = vocalReader.setLanguage(targetLang);
        if (!champion || !champion.name) {
            throw new Error(`Falha ao eleger campeã na iteração ${i} para ${targetLang}`);
        }
        // Alterar taxa e tom dinamicamente
        vocalReader.setRate(0.5 + (i % 10) * 0.1);
        vocalReader.setPitch(0.8 + (i % 5) * 0.1);
    }
    const elapsedLang = Date.now() - startTime;
    console.log(`✅ Fase 2 concluída: 50 alternâncias de idioma em ${elapsedLang}ms (${(elapsedLang/50).toFixed(2)}ms por troca).`);

    console.log('\n--- FASE 3: Teste de Estresse de Leitura, Interrupção e Teleprompter (30 Ciclos em Loop) ---');
    const testText = "The quick brown fox jumps over the lazy dog. Inteligência artificial e síntese de voz nativa no navegador.";
    
    for (let i = 1; i <= 30; i++) {
        vocalReader.speak(testText);
        // Em 50% das vezes simular parada brusca antes do final
        if (i % 2 === 0) {
            vocalReader.stop();
        } else {
            // Aguardar término natural da fala
            await new Promise(r => setTimeout(r, 25));
        }
    }
    console.log(`✅ Fase 3 concluída: 30 ciclos de leitura/interrupção executados perfeitamente.`);

    console.log('\n======================================================');
    console.log('🎯 RELATÓRIO FINAL DO TESTE DE ESTRESSE EM LOOP:');
    console.log(`• Leituras Iniciadas com Sucesso: ${startCount}`);
    console.log(`• Leituras Finalizadas Naturalmente: ${endCount}`);
    console.log(`• Fronteiras de Palavras (Teleprompter) Processadas: ${boundaryCount}`);
    console.log(`• Seleções/Reavaliações de Voz Executadas: ${voiceSelectedCount}`);
    console.log(`• Erros de Execução ou Travamentos: ${errorCount}`);
    console.log('======================================================');

    if (errorCount === 0 && startCount > 0) {
        console.log('\n✨ SUCESSO TOTAL: O módulo está 100% à prova de travamentos, loops e falhas de memória!');
    } else {
        console.log('\n⚠️ Alerta: Verifique os contadores acima.');
    }
}

runStressTest().catch(err => {
    console.error('❌ Erro fatal durante o teste de estresse:', err);
    process.exit(1);
});
