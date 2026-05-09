const socket = io("https://server-xm7a.onrender.com");

let room;
let name;
let isHost = false;

let currentRound = null;
let currentPhase = "lobby";
let myRole = null;

let allMines = [];
let activeMineKeys = [];
let submittedMines = false;

/* INIT */
function init() {
  const params = new URLSearchParams(window.location.search);
  room = params.get("room");
  name = params.get("name");

  socket.emit("joinRoom", { roomId: room, name });
}

/* START */
function startGame() {
  socket.emit("gameControl", { action: "start" });
}

function skipPhase() {
  socket.emit("skipPhase");
}

function togglePause() {
  socket.emit("pauseResume");
}

function openSettings() {
  const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
  // Загрузить текущие настройки из сервера (при необходимости через событие)
  // Пока заполним из локальной копии, если её нет - пустые
  modal.show();
}

function saveSettings() {
  const mineTime = document.getElementById('setMineTime').value;
  const guessTime = document.getElementById('setGuessTime').value;
  const maxMines = document.getElementById('setMaxMines').value;
  const wordPack = document.getElementById('setWordPack').value;

  socket.emit("updateSettings", { mineTime, guessTime, maxMines, wordPack });
  bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
}

socket.on("settingsUpdated", (settings) => {
  // Update local fields if needed
  document.getElementById('setMineTime').value = settings.mineTime || 50;
  document.getElementById('setGuessTime').value = settings.guessTime || 50;
  document.getElementById('setMaxMines').value = settings.maxMines || 3;
  document.getElementById('setWordPack').value = settings.wordPack || "default";
});

socket.on("pauseToggled", (paused) => {
  const btn = document.getElementById('pauseBtn');
  if (paused) {
    btn.innerText = "Resume";
    btn.classList.remove('btn-info');
    btn.classList.add('btn-danger');
  } else {
    btn.innerText = "Pause";
    btn.classList.remove('btn-danger');
    btn.classList.add('btn-info');
  }
});

/* UI */
function renderRoundUI(data) {
  const wordEl = document.getElementById("word");
  const rolesEl = document.getElementById("rolesLine");
  const controlsEl = document.getElementById("explainerControls");
  const mineInput = document.getElementById("mineInput");
  const mineBtn = document.getElementById("sendMineBtn");

  const isExplainer = socket.id === data.explainerId;
  const isGuesser = socket.id === data.guesserId;
  const isMiner = !isExplainer && !isGuesser;

  myRole = isExplainer ? "explainer" : isGuesser ? "guesser" : "miner";

  /* WORD */
  if (isGuesser) {
    wordEl.innerText = "██████";
  } else {
    wordEl.innerText = data.word;
  }

  /* ROLES */
  rolesEl.innerHTML = `
    <div class="roles-wrapper">
      <div class="player-card">
        <div class="player-name">${data.explainerName || "???"}</div>
        <div class="player-role">ОБЪЯСНЯЕТ</div>
      </div>
      <div class="vs-circle">▶</div>
      <div class="player-card">
        <div class="player-name">${data.guesserName || "???"}</div>
        <div class="player-role">ОТГАДЫВАЕТ</div>
      </div>
    </div>
  `;

  /* EXPLAINER BUTTONS */
  controlsEl.style.display = currentPhase === "round" && isExplainer ? "block" : "none";

  /* MINES INPUT */
  if (isMiner && currentPhase === "mine" && !submittedMines) {
    mineInput.style.display = "block";
    mineBtn.style.display = "inline-block";
  } else {
    mineInput.style.display = "none";
    mineBtn.style.display = "none";
  }

  updateHostControls();
}

function updateHostControls() {
  const skipBtn = document.getElementById("skipBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const startBtn = document.getElementById("startBtn");

  if (!isHost) {
    skipBtn.style.display = "none";
    pauseBtn.style.display = "none";
    settingsBtn.style.display = "none";
    return;
  }

  settingsBtn.style.display = (currentPhase === "lobby" || currentPhase === "results") ? "inline-block" : "none";
  startBtn.style.display = (currentPhase === "lobby" || currentPhase === "results") ? "inline-block" : "none";

  if (currentPhase === "mine" || currentPhase === "round") {
    skipBtn.style.display = "inline-block";
    pauseBtn.style.display = "inline-block";
  } else {
    skipBtn.style.display = "none";
    pauseBtn.style.display = "none";
  }
}

/* PHASE CHANGE */
socket.on("phaseChange", (data) => {
  currentPhase = data.phase;
  document.getElementById("phase").innerText = data.phase.toUpperCase();
  document.getElementById("timer").innerText = "⏱ " + data.time;

  if (data.phase === "mine") {
    submittedMines = false;
    allMines = [];
    activeMineKeys = [];
    const mineInput = document.getElementById("mineInput");
    if (mineInput) mineInput.value = "";
    renderMines();
  }

  if (data.word) {
    currentRound = data;
    renderRoundUI(data);
    renderMines();
  }

  updateHostControls();
});

/* ROUND START */
socket.on("roundStart", (data) => {
  currentRound = data;
  currentPhase = "round";
  document.getElementById("phase").innerText = "ROUND";

  allMines = data.mines || [];
  activeMineKeys = data.activeMines || [];

  renderRoundUI(data);
  renderMines();
});

/* TIMER */
socket.on("timerUpdate", (t) => {
  document.getElementById("timer").innerText = "⏱ " + t;
});

/* PLAYERS */
socket.on("playersUpdate", (players) => {
  // Отображаем игроков с очками и хостом
  const playersDiv = document.getElementById("players");
  playersDiv.innerHTML = players.map(p => {
    const star = p.isHost ? " ⭐" : "";
    return `<div class="player-item">
      ${p.name}${star}
      <span class="player-score">${p.score}</span>
    </div>`;
  }).join("");

  // Определяем, хост ли я
  const me = players.find(p => p.id === socket.id);
  isHost = me?.isHost || false;
  updateHostControls();
});

/* SEND MINES */
function sendMines() {
  if (myRole !== "miner") return;

  const input = document.getElementById("mineInput");
  const value = input.value.trim();
  if (!value) return;

  const mineWords = value.split(",").map(w => w.trim()).filter(Boolean);

  socket.emit("submitMines", { words: mineWords });
  submittedMines = true;

  input.style.display = "none";
  document.getElementById("sendMineBtn").style.display = "none";

  mineWords.forEach(word => {
    allMines.push({ minerId: socket.id, word });
  });
  renderMines();
}

/* RENDER MINES */
function renderMines(showAll = false) {
  const mineBox = document.getElementById("mineBox");
  if (!mineBox) return;
  mineBox.innerHTML = "";

  if (!allMines.length) return;

  allMines.forEach(m => {
    const mine = document.createElement("div");
    mine.className = "mine-card";

    const isOwner = m.minerId === socket.id;
    const canSee = isOwner || showAll;
    mine.innerText = canSee ? m.word : "MINA";

    const mineKey = `${m.minerId}:${m.word}`;
    const isActive = activeMineKeys.includes(mineKey);
    if (isActive) {
      mine.classList.add("mine-active");
    }

    if (myRole === "miner" && currentPhase === "round" && isOwner && !isActive) {
      mine.onclick = () => {
        socket.emit("activateMine", { word: m.word });
      };
    }

    mineBox.appendChild(mine);
  });
}

/* MINE ACTIVATED */
socket.on("mineActivated", ({ mineKey }) => {
  if (!activeMineKeys.includes(mineKey)) {
    activeMineKeys.push(mineKey);
  }
  renderMines();
});

/* END ROUND */
function endRound(guessed) {
  socket.emit("endRound", { guessed });
}

/* RESULTS */
socket.on("roundEnd", (data) => {
  currentPhase = "results";
  renderMines(true);

  document.getElementById("word").innerText = currentRound?.word || "???";
  document.getElementById("explainerControls").style.display = "none";

  // Очки обновятся через playersUpdate
  updateHostControls();
});