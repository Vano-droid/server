const socket = io("https://server-xm7a.onrender.com");

let room, name;
let myRole = null;
let currentRound = null;

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

  const isExplainer = socket.id === data.explainerId;
  const isGuesser = socket.id === data.guesserId;

  myRole = isExplainer
    ? "explainer"
    : isGuesser
    ? "guesser"
    : "miner";

  // WORD
  if (myRole === "guesser") {
    wordEl.innerText = "██████";
  } else {
    wordEl.innerText = data.word;
  }

  // ROLES
  rolesEl.innerHTML = `
    <div class="role-wrapper">

      <div class="role-card">
        <div>${data.explainerName}</div>
        <div class="role-label">объясняет</div>
      </div>

      <div style="font-size:40px;">▶</div>

      <div class="role-card">
        <div>${data.guesserName}</div>
        <div class="role-label">отгадывает</div>
      </div>

    </div>
  `;

  // CONTROLS
  document.getElementById("explainerControls").style.display =
    myRole === "explainer"
      ? "flex"
      : "none";
}

/* ROUND START */
socket.on("roundStart", (data) => {
  currentRound = data;
  renderRoundUI(data);
});


/* MINES */
function renderMines() {

  const mineBox = document.getElementById("mines");

  if (myRole !== "miner") {
    mineBox.innerHTML = "";
    return;
  }

  mineBox.innerHTML = "";

  for (let i = 0; i < 6; i++) {

    const el = document.createElement("div");

    el.className = "mine";
    el.innerText = "?";

    el.onclick = () => {
      el.classList.toggle("active");

      socket.emit("activateMine", {
        word: "mine" + i
      });
    };

    mineBox.appendChild(el);
  }
}
/* TIMER */
socket.on("timerUpdate", (t) => {
  document.getElementById("timer").innerText = t;
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

  document.getElementById("phase").innerText = data.phase;

  if (data.explainerId) {
    renderRoundUI(data);

    const isGuesser = socket.id === data.guesserId;

    if (!isGuesser) {
      document.getElementById("word").innerText = data.word;
    } else {
      document.getElementById("word").innerText = "██████";
    }
  }

  // 🔥 МИНЫ ТОЛЬКО В ФАЗЕ mine И ТОЛЬКО ДЛЯ miner
  if (data.phase === "mine") {
    renderMines();
  } else {
    document.getElementById("mines").innerHTML = "";
  }

  document.getElementById("explainerControls").style.display = "none";
});
/* END ROUND */
function endRound(guessed) {
  socket.emit("endRound", { guessed });
}

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