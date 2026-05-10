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
let maxMines = 3;
let availablePacks = [];

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
  updatePackSelect();
  const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
  modal.show();
}

function updatePackSelect() {
  const select = document.getElementById('setWordPack');
  if (!select) return;
  const currentValue = select.value;
  select.innerHTML = '';
  availablePacks.forEach(pack => {
    const option = document.createElement('option');
    option.value = pack;
    option.textContent = pack;
    select.appendChild(option);
  });
  if (availablePacks.includes(currentValue)) {
    select.value = currentValue;
  } else if (availablePacks.length > 0) {
    select.value = availablePacks[0];
  }
}

function addCustomPack() {
  const nameInput = document.getElementById('newPackName');
  const wordsInput = document.getElementById('newPackWords');
  const name = nameInput.value.trim();
  const wordsStr = wordsInput.value.trim();
  if (!name || !wordsStr) {
    alert("Введите название пакета и слова через запятую");
    return;
  }
  const words = wordsStr.split(',').map(w => w.trim()).filter(Boolean);
  if (words.length === 0) {
    alert("Добавьте хотя бы одно слово");
    return;
  }
  socket.emit("addCustomPack", { name, words });
  nameInput.value = '';
  wordsInput.value = '';
}

function saveSettings() {
  const mineTime = document.getElementById('setMineTime').value;
  const guessTime = document.getElementById('setGuessTime').value;
  const maxMinesVal = document.getElementById('setMaxMines').value;
  const wordPack = document.getElementById('setWordPack').value;
  const winScore = document.getElementById('setWinScore').value;
  socket.emit("updateSettings", { mineTime, guessTime, maxMines: maxMinesVal, wordPack, winScore });
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

  if (isMiner && currentPhase === "mine") {
    const myMines = allMines.filter(m => m.minerId === socket.id).map(m => m.word);
    mineInput.value = myMines.join(", ");
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
    startBtn.style.display = "none";
    return;
  }

  const activeGamePhases = ["mine", "round"];
  const isLobbyOrFinished = currentPhase === "lobby" || currentPhase === "finished";
  const isPausedNow = activeGamePhases.includes(currentPhase) && isPaused;

  startBtn.style.display = isLobbyOrFinished ? "inline-block" : "none";

  if (activeGamePhases.includes(currentPhase)) {
    skipBtn.style.display = isPaused ? "none" : "inline-block";
    pauseBtn.style.display = "inline-block";
    pauseBtn.innerText = isPaused ? "Resume" : "Pause";
    pauseBtn.classList.toggle('btn-danger', isPaused);
    pauseBtn.classList.toggle('btn-info', !isPaused);
  } else {
    skipBtn.style.display = "none";
    pauseBtn.style.display = "none";
  }

  settingsBtn.style.display = (isLobbyOrFinished || isPausedNow) ? "inline-block" : "none";
}

/* --- События сервера --- */
socket.on("phaseChange", (data) => {
  currentPhase = data.phase;
  document.getElementById("phaseText").innerText = data.phase === "finished" ? "GAME OVER" : data.phase.toUpperCase();
  document.getElementById("timer").innerText = data.time ? "⏱ " + data.time : "";

  if (data.phase === "mine") {
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
  document.getElementById("phaseText").innerText = "ROUND";
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
  document.getElementById('setWinScore').value = settings.winScore || 30;
  maxMines = settings.maxMines || 3;
  // Обновим поле ввода, если мы минёр в фазе mine
  if (currentPhase === "mine" && myRole === "miner") {
    const myMines = allMines.filter(m => m.minerId === socket.id).map(m => m.word);
    document.getElementById("mineInput").value = myMines.join(", ");
  }
});

socket.on("customPacksUpdated", (packs) => {
  availablePacks = packs;
  if (document.getElementById('settingsModal').classList.contains('show')) {
    updatePackSelect();
  }
});

socket.on("gameOver", (data) => {
  alert(`Победил ${data.winner}! Игра окончена.`);
  currentPhase = "finished";
  updateHostControls();
  document.getElementById("phaseText").innerText = "GAME OVER";
});

socket.on("gameRestarted", () => {
  currentPhase = "lobby";
  isPaused = false;
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
  document.getElementById("phaseText").innerText = "LOBBY";
  updateHostControls();
});

/* --- Мины --- */
function sendMines() {
  if (myRole !== "miner") return;
  const input = document.getElementById("mineInput");
  const value = input.value.trim();
  if (!value) return;

  const words = value.split(",").map(w => w.trim()).filter(Boolean);
  socket.emit("submitMines", { words });
}

socket.on("minesUpdated", (minesData) => {
  // minesData = [{ minerId, words }]
  allMines = [];
  minesData.forEach(({ minerId, words }) => {
    words.forEach(word => {
      allMines.push({ minerId, word });
    });
  });
  renderMines();
  if (currentPhase === "mine" && myRole === "miner") {
    const myMines = allMines.filter(m => m.minerId === socket.id).map(m => m.word);
    document.getElementById("mineInput").value = myMines.join(", ");
  }
});

function renderMines(showAll = false) {
  const box = document.getElementById("mineBox");
  if (!box) return;
  box.innerHTML = "";
  if (!allMines.length) return;

  allMines.forEach(m => {
    const mine = document.createElement("div");
    mine.className = "mine-card";
    const isOwner = m.minerId === socket.id;
    const canSee = myRole === "miner" || isOwner || showAll;
    mine.innerText = canSee ? m.word : "MINA";
    const mineKey = `${m.minerId}:${m.word}`;
    if (activeMineKeys.includes(mineKey)) mine.classList.add("mine-active");

    // Логика клика для минера в фазе round
    if (myRole === "miner" && currentPhase === "round" && isOwner) {
      if (activeMineKeys.includes(mineKey)) {
        // Мина уже активна → клик для деактивации
        mine.onclick = () => socket.emit("deactivateMine", { word: m.word });
      } else {
        // Мина не активна → клик для активации
        mine.onclick = () => socket.emit("activateMine", { word: m.word });
      }
    }

    box.appendChild(mine);
  });
}

socket.on("mineActivated", ({ mineKey }) => {
  if (!activeMineKeys.includes(mineKey)) activeMineKeys.push(mineKey);
  renderMines();
});
socket.on("mineDeactivated", ({ mineKey }) => {
  activeMineKeys = activeMineKeys.filter(k => k !== mineKey);
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