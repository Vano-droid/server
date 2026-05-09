const socket = io("https://server-xm7a.onrender.com");

let room;
let name;
let isHost = false;
let isPaused = false;

let currentRound = null;
let currentPhase = "lobby";
let myRole = null;

let allMines = [];
let activeMineKeys = [];
let submittedMines = false;

function init() {
  const params = new URLSearchParams(window.location.search);
  room = params.get("room");
  name = params.get("name");
  socket.emit("joinRoom", { roomId: room, name });
}

/* --- Кнопки --- */
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
  // Перед открытием подгрузим актуальные значения (если есть)
  const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
  modal.show();
}

function saveSettings() {
  const mineTime = document.getElementById('setMineTime').value;
  const guessTime = document.getElementById('setGuessTime').value;
  const maxMines = document.getElementById('setMaxMines').value;
  const wordPack = document.getElementById('setWordPack').value;
  const winScore = document.getElementById('setWinScore').value;
  socket.emit("updateSettings", { mineTime, guessTime, maxMines, wordPack, winScore });
  bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
}

function restartGame() {
  if (confirm("Полностью сбросить игру? Все очки обнулятся.")) {
    socket.emit("restartGame");
    bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
  }
}

/* --- UI рендер --- */
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

  wordEl.innerText = isGuesser ? "██████" : data.word;
  rolesEl.innerHTML = `
    <div class="roles-wrapper">
      <div class="player-card"><div class="player-name">${data.explainerName||"???"}</div><div class="player-role">ОБЪЯСНЯЕТ</div></div>
      <div class="vs-circle">▶</div>
      <div class="player-card"><div class="player-name">${data.guesserName||"???"}</div><div class="player-role">ОТГАДЫВАЕТ</div></div>
    </div>`;
  controlsEl.style.display = (currentPhase === "round" && isExplainer) ? "block" : "none";

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

  const activeGamePhases = ["mine", "round"];
  const isActive = activeGamePhases.includes(currentPhase) && !isPaused;
  const isLobbyOrFinished = currentPhase === "lobby" || currentPhase === "finished";
  const isPausedNow = activeGamePhases.includes(currentPhase) && isPaused;

  // Старт только в лобби/finished
  startBtn.style.display = (currentPhase === "lobby" || currentPhase === "finished") ? "inline-block" : "none";

  // Skip и Pause только в mine/round и не на паузе (skip) / pause всегда показываем в этих фазах
  if (activeGamePhases.includes(currentPhase)) {
    skipBtn.style.display = isPaused ? "none" : "inline-block";
    pauseBtn.style.display = "inline-block";
    if (isPaused) {
      pauseBtn.innerText = "Resume";
      pauseBtn.classList.remove('btn-info');
      pauseBtn.classList.add('btn-danger');
    } else {
      pauseBtn.innerText = "Pause";
      pauseBtn.classList.remove('btn-danger');
      pauseBtn.classList.add('btn-info');
    }
  } else {
    skipBtn.style.display = "none";
    pauseBtn.style.display = "none";
  }

  // Настройки: показываем, если лобби, finished, или пауза в mine/round
  settingsBtn.style.display = (isLobbyOrFinished || isPausedNow) ? "inline-block" : "none";
}

/* --- События сервера --- */
socket.on("phaseChange", (data) => {
  currentPhase = data.phase;
  document.getElementById("phase").innerText = data.phase === "finished" ? "GAME OVER" : data.phase.toUpperCase();
  document.getElementById("timer").innerText = data.time ? "⏱ " + data.time : "";

  if (data.phase === "mine") {
    submittedMines = false;
    allMines = [];
    activeMineKeys = [];
    document.getElementById("mineInput").value = "";
    renderMines();
  }
  if (data.word) {
    currentRound = data;
    renderRoundUI(data);
    renderMines();
  }
  updateHostControls();
});

socket.on("roundStart", (data) => {
  currentRound = data;
  currentPhase = "round";
  document.getElementById("phase").innerText = "ROUND";
  allMines = data.mines || [];
  activeMineKeys = data.activeMines || [];
  renderRoundUI(data);
  renderMines();
});

socket.on("timerUpdate", (t) => {
  document.getElementById("timer").innerText = "⏱ " + t;
});

socket.on("playersUpdate", (players) => {
  const div = document.getElementById("players");
  div.innerHTML = players.map(p => {
    const star = p.isHost ? " ⭐" : "";
    return `<div class="player-item">${p.name}${star}<span class="player-score">${p.score}</span></div>`;
  }).join("");
  const me = players.find(p => p.id === socket.id);
  isHost = me?.isHost || false;
  updateHostControls();
});

socket.on("pauseToggled", (paused) => {
  isPaused = paused;
  updateHostControls();
});

socket.on("settingsUpdated", (settings) => {
  document.getElementById('setMineTime').value = settings.mineTime || 50;
  document.getElementById('setGuessTime').value = settings.guessTime || 50;
  document.getElementById('setMaxMines').value = settings.maxMines || 3;
  document.getElementById('setWordPack').value = settings.wordPack || "default";
  document.getElementById('setWinScore').value = settings.winScore || 30;
});

socket.on("gameOver", (data) => {
  alert(`Победил ${data.winner}! Игра окончена.`);
  currentPhase = "finished";
  updateHostControls();
  document.getElementById("phase").innerText = "GAME OVER";
});

socket.on("gameRestarted", () => {
  currentPhase = "lobby";
  isPaused = false;
  submittedMines = false;
  allMines = [];
  activeMineKeys = [];
  currentRound = null;
  myRole = null;
  document.getElementById("word").innerText = "WAITING...";
  document.getElementById("rolesLine").innerHTML = "";
  document.getElementById("explainerControls").style.display = "none";
  document.getElementById("mineInput").style.display = "none";
  document.getElementById("sendMineBtn").style.display = "none";
  document.getElementById("mineBox").innerHTML = "";
  document.getElementById("timer").innerText = "";
  document.getElementById("phase").innerText = "LOBBY";
  updateHostControls();
});

/* --- Мины --- */
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
  mineWords.forEach(word => allMines.push({ minerId: socket.id, word }));
  renderMines();
}

function renderMines(showAll = false) {
  const box = document.getElementById("mineBox");
  if (!box) return;
  box.innerHTML = "";
  if (!allMines.length) return;
  allMines.forEach(m => {
    const mine = document.createElement("div");
    mine.className = "mine-card";
    const isOwner = m.minerId === socket.id;
    mine.innerText = (isOwner || showAll) ? m.word : "MINA";
    const mineKey = `${m.minerId}:${m.word}`;
    if (activeMineKeys.includes(mineKey)) mine.classList.add("mine-active");
    if (myRole === "miner" && currentPhase === "round" && isOwner && !activeMineKeys.includes(mineKey)) {
      mine.onclick = () => socket.emit("activateMine", { word: m.word });
    }
    box.appendChild(mine);
  });
}

socket.on("mineActivated", ({ mineKey }) => {
  if (!activeMineKeys.includes(mineKey)) activeMineKeys.push(mineKey);
  renderMines();
});

function endRound(guessed) {
  socket.emit("endRound", { guessed });
}

socket.on("roundEnd", (data) => {
  currentPhase = "results";
  renderMines(true);
  document.getElementById("word").innerText = currentRound?.word || "???";
  document.getElementById("explainerControls").style.display = "none";
  updateHostControls();
});