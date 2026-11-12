// ==========================================================================
// STATE, DIRECTED WIN GRAPH & 1ST-ORDER MARKOV CHAIN ORACLE
// ==========================================================================
const allWeapons = ["rock", "paper", "scissor", "pan", "crown"];

// Directed Graph: Each emblem defeats the 2 emblems in its array
const winGraph = {
    rock: ["scissor", "pan"],       // Rock crushes Scissor & dents Frying Pan
    paper: ["rock", "crown"],       // Paper wraps Rock & covers Royal Crown
    scissor: ["paper", "crown"],    // Scissor cuts Paper & snips Crown ribbon
    pan: ["paper", "scissor"],      // Frying Pan flattens Paper & smashes Scissor
    crown: ["rock", "pan"]          // Royal Crown outranks Rock & commands Frying Pan
};

const weaponMeta = {
    rock: { label: "ROCK", icon: "fa-gem" },
    paper: { label: "PAPER", icon: "fa-scroll" },
    scissor: { label: "SCISSOR", icon: "fa-hand-scissors" },
    pan: { label: "FRYING PAN", icon: "fa-utensils" },
    crown: { label: "CROWN", icon: "fa-crown" }
};

let useMarkovAI = true;
let royal5Mode = false;
let lastUserMove = null;
let roundNumber = 0;

// Sundrop Light Integrity (HP)
let userHP = 100;
let aiHP = 100;

let savedStats = JSON.parse(localStorage.getItem("suhani_sps_stats")) || {
    userScore: 0,
    computerScore: 0,
    drawScore: 0,
    bestStreak: 0
};
let userScore = savedStats.userScore;
let computerScore = savedStats.computerScore;
let drawScore = savedStats.drawScore;
let bestStreak = savedStats.bestStreak;
let currentStreak = 0;
let isMuted = JSON.parse(localStorage.getItem("suhani_sps_muted")) || false;

// 1st-Order Markov Transition Matrix
let transitionMatrix = {};
const initMarkovMatrix = () => {
    allWeapons.forEach(w1 => {
        transitionMatrix[w1] = {};
        allWeapons.forEach(w2 => {
            transitionMatrix[w1][w2] = 1; // Laplace uniform prior
        });
    });
};
initMarkovMatrix();

// DOM Elements
const choicesGrid = document.getElementById("choices-grid");
const choices = document.querySelectorAll(".choice");
const expansionWeapons = document.querySelectorAll(".expansion-weapon");
const msg = document.getElementById("msg");
const userScorePara = document.getElementById("user-score");
const computerScorePara = document.getElementById("computer-score");
const drawScorePara = document.getElementById("draw-score");
const streakCountEl = document.getElementById("streak-count");
const bestStreakEl = document.getElementById("best-streak");

const userHpBar = document.getElementById("user-hp-bar");
const aiHpBar = document.getElementById("ai-hp-bar");
const userHpText = document.getElementById("user-hp-text");
const aiHpText = document.getElementById("ai-hp-text");
const dmgBadge = document.getElementById("dmg-badge");

const probBar = document.getElementById("prob-bar");
const aiReadoutTag = document.getElementById("ai-readout-tag");
const combatLogList = document.getElementById("combat-log-list");

const userPickedIcon = document.getElementById("user-picked-icon");
const userPickedName = document.getElementById("user-picked-name");
const aiPickedIcon = document.getElementById("ai-picked-icon");
const aiPickedName = document.getElementById("ai-picked-name");
const userCard = document.getElementById("user-card");
const aiCard = document.getElementById("ai-card");

const matchModal = document.getElementById("match-modal");
const modalTitle = document.getElementById("modal-title");
const modalSub = document.getElementById("modal-sub");
const nextBoutBtn = document.getElementById("next-bout-btn");

const soundToggleBtn = document.getElementById("sound-toggle");
const soundIcon = document.getElementById("sound-icon");
const soundLabel = document.getElementById("sound-label");

// Sync Initial Scores
userScorePara.innerText = userScore;
computerScorePara.innerText = computerScore;
drawScorePara.innerText = drawScore;
bestStreakEl.innerText = bestStreak;

const saveStats = () => {
    localStorage.setItem("suhani_sps_stats", JSON.stringify({
        userScore, computerScore, drawScore, bestStreak
    }));
};

// ==========================================================================
// MAGICAL HARP & CELESTA WEB AUDIO SYNTHESIZER
// ==========================================================================
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

const initAudio = () => {
    if (!audioCtx && AudioContextClass) audioCtx = new AudioContextClass();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
};

const playChime = (freq, duration = 0.2, delay = 0, vol = 0.09, type = "sine") => {
    if (isMuted) return;
    initAudio();
    if (!audioCtx) return;

    const start = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + duration);
};

const sfx = {
    deploy: () => playChime(587.33, 0.14, 0, 0.09, "triangle"),
    win: () => {
        [523.25, 659.25, 783.99, 1046.50].forEach((f, idx) => {
            playChime(f, 0.24, idx * 0.07, 0.1, "triangle");
        });
    },
    lose: () => {
        playChime(392.00, 0.2, 0, 0.09, "sine");
        playChime(329.63, 0.28, 0.15, 0.09, "sine");
    },
    draw: () => {
        playChime(440, 0.15, 0, 0.08, "sine");
        playChime(440, 0.18, 0.14, 0.08, "sine");
    },
    uiClick: () => playChime(783.99, 0.08, 0, 0.07, "sine")
};

const applyMuteUI = () => {
    soundToggleBtn.classList.toggle("muted", isMuted);
    soundIcon.className = isMuted ? "fas fa-volume-mute" : "fas fa-music";
    soundLabel.innerText = isMuted ? "CHIMES: OFF" : "CHIMES: ON";
};
applyMuteUI();

soundToggleBtn.addEventListener("click", () => {
    isMuted = !isMuted;
    localStorage.setItem("suhani_sps_muted", JSON.stringify(isMuted));
    applyMuteUI();
    if (!isMuted) sfx.win();
});

// ==========================================================================
// MARKOV CHAIN ORACLE PREDICTION ENGINE
// ==========================================================================
const getActivePool = () => royal5Mode ? allWeapons : ["rock", "paper", "scissor"];

const predictAndCounter = () => {
    const pool = getActivePool();

    if (!useMarkovAI || !lastUserMove) {
        aiReadoutTag.innerText = useMarkovAI ? "GATHERING STARLIGHT..." : "PASCAL RNG ACTIVE";
        return pool[Math.floor(Math.random() * pool.length)];
    }

    const counts = transitionMatrix[lastUserMove];
    let total = 0;
    pool.forEach(w => { total += counts[w]; });

    let mostLikelyUserMove = pool[0];
    let highestProb = -1;

    probBar.innerHTML = "";
    pool.forEach(w => {
        const prob = counts[w] / total;
        const pct = Math.round(prob * 100);
        if (prob > highestProb) {
            highestProb = prob;
            mostLikelyUserMove = w;
        }

        const seg = document.createElement("div");
        seg.className = `prob-seg seg-${w}`;
        seg.style.width = `${pct}%`;
        seg.innerText = `${weaponMeta[w].label.slice(0, 4)} ${pct}%`;
        probBar.appendChild(seg);
    });

    const counters = pool.filter(candidate => winGraph[candidate].includes(mostLikelyUserMove));
    const chosenCounter = counters[Math.floor(Math.random() * counters.length)];

    aiReadoutTag.innerText = `DIVINED: ${weaponMeta[mostLikelyUserMove].label} (${Math.round(highestProb * 100)}%) → COUNTER: ${weaponMeta[chosenCounter].label}`;
    return chosenCounter;
};

// ==========================================================================
// CORE DUEL RESOLUTION & SUNDROP LIGHT HP BARS
// ==========================================================================
const updateHPUI = () => {
    userHpBar.style.width = `${userHP}%`;
    aiHpBar.style.width = `${aiHP}%`;
    userHpText.innerText = `${userHP}% LIGHT`;
    aiHpText.innerText = `${aiHP}% LIGHT`;
};

const addCombatLog = (text) => {
    const li = document.createElement("li");
    li.innerHTML = text;
    combatLogList.prepend(li);
    while (combatLogList.children.length > 5) {
        combatLogList.removeChild(combatLogList.lastChild);
    }
};

const checkDuelOver = () => {
    if (aiHP <= 0 || userHP <= 0) {
        setTimeout(() => {
            if (aiHP <= 0) {
                modalTitle.innerText = "✨ FESTIVAL CHAMPION!";
                modalTitle.style.color = "var(--gold)";
                modalSub.innerText = `Your Sundrop light outshone the Oracle in ${roundNumber} rounds!`;
            } else {
                modalTitle.innerText = "✨ ORACLE PREVAILS";
                modalTitle.style.color = "var(--rose)";
                modalSub.innerText = `The Markov Oracle anticipated your pattern. Restore your light to duel again!`;
            }
            matchModal.classList.remove("hide");
        }, 500);
    }
};

const playGame = (userChoice) => {
    if (userHP <= 0 || aiHP <= 0) return;

    roundNumber++;
    sfx.deploy();

    choices.forEach(c => c.classList.remove("selected-choice"));
    const activeEl = document.getElementById(userChoice);
    if (activeEl) activeEl.classList.add("selected-choice");

    // 1. Oracle predicts move before updating matrix
    const compChoice = predictAndCounter();

    // 2. Update Markov Transition Matrix
    if (lastUserMove) {
        transitionMatrix[lastUserMove][userChoice] += 1.5;
    }
    lastUserMove = userChoice;

    const uMeta = weaponMeta[userChoice];
    const cMeta = weaponMeta[compChoice];

    userPickedIcon.innerHTML = `<i class="fas ${uMeta.icon}"></i>`;
    userPickedName.innerText = uMeta.label;
    aiPickedIcon.innerHTML = `<i class="fas ${cMeta.icon}"></i>`;
    aiPickedName.innerText = cMeta.label;

    if (userChoice === compChoice) {
        drawScore++;
        drawScorePara.innerText = drawScore;
        sfx.draw();
        dmgBadge.innerText = "TIE";
        msg.innerText = `✨ HARMONY TIE // BOTH CHOSE ${uMeta.label}`;
        msg.className = "status-draw";
        addCombatLog(`R#${roundNumber}: TIE [${uMeta.label} vs ${cMeta.label}]`);
    } else {
        const userWin = winGraph[userChoice].includes(compChoice);

        if (userWin) {
            userScore++;
            currentStreak++;
            if (currentStreak > bestStreak) bestStreak = currentStreak;

            const dmg = currentStreak >= 3 ? 35 : 20;
            aiHP = Math.max(0, aiHP - dmg);

            userScorePara.innerText = userScore;
            streakCountEl.innerHTML = `${currentStreak} <i class="fas fa-sparkles"></i>`;
            bestStreakEl.innerText = bestStreak;
            dmgBadge.innerText = `-${dmg}% AI`;

            sfx.win();
            msg.innerText = `✨ ${currentStreak >= 3 ? "SUNDROP SURGE! " : ""}YOUR ${uMeta.label} BEATS ${cMeta.label}!`;
            msg.className = "status-win";
            userCard.classList.add("pulse-win");
            aiCard.classList.remove("pulse-win");
            addCombatLog(`R#${roundNumber}: <span style="color:var(--emerald)">WIN</span> [${uMeta.label} > ${cMeta.label}] // -${dmg}% AI Light`);
        } else {
            computerScore++;
            currentStreak = 0;
            userHP = Math.max(0, userHP - 20);

            computerScorePara.innerText = computerScore;
            streakCountEl.innerHTML = `0 <i class="fas fa-sparkles"></i>`;
            dmgBadge.innerText = `-20% YOU`;

            sfx.lose();
            msg.innerText = `✨ ORACLE'S ${cMeta.label} OUTSHINES YOUR ${uMeta.label}!`;
            msg.className = "status-lose";
            aiCard.classList.add("pulse-win");
            userCard.classList.remove("pulse-win");
            addCombatLog(`R#${roundNumber}: <span style="color:var(--rose)">LOSS</span> [${cMeta.label} > ${uMeta.label}] // -20% Your Light`);
        }
    }

    saveStats();
    updateHPUI();
    checkDuelOver();
};

// ==========================================================================
// LISTENERS, MODE TOGGLES, KEYBOARD HOTKEYS & LANTERNS CANVAS
// ==========================================================================
choices.forEach(choice => {
    choice.addEventListener("click", () => {
        playGame(choice.getAttribute("id"));
    });
});

document.getElementById("ai-markov").addEventListener("click", (e) => {
    sfx.uiClick();
    useMarkovAI = true;
    e.currentTarget.classList.add("active");
    document.getElementById("ai-random").classList.remove("active");
    document.getElementById("ai-label").innerText = "ORACLE AI";
});

document.getElementById("ai-random").addEventListener("click", (e) => {
    sfx.uiClick();
    useMarkovAI = false;
    e.currentTarget.classList.add("active");
    document.getElementById("ai-markov").classList.remove("active");
    document.getElementById("ai-label").innerText = "PASCAL RNG";
});

document.getElementById("mode-classic").addEventListener("click", (e) => {
    sfx.uiClick();
    royal5Mode = false;
    e.currentTarget.classList.add("active");
    document.getElementById("mode-royal5").classList.remove("active");
    choicesGrid.classList.remove("five-grid");
    expansionWeapons.forEach(w => w.classList.add("hide"));
    msg.innerText = "✨ CLASSIC 3-EMBLEM DUEL // KEYS [R] [P] [S]";
});

document.getElementById("mode-royal5").addEventListener("click", (e) => {
    sfx.uiClick();
    royal5Mode = true;
    e.currentTarget.classList.add("active");
    document.getElementById("mode-classic").classList.remove("active");
    choicesGrid.classList.add("five-grid");
    expansionWeapons.forEach(w => w.classList.remove("hide"));
    msg.innerText = "✨ ROYAL-5 UNLOCKED // KEYS [R] [P] [S] [F] [T]";
});

const restoreLight = () => {
    sfx.uiClick();
    userHP = 100;
    aiHP = 100;
    dmgBadge.innerText = "VS";
    updateHPUI();
    matchModal.classList.add("hide");
    msg.innerText = "✨ SUNDROP LIGHT RESTORED TO 100% // PLAY YOUR TURN";
    msg.className = "status-neutral";
};

document.getElementById("heal-btn").addEventListener("click", restoreLight);
nextBoutBtn.addEventListener("click", restoreLight);

document.getElementById("reset-btn").addEventListener("click", () => {
    sfx.uiClick();
    userScore = 0; computerScore = 0; drawScore = 0; currentStreak = 0; bestStreak = 0;
    lastUserMove = null; roundNumber = 0;
    initMarkovMatrix();
    saveStats();

    userScorePara.innerText = "0";
    computerScorePara.innerText = "0";
    drawScorePara.innerText = "0";
    bestStreakEl.innerText = "0";
    streakCountEl.innerHTML = `0 <i class="fas fa-sparkles"></i>`;
    combatLogList.innerHTML = `<li>CHRONICLE_RESET // Oracle memory cleared to uniform prior.</li>`;
    restoreLight();
});

window.addEventListener("keydown", (e) => {
    if (!matchModal.classList.contains("hide") && e.code === "Space") {
        e.preventDefault();
        restoreLight();
        return;
    }
    const key = e.key.toLowerCase();
    if (key === "r") playGame("rock");
    if (key === "p") playGame("paper");
    if (key === "s") playGame("scissor");
    if (royal5Mode && key === "f") playGame("pan");
    if (royal5Mode && key === "t") playGame("crown");
});

// Floating Tangled Sky Lanterns Background Canvas
const canvas = document.getElementById("lantern-canvas");
if (canvas) {
    const ctx = canvas.getContext("2d");
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener("resize", () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    const lanterns = Array.from({ length: 28 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        w: Math.random() * 12 + 7,
        speedY: Math.random() * 0.55 + 0.2,
        phase: Math.random() * Math.PI * 2,
        opacity: Math.random() * 0.45 + 0.2
    }));

    function drawLanterns() {
        ctx.clearRect(0, 0, width, height);
        for (const l of lanterns) {
            const h = l.w * 1.35;
            l.phase += 0.015;
            l.x += Math.sin(l.phase) * 0.35;
            l.y -= l.speedY;

            if (l.y + h < -20) {
                l.y = height + 25;
                l.x = Math.random() * width;
            }

            ctx.save();
            ctx.translate(l.x, l.y);
            const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, l.w * 2);
            halo.addColorStop(0, `rgba(255, 215, 90, ${l.opacity * 0.6})`);
            halo.addColorStop(1, "rgba(255, 160, 20, 0)");
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(0, 0, l.w * 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = `rgba(255, 210, 95, ${l.opacity})`;
            ctx.beginPath();
            ctx.roundRect(-l.w / 2, -h / 2, l.w, h, 3);
            ctx.fill();
            ctx.restore();
        }
        requestAnimationFrame(drawLanterns);
    }
    drawLanterns();
}
