// ===== GAME STATE =====
const STATE_KEY = 'pronunciation_trainer_v1';

let state = loadState();
let gameMode = 'practice';
let selectedTables = []; // Now stores selected batches
let questions = [];
let currentQuestion = 0;
let score = 0;
let streak = 0;
let maxStreak = 0;
let mistakes = [];
let questionTimes = [];
let questionStartTime = 0;
let timerInterval = null;
let timeLeft = 60;
let isAnswered = false;
let currentGameXP = 0;

// ===== INITIALIZATION =====
function loadState() {
    try {
        const raw = localStorage.getItem(STATE_KEY);
        if (raw) {
            const s = JSON.parse(raw);
            if (!s.version || s.version < 1) {
                s.version = 1;
            }
            if (s.unlockedBatches === undefined) s.unlockedBatches = 1;
            
            // Ensure all words from englishDatabase have an entry
            if (typeof englishDatabase !== 'undefined') {
                for (const item of englishDatabase) {
                    if (!s.progress[item.id]) {
                        s.progress[item.id] = { correct: 0, wrong: 0, streak: 0, avgTime: 0 };
                    }
                }
            }
            return s;
        }
    } catch (e) {
        console.warn('Could not load state:', e);
    }
    return createDefaultState();
}

function createDefaultState() {
    const progress = {};
    if (typeof englishDatabase !== 'undefined') {
        for (const item of englishDatabase) {
            progress[item.id] = { correct: 0, wrong: 0, streak: 0, avgTime: 0 };
        }
    }
    return {
        version: 1,
        xp: 0,
        level: 1,
        bestStreak: 0,
        totalGames: 0,
        progress: progress,
        lastActiveDate: '',
        dailyStreak: 0,
        unlockedBatches: 1
    };
}

function saveState() {
    try {
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Could not save state:', e);
    }
}

// ===== DAILY STREAK =====
function checkDailyStreak() {
    const today = new Date().toDateString();
    if (state.lastActiveDate) {
        const lastDate = new Date(state.lastActiveDate);
        const currentDate = new Date(today);
        const diffTime = Math.abs(currentDate - lastDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays > 1) {
            state.dailyStreak = 0;
        }
    }
}

function updateDailyStreak() {
    const today = new Date().toDateString();
    if (state.lastActiveDate !== today) {
        state.dailyStreak++;
        state.lastActiveDate = today;
        saveState();
    }
}

// ===== PARTICLES =====
function createParticles() {
    const container = document.getElementById('particles');
    const colors = ['#6366f1', '#8b5cf6', '#a855f7', '#6d28d9', '#4f46e5'];

    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const size = Math.random() * 4 + 2;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.animationDuration = (Math.random() * 15 + 10) + 's';
        particle.style.animationDelay = (Math.random() * 15) + 's';
        container.appendChild(particle);
    }
}

// ===== UI UPDATES =====
function updateHeaderStats() {
    document.getElementById('currentStreak').textContent = state.bestStreak;
    document.getElementById('dailyStreakValue').textContent = state.dailyStreak;
    document.getElementById('totalXP').textContent = formatNumber(state.xp);
    document.getElementById('playerLevel').textContent = state.level;
}

function formatNumber(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n;
}

function getXPForLevel(level) {
    return Math.floor(100 * Math.pow(1.5, level - 1));
}

function addXP(amount) {
    const oldLevel = state.level;
    state.xp += amount;

    let xpNeeded = getXPForLevel(state.level);
    while (state.xp >= xpNeeded) {
        state.xp -= xpNeeded;
        state.level++;
        xpNeeded = getXPForLevel(state.level);
    }

    if (state.level > oldLevel) {
        showLevelUp(state.level);
    }

    saveState();
    updateHeaderStats();
    return amount;
}

function showLevelUp(level) {
    // Simple alert or implement a proper modal later
    alert(`🎉 Parabéns! Você subiu para o Nível ${level}!`);
}

// ===== SCREEN MANAGEMENT =====
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    screen.classList.add('active');

    if (screenId === 'progressScreen') {
        renderProgressGrid();
    }

    if (screenId === 'selectScreen') {
        renderTableSelector();
    }
}

// ===== GAME MODES =====
function startMode(mode) {
    gameMode = mode;
    if (mode === 'marathon') {
        // Play with all unlocked batches
        selectedTables = [];
        for (let i = 1; i <= state.unlockedBatches; i++) {
            selectedTables.push(i);
        }
        startGame();
    } else {
        showScreen('selectScreen');
    }
}

// ===== BATCH SELECTOR =====
function renderTableSelector() {
    const container = document.getElementById('tableSelector');
    container.innerHTML = '';

    for (let i = 1; i <= state.unlockedBatches; i++) {
        const btn = document.createElement('button');
        btn.className = 'table-btn';
        btn.textContent = `Fase ${i}`;
        btn.dataset.batch = i;

        if (selectedTables.includes(i)) {
            btn.classList.add('selected');
        }

        btn.addEventListener('click', () => toggleTable(i, btn));
        container.appendChild(btn);
    }

    updateStartButton();
}

function toggleTable(num, btn) {
    const idx = selectedTables.indexOf(num);
    if (idx > -1) {
        selectedTables.splice(idx, 1);
        btn.classList.remove('selected');
    } else {
        selectedTables.push(num);
        btn.classList.add('selected');
    }
    updateStartButton();
}

function selectAllTables() {
    selectedTables = [];
    for (let i = 1; i <= state.unlockedBatches; i++) {
        selectedTables.push(i);
    }
    renderTableSelector();
}

function clearAllTables() {
    selectedTables = [];
    renderTableSelector();
}

function updateStartButton() {
    const btn = document.getElementById('btnStart');
    btn.disabled = selectedTables.length === 0;
}

// ===== QUESTION GENERATION =====
function generateQuestions() {
    questions = [];
    
    // Filter words by selected batches
    const availableWords = englishDatabase.filter(w => selectedTables.includes(w.batch));

    if (gameMode === 'marathon') {
        questions = shuffle([...availableWords]);
        return;
    }

    let targetCount = gameMode === 'practice' ? 15 : 40;

    const weightedPairs = availableWords.map(w => {
        const p = state.progress[w.id];
        const total = p.correct + p.wrong;
        let weight = 10;

        if (total > 0) {
            const errorRate = p.wrong / total;
            weight += errorRate * 50; 
            
            if (p.avgTime > 2.5) {
                weight += 20; 
            }
            
            if (p.streak === 0 && p.wrong > 0) {
                weight += 30; 
            }
            
            if (p.streak >= 4 && errorRate <= 0.15) {
                weight = 2; // Reduce if mastered
            }
        } else {
            weight = 20; // Unseen
        }

        return { pair: w, weight };
    });

    for (let i = 0; i < targetCount; i++) {
        if (weightedPairs.length === 0) break;
        let totalWeight = weightedPairs.reduce((sum, item) => sum + item.weight, 0);
        let randomValue = Math.random() * totalWeight;
        let selectedPair = null;

        for (const item of weightedPairs) {
            randomValue -= item.weight;
            if (randomValue <= 0) {
                selectedPair = item.pair;
                break;
            }
        }
        
        if (selectedPair) {
            questions.push(selectedPair);
        }
    }
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ===== GAME FLOW =====
function startGame() {
    if (selectedTables.length === 0) return;

    generateQuestions();
    if (questions.length === 0) return;

    currentQuestion = 0;
    score = 0;
    streak = 0;
    maxStreak = 0;
    mistakes = [];
    questionTimes = [];
    isAnswered = false;
    currentGameXP = 0;

    const timerBar = document.getElementById('timerBar');
    const modeLabel = document.getElementById('gameModeLabel');

    if (gameMode === 'practice') {
        modeLabel.textContent = '🎯 Praticar';
        timerBar.classList.remove('active');
    } else if (gameMode === 'challenge') {
        modeLabel.textContent = '⚡ Desafio Relâmpago';
        timerBar.classList.add('active');
        timeLeft = 60;
        updateTimerBar();
    } else {
        modeLabel.textContent = '🏆 Maratona';
        timerBar.classList.remove('active');
    }

    showScreen('gameScreen');
    showQuestion();

    if (gameMode === 'challenge') {
        startTimer();
    }
}

function showQuestion() {
    if (currentQuestion >= questions.length) {
        endGame();
        return;
    }

    const wordObj = questions[currentQuestion];
    document.getElementById('questionWord').textContent = wordObj.word;
    document.getElementById('questionTranslation').textContent = wordObj.translation;

    const total = gameMode === 'challenge' ? '∞' : questions.length;
    document.getElementById('gameCounter').textContent = `${currentQuestion + 1} / ${total}`;
    document.getElementById('scoreValue').textContent = score;

    const streakEl = document.getElementById('streakIndicator');
    if (streak >= 3) {
        streakEl.classList.add('visible');
        document.getElementById('streakCount').textContent = streak + ' seguidos!';
    } else {
        streakEl.classList.remove('visible');
    }

    const card = document.getElementById('questionCard');
    const feedback = document.getElementById('feedback');
    card.className = 'question-card';
    feedback.className = 'feedback';
    feedback.classList.remove('visible');
    isAnswered = false;

    stopListeningUI();
    questionStartTime = Date.now();
}

// ===== SPEECH RECOGNITION =====
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let lastInterimTranscript = "";

function logDebug(msg, type = 'info') {
    const now = new Date();
    const time = now.getHours().toString().padStart(2, '0') + ':' + 
                 now.getMinutes().toString().padStart(2, '0') + ':' + 
                 now.getSeconds().toString().padStart(2, '0') + '.' + 
                 now.getMilliseconds().toString().padStart(3, '0');
    console.log(`[${time}] [${type.toUpperCase()}] ${msg}`);
}

function startPronunciationChallenge() {
    if (isAnswered) return;
    
    const btn = document.getElementById('btnMic');
    const indicator = document.getElementById('listeningIndicator');
    const micText = document.querySelector('.mic-text');
    
    // Se já estiver ouvindo, forçamos a parada para avaliar o áudio
    if (btn.classList.contains('listening')) {
        logDebug("Botão clicado para PARAR manualmente", "warning");
        if (recognition) {
            try { recognition.stop(); } catch(e) { logDebug("Erro no stop(): " + e.message, "error"); }
        }
        stopListeningUI(); // Remove visual feedback immediately
        if (!isAnswered && lastInterimTranscript !== "") {
            logDebug("Avaliando lastInterimTranscript manual: " + lastInterimTranscript, "info");
            checkSpokenAnswer(lastInterimTranscript);
        }
        return;
    }
    
    logDebug("Botão clicado para INICIAR. Limpando interim...", "info");
    lastInterimTranscript = "";
    
    if (!SpeechRecognition) {
        alert("Seu navegador não suporta reconhecimento de voz (tente no Chrome ou Edge).");
        return;
    }
    
    // Força o descarte de qualquer instância presa anteriormente
    if (recognition) {
        try { recognition.abort(); } catch(e) {}
    }
    
    // Cria uma nova instância limpa a cada tentativa
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    
    btn.classList.add('listening');
    indicator.style.display = 'block';
    if (micText) micText.textContent = "Toque para parar";
    
    try {
        recognition.start();
        logDebug("recognition.start() chamado com sucesso", "success");
    } catch(e) { 
        logDebug("Exceção ao chamar recognition.start(): " + e.message, "error");
    }

    recognition.onstart = () => logDebug("API disparou: onstart", "info");
    recognition.onaudiostart = () => logDebug("API disparou: onaudiostart", "info");
    recognition.onsoundstart = () => logDebug("API disparou: onsoundstart", "info");
    recognition.onspeechstart = () => logDebug("API disparou: onspeechstart", "info");
    recognition.onspeechend = () => logDebug("API disparou: onspeechend", "info");
    recognition.onsoundend = () => logDebug("API disparou: onsoundend", "info");
    recognition.onaudioend = () => logDebug("API disparou: onaudioend", "info");
    recognition.onnomatch = () => logDebug("API disparou: onnomatch", "warning");

    recognition.onresult = (event) => {
        logDebug(`API disparou: onresult (qtd resultados: ${event.results.length})`, "info");
        if (isAnswered) return;
        
        const wordObj = questions[currentQuestion];
        const correctWord = wordObj.word.toLowerCase();
        
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript.toLowerCase().trim().replace(/[.,!?]/g, "");
            if (event.results[i].isFinal) {
                finalTranscript += transcript + " ";
            } else {
                interimTranscript += transcript + " ";
            }
        }
        
        finalTranscript = finalTranscript.trim();
        interimTranscript = interimTranscript.trim();
        if (interimTranscript) lastInterimTranscript = interimTranscript;
        
        const interimWords = interimTranscript.split(' ');
        const finalWords = finalTranscript.split(' ');
        
        // Auto-stop if the correct word is detected magically in real-time
        if (interimWords.includes(correctWord) || finalWords.includes(correctWord)) {
            checkSpokenAnswer(correctWord);
            try { recognition.stop(); } catch(e) {}
            return;
        }
        
        if (finalTranscript !== '') {
            checkSpokenAnswer(finalTranscript);
            try { recognition.stop(); } catch(e) {}
        }
    };

    recognition.onerror = (event) => {
        logDebug("API disparou: onerror -> " + event.error, "error");
        console.error("Speech error:", event.error);
        stopListeningUI();
        
        // Show error to the user visually
        const feedback = document.getElementById('feedback');
        const feedbackIcon = document.getElementById('feedbackIcon');
        const feedbackText = document.getElementById('feedbackText');
        
        feedback.className = 'feedback visible wrong';
        feedbackIcon.textContent = '⚠️';
        
        let errorMsg = "Erro no microfone.";
        if (event.error === 'not-allowed') errorMsg = "Permissão do microfone negada. Verifique as configurações do site.";
        if (event.error === 'no-speech') errorMsg = "Nenhum som detectado. Fale mais alto ou perto do microfone.";
        if (event.error === 'network') errorMsg = "Erro de rede ao usar o reconhecimento de voz do Google.";
        
        feedbackText.textContent = errorMsg;
    };

    recognition.onend = () => {
        logDebug("API disparou: onend", "info");
        stopListeningUI();
        if (!isAnswered) {
            logDebug("onend ocorreu, mas isAnswered=false. Exibindo erro.", "warning");
            const feedback = document.getElementById('feedback');
            const feedbackIcon = document.getElementById('feedbackIcon');
            const feedbackText = document.getElementById('feedbackText');
            
            feedback.className = 'feedback visible wrong';
            feedbackIcon.textContent = '⚠️';
            feedbackText.textContent = "Não entendi nada. Tente falar um pouco mais devagar e com clareza.";
        }
    };
}

function stopListeningUI() {
    const btn = document.getElementById('btnMic');
    const indicator = document.getElementById('listeningIndicator');
    const micText = document.querySelector('.mic-text');
    
    if (btn) btn.classList.remove('listening');
    if (indicator) indicator.style.display = 'none';
    if (micText) micText.textContent = "Pressione e Fale";
}

function checkSpokenAnswer(spokenWord) {
    if (isAnswered) return;
    isAnswered = true;
    stopListeningUI();
    
    const wordObj = questions[currentQuestion];
    const correctWord = wordObj.word.toLowerCase();
    
    // Very simple check
    const isCorrect = spokenWord === correctWord;
    const timeTaken = (Date.now() - questionStartTime) / 1000;
    
    questionTimes.push(timeTaken);
    
    // Update progress
    const key = wordObj.id;
    if (isCorrect) {
        state.progress[key].correct++;
        state.progress[key].streak++;
        const p = state.progress[key];
        p.avgTime = p.avgTime === 0 ? timeTaken : (p.avgTime * 0.7 + timeTaken * 0.3);
        score++;
        streak++;
        if (streak > maxStreak) maxStreak = streak;
        if (streak > state.bestStreak) state.bestStreak = streak;
    } else {
        state.progress[key].wrong++;
        state.progress[key].streak = 0;
        mistakes.push({ word: correctWord, yourAnswer: spokenWord });
        streak = 0;
    }

    checkBatchUnlock();

    if (gameMode === 'challenge') {
        let timeModifier = 0;
        if (isCorrect && timeTaken < 2.0) {
            timeModifier = 1.0;
            timeLeft += timeModifier;
        } else if (!isCorrect) {
            timeModifier = -2.0;
            timeLeft += timeModifier;
        }
        
        if (timeModifier !== 0) {
            showTimeModifierPopup(timeModifier);
        }
    }

    saveState();
    updateHeaderStats();
    
    const card = document.getElementById('questionCard');
    const feedback = document.getElementById('feedback');
    const feedbackIcon = document.getElementById('feedbackIcon');
    const feedbackText = document.getElementById('feedbackText');
    
    card.classList.add(isCorrect ? 'correct' : 'wrong');
    feedback.className = 'feedback visible ' + (isCorrect ? 'correct' : 'wrong');
    
    if (isCorrect) {
        feedbackIcon.textContent = '✓';
        feedbackText.textContent = getCorrectMessage(timeTaken, streak);
        const { xp, isCrit } = calculateQuestionXP(timeTaken, streak);
        currentGameXP += xp;
        showXPPopup(xp, isCrit);
    } else {
        feedbackIcon.textContent = '✗';
        if (spokenWord === '') {
            feedbackText.textContent = `Nenhum som detectado. O correto é "${correctWord}".`;
        } else {
            feedbackText.textContent = `Você disse "${spokenWord}". O correto é "${correctWord}".`;
        }
    }
    
    setTimeout(() => {
        if (isAnswered) nextQuestion();
    }, isCorrect ? 1000 : 2500);
}

function checkBatchUnlock() {
    const currentHighestBatch = state.unlockedBatches;
    if (currentHighestBatch >= 10) return; // Max
    
    const wordsInBatch = englishDatabase.filter(w => w.batch === currentHighestBatch);
    let masteredCount = 0;
    
    for (const w of wordsInBatch) {
        const p = state.progress[w.id];
        if (p) {
            const total = p.correct + p.wrong;
            if (total > 0) {
                const ratio = p.correct / total;
                if (ratio >= 0.85 && p.streak >= 4) {
                    masteredCount++;
                }
            }
        }
    }
    
    if (masteredCount >= 40) {
        state.unlockedBatches++;
        saveState();
        alert(`🎉 Parabéns! Seu domínio liberou a Fase ${state.unlockedBatches}!`);
    }
}

function getCorrectMessage(time, currentStreak) {
    if (time < 1.5 && currentStreak >= 5) return '🔥 Incrível! Pronúncia nativa!';
    if (time < 1.5) return '⚡ Excelente sotaque!';
    if (time < 3) return '🎯 Perfeito!';
    if (currentStreak >= 5) return '🔥 Sequência de fogo!';
    if (currentStreak >= 3) return '✨ Mandando bem!';
    return ['Correto!', 'Isso aí!', 'Muito bem!', 'Acertou!', 'Boa!'][Math.floor(Math.random() * 5)];
}

function calculateQuestionXP(time, currentStreak) {
    let xp = 10;
    if (time < 2) xp += 5;
    if (time < 1) xp += 10;
    xp += Math.min(currentStreak * 2, 20);
    
    let isCrit = false;
    if (currentStreak > 10 && time < 2.0 && Math.random() < 0.2) {
        const multiplier = Math.random() < 0.5 ? 2 : 3;
        xp *= multiplier;
        isCrit = true;
    }
    
    return { xp, isCrit };
}

function nextQuestion() {
    currentQuestion++;
    showQuestion();
}

// ===== TIMER (Challenge Mode) =====
function startTimer() {
    timerInterval = setInterval(() => {
        timeLeft -= 0.1;
        updateTimerBar();

        if (timeLeft <= 0) {
            timeLeft = 0;
            updateTimerBar();
            clearInterval(timerInterval);
            endGame();
        }
    }, 100);
}

function updateTimerBar() {
    const fill = document.getElementById('timerFill');
    const pct = (timeLeft / 60) * 100;
    fill.style.width = pct + '%';

    if (pct < 25) {
        fill.classList.add('warning');
    } else {
        fill.classList.remove('warning');
    }
}

// ===== END GAME =====
function endGame() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    stopListeningUI();

    state.totalGames++;

    const totalAnswered = score + mistakes.length;
    const accuracy = totalAnswered > 0 ? Math.round((score / totalAnswered) * 100) : 0;
    const avgTime = questionTimes.length > 0
        ? (questionTimes.reduce((a, b) => a + b, 0) / questionTimes.length).toFixed(1)
        : 0;

    let xpEarned = currentGameXP;
    xpEarned += maxStreak * 5;
    if (accuracy === 100 && totalAnswered >= 10) xpEarned += 50;
    if (accuracy >= 90) xpEarned += 20;

    const emoji = accuracy >= 90 ? '🏆' : accuracy >= 70 ? '🎉' : accuracy >= 50 ? '👍' : '💪';
    const title = accuracy >= 90 ? 'Excelente!' : accuracy >= 70 ? 'Muito Bem!' : accuracy >= 50 ? 'Bom trabalho!' : 'Continue praticando!';
    const subtitle = accuracy >= 90 ? 'Você está dominando o idioma!' : accuracy >= 70 ? 'Quase lá!' : 'A prática leva à perfeição!';

    document.getElementById('resultEmoji').textContent = emoji;
    document.getElementById('resultTitle').textContent = title;
    document.getElementById('resultSubtitle').textContent = subtitle;
    document.getElementById('resultCorrect').textContent = score;
    document.getElementById('resultWrong').textContent = mistakes.length;
    document.getElementById('resultAccuracy').textContent = accuracy + '%';
    document.getElementById('resultAvgTime').textContent = avgTime + 's';
    document.getElementById('xpAmount').textContent = xpEarned;

    const mistakesSection = document.getElementById('mistakesSection');
    const mistakesList = document.getElementById('mistakesList');
    mistakesList.innerHTML = '';

    if (mistakes.length > 0) {
        mistakesSection.style.display = 'block';
        for (const m of mistakes) {
            const item = document.createElement('div');
            item.className = 'mistake-item';
            item.innerHTML = `
                <span class="mistake-question">${m.word}</span>
                <span class="mistake-your-answer" style="color:var(--danger)">Você disse: ${m.yourAnswer || '(silêncio)'}</span>
            `;
            mistakesList.appendChild(item);
        }
    } else {
        mistakesSection.style.display = 'none';
    }

    addXP(xpEarned);
    updateDailyStreak();
    showScreen('resultScreen');

    if (accuracy >= 80) {
        launchConfetti();
    }

    document.getElementById('timerBar').classList.remove('active');
}

function restartGame() {
    startGame();
}

function quitGame() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    stopListeningUI();
    document.getElementById('timerBar').classList.remove('active');
    showScreen('menuScreen');
}

// ===== PROGRESS GRID =====
function renderProgressGrid() {
    const grid = document.getElementById('progressGrid');
    grid.innerHTML = '';
    
    // Adjust grid styles for word list
    grid.style.display = 'flex';
    grid.style.flexWrap = 'wrap';
    grid.style.gap = '8px';

    let mastered = 0, learning = 0, weak = 0;
    
    const availableWords = englishDatabase.filter(w => w.batch <= state.unlockedBatches);

    for (const w of availableWords) {
        const p = state.progress[w.id];
        const total = p ? (p.correct + p.wrong) : 0;
        let cls = 'weak';

        if (total > 0) {
            const ratio = p.correct / total;
            if (ratio >= 0.85 && p.streak >= 4) {
                cls = 'mastered';
                mastered++;
            } else if (ratio >= 0.5) {
                cls = 'learning';
                learning++;
            } else {
                cls = 'weak';
                weak++;
            }
        } else {
            weak++;
        }

        const cell = document.createElement('div');
        cell.className = 'progress-cell ' + cls;
        cell.textContent = w.word;
        cell.title = `${w.word} - ${w.translation}\nAcertos: ${p?.correct||0} | Erros: ${p?.wrong||0}`;
        cell.style.padding = '8px 12px';
        cell.style.borderRadius = '8px';
        grid.appendChild(cell);
    }

    document.getElementById('masteredCount').textContent = mastered;
    document.getElementById('learningCount').textContent = learning;
    document.getElementById('weakCount').textContent = weak;
}

function resetProgress() {
    if (confirm('Tem certeza? Todo o progresso será perdido!')) {
        state = createDefaultState();
        saveState();
        updateHeaderStats();
        renderProgressGrid();
    }
}

// ===== EFFECTS =====
function showXPPopup(amount, isCrit = false) {
    const popup = document.createElement('div');
    popup.className = 'xp-popup' + (isCrit ? ' critical' : '');
    popup.textContent = (isCrit ? 'CRÍTICO! +' : '+') + amount + ' XP';
    popup.style.left = (Math.random() * 60 + 20) + '%';
    popup.style.top = '40%';
    document.body.appendChild(popup);

    setTimeout(() => popup.remove(), 1000);
}

function showTimeModifierPopup(modifier) {
    const timerBar = document.getElementById('timerBar');
    if (!timerBar) return;

    const popup = document.createElement('div');
    popup.className = 'time-popup ' + (modifier > 0 ? 'positive' : 'negative');
    popup.textContent = (modifier > 0 ? '+' : '') + modifier.toFixed(1) + 's';
    
    popup.style.left = '50%';
    popup.style.top = '10px';
    
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1000);
}

function launchConfetti() {
    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.style.position = 'fixed';
        confetti.style.left = '50%';
        confetti.style.top = '50%';
        confetti.style.width = '10px';
        confetti.style.height = '10px';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
        confetti.style.zIndex = 1000;
        confetti.style.pointerEvents = 'none';

        const angle = Math.random() * Math.PI * 2;
        const velocity = 5 + Math.random() * 15;
        const tx = Math.cos(angle) * velocity * 20;
        const ty = Math.sin(angle) * velocity * 20;
        const rot = Math.random() * 360;

        confetti.animate([
            { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg)`, opacity: 0 }
        ], {
            duration: 1000 + Math.random() * 1000,
            easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
        }).onfinish = () => confetti.remove();
        
        document.body.appendChild(confetti);
    }
}

// ===== INITIALIZE =====
window.onload = () => {
    checkDailyStreak();
    updateHeaderStats();
    createParticles();
};
