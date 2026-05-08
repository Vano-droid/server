const socket = io("https://server-xm7a.onrender.com");

let room, name;
let myRole = null;
let currentRound = null;
let mineWords = [];
let activeMines = [];
let currentPhase = "lobby";
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

/* RENDER */
function renderRoundUI(data) {
  const wordEl = document.getElementById("word");
  const rolesEl = document.getElementById("rolesLine");
  const controlsEl = document.getElementById("explainerControls");
  const mineInput = document.getElementById("mineInput");
  const mineBtn = document.getElementById("sendMineBtn");

  const isExplainer = socket.id === data.explainerId;
  const isGuesser = socket.id === data.guesserId;
  const isMiner = !isExplainer && !isGuesser;

  myRole = isExplainer
    ? "explainer"
    : isGuesser
    ? "guesser"
    : "miner";

  // WORD
  if (isGuesser) {
    wordEl.innerText = "██████";
  } else {
    wordEl.innerText = data.word;
  }

  // ROLES
  rolesEl.innerHTML = `
    <div class="roles-wrapper">

      <div class="player-card explainer">
        <div class="player-name">${data.explainerName}</div>
        <div class="player-role">объясняет</div>
      </div>

      <div class="word-center">
        <div class="vs-circle">▶</div>
      </div>

      <div class="player-card guesser">
        <div class="player-name">${data.guesserName}</div>
        <div class="player-role">отгадывает</div>
      </div>

    </div>
  `;

  // BUTTONS
  controlsEl.style.display =
    currentPhase === "round" && isExplainer
      ? "block"
      : "none";

  // MINES INPUT
  if (isMiner && currentPhase === "mine") {
    mineInput.style.display = "block";
    mineBtn.style.display = "inline-block";
  } else {
    mineInput.style.display = "none";
    mineBtn.style.display = "none";
  }
}

/* ROUND START */
socket.on("roundStart", (data) => {

  currentRound = data;
  currentPhase = "round";

  renderRoundUI(data);

  renderMines();
});


/* MINES */
function renderMines(showAll = false) {
  const mineBox = document.getElementById("mines");

  mineBox.innerHTML = "";

  if (!mineWords.length) return;

  mineWords.forEach((word, index) => {

    const mine = document.createElement("div");

    mine.className =
      "mine-card " +
      (activeMines.includes(word)
        ? "mine-active"
        : "");

    // кто видит мины
    const canSee =
      myRole === "miner" || showAll;

    mine.innerText = canSee
      ? word
      : "MINA";

    // активировать могут только минёры
    if (myRole === "miner" && currentPhase === "round") {
      mine.onclick = () => {

        if (!activeMines.includes(word)) {
          activeMines.push(word);

          socket.emit("activateMine", {
            word
          });

          renderMines();
        }
      };
    }

    mineBox.appendChild(mine);
  });
}
/* TIMER */
socket.on("timerUpdate", (t) => {
  document.getElementById("timer").innerText =
    "⏱ " + t;
});

/* PLAYERS */
socket.on("playersUpdate", (players) => {

  const el = document.getElementById("players");

  el.innerHTML = players.map(p => `
    <div class="player-card">
      <div>${p.name}</div>
      <div class="player-score">0</div>
    </div>
  `).join("");

});

socket.on("phaseChange", (data) => {
  currentPhase = data.phase;

  document.getElementById("phase").innerText =
    data.phase.toUpperCase();

  // TIMER
  document.getElementById("timer").innerText =
    data.time || "";

  // ВАЖНО:
  // на фазе мин НЕ очищаем UI
  if (data.explainerId) {
    currentRound = data;
    renderRoundUI(data);
  }

  // скрываем кнопки до round
  if (data.phase !== "round") {
    document.getElementById(
      "explainerControls"
    ).style.display = "none";
  }
});
/* END ROUND */
socket.on("roundEnd", (data) => {

  renderMines(true);

  document.getElementById("word").innerText =
    "СЛОВО: " + currentRound.word;

  document.getElementById(
    "explainerControls"
  ).style.display = "none";

  const board =
    document.getElementById("scoreboard");

  board.innerHTML =
    "<h3>Results</h3>" +
    Object.entries(data.scores)
      .map(([id, score]) =>
        `<div>${id}: ${score}</div>`
      )
      .join("");
});

socket.on("roundEnd", (data) => {
  document.getElementById("word").innerText =
    "WORD: " + currentRound.word;

  document.getElementById("explainerControls").style.display = "none";

  const board = document.getElementById("scoreboard");

  board.innerHTML =
    "<h3>Results</h3>" +
    Object.entries(data.scores)
      .map(([id, score]) => `<div>${id}: ${score}</div>`)
      .join("");
});
function sendMines() {

  if (myRole !== "miner") return;

  const value =
    document.getElementById("mineInput").value;

  mineWords = value
    .split(",")
    .map(w => w.trim())
    .filter(Boolean);

  socket.emit("submitMines", {
    words: mineWords
  });

  renderMines();
}

function renderMines(showAll = false) {

  const mineBox =
    document.getElementById("mines");

  mineBox.innerHTML = "";

  if (!mineWords.length) return;

  mineWords.forEach((word) => {

    const mine =
      document.createElement("div");

    mine.className =
      "mine-card " +
      (
        activeMines.includes(word)
          ? "mine-active"
          : ""
      );

    const canSee =
      myRole === "miner" || showAll;

    mine.innerText =
      canSee
        ? word
        : "MINA";

    if (
      myRole === "miner" &&
      currentPhase === "round"
    ) {

      mine.onclick = () => {

        if (!activeMines.includes(word)) {

          activeMines.push(word);

          socket.emit("activateMine", {
            word
          });

          renderMines();
        }
      };
    }

    mineBox.appendChild(mine);
  });
}