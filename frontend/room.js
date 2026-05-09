const socket = io("https://server-xm7a.onrender.com");

let room;
let name;

let currentRound = null;
let currentPhase = "lobby";
let myRole = null;

// Вместо mineWords теперь общие массивы мин
let allMines = [];           // [{ minerId, word }]
let activeMineKeys = [];    // ["minerId:word"]
let submittedMines = false; // флаг для текущего игрока

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
    // Очищаем поле ввода
    const mineInput = document.getElementById("mineInput");
    if (mineInput) mineInput.value = "";
    renderMines();
  }

  if (data.word) {
    currentRound = data;
    renderRoundUI(data);
    renderMines();
  }
});

/* ROUND START */
socket.on("roundStart", (data) => {
  currentRound = data;
  currentPhase = "round";
  document.getElementById("phase").innerText = "ROUND";

  // Обновляем мины из данных сервера
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
  document.getElementById("players").innerHTML = players
    .map(p => `<div class="player-item">${p.name}</div>`)
    .join("");
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

  // Локально добавляем мины для немедленного отображения у минера
  mineWords.forEach(word => {
    allMines.push({ minerId: socket.id, word });
  });
  renderMines();
}

/* RENDER MINES (новый общий рендер) */
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

    // Активировать может только владелец в фазе раунда, если мина ещё не активна
    if (myRole === "miner" && currentPhase === "round" && isOwner && !isActive) {
      mine.onclick = () => {
        socket.emit("activateMine", { word: m.word });
        // Класс добавится после события mineActivated
      };
    }

    mineBox.appendChild(mine);
  });
}

/* MINE ACTIVATED (от сервера) */
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

  const board = document.getElementById("scoreboard");
  board.innerHTML = `<h3 class="mb-3">RESULTS</h3>` +
    Object.entries(data.scores)
      .map(([id, score]) => `<div class="score-item">${id}: ${score}</div>`)
      .join("");
});