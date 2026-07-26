const fs = require('fs');
const path = require('path');

// Mock do ambiente do navegador
global.window = {
    speechSynthesis: {
        getVoices: () => [
            { name: 'Microsoft Zira Desktop', lang: 'en-US', localService: true, default: true },
            { name: 'Microsoft David Desktop', lang: 'en-US', localService: true, default: false },
            { name: 'Google US English', lang: 'en-US', localService: false, default: false },
            { name: 'Microsoft Jenny Online (Natural)', lang: 'en-US', localService: false, default: false },
            { name: 'Microsoft Guy Online (Natural)', lang: 'en-US', localService: false, default: false },
            { name: 'Microsoft Maria Desktop', lang: 'pt-BR', localService: true, default: true },
            { name: 'Microsoft Daniel Desktop', lang: 'pt-BR', localService: true, default: false },
            { name: 'Microsoft Francisca Online (Natural)', lang: 'pt-BR', localService: false, default: false },
            { name: 'Google português do Brasil', lang: 'pt-BR', localService: false, default: false },
        ],
        speak: () => {}, cancel: () => {}, pause: () => {}, resume: () => {},
        speaking: false, paused: false, onvoiceschanged: undefined
    },
    SpeechSynthesisUtterance: class { constructor(t) { this.text=t; this.rate=1; this.pitch=1; this.volume=1; this.lang=''; this.voice=null; } }
};
global.SpeechSynthesisUtterance = window.SpeechSynthesisUtterance;
global.performance = { now: () => Date.now() };

const code = fs.readFileSync(path.join(__dirname, 'VocalReaderModule.js'), 'utf8').replace('class VocalReaderModule', 'global.VocalReaderModule = class VocalReaderModule');
eval(code);

const vr = new global.VocalReaderModule({ defaultLang: 'en-US' });
vr.init().then(r => {
    console.log('🇺🇸 EN-US Campeã:', r.selectedVoice.name, '|', r.selectedVoice.score, 'pts');
    vr.setLanguage('pt-BR', true);
    const s = vr.getStatus();
    console.log('🇧🇷 PT-BR Campeã:', s.selectedVoice.name, '|', s.selectedVoice.score, 'pts');
});
