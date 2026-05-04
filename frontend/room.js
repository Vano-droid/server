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
  const controlsEl = document.getElementById("explainerControls");

  const isExplainer = socket.id === data.explainerId;
  const isGuesser = socket.id === data.guesserId;

  myRole = isExplainer ? "explainer" : isGuesser ? "guesser" : "miner";

  // WORD
  wordEl.innerText = isExplainer ? data.word : "██████";

  // ROLES (ВАЖНО: теперь всегда корректно)
  rolesEl.innerHTML = `
    <div class="text-center">
      <div class="fw-bold text-success">
        ${data.explainerName}
      </div>

      <div>⬇</div>

      <div class="badge bg-warning text-dark">WORD</div>

      <div>⬇</div>

      <div class="fw-bold text-primary">
        ${data.guesserName}
      </div>
    </div>
  `;

  // CONTROLS
  controlsEl.style.display = isExplainer ? "block" : "none";
}

/* ROUND START */
socket.on("roundStart", (data) => {
  currentRound = data;
  renderRoundUI(data);
});

/* TIMER */
socket.on("timerUpdate", (t) => {
  document.getElementById("timer").innerText = t;
});

/* PLAYERS */
socket.on("playersUpdate", (players) => {
  document.getElementById("players").innerHTML =
    players.map(p => `<div>${p.name}</div>`).join("");
});

socket.on("phaseChange", (data) => {

  document.getElementById("phase").innerText = data.phase;

  // если есть роли → рендерим
  if (data.explainerId) {
    renderRoundUI(data);

    // в фазе мин слово видно:
    if (socket.id === data.guesserId) {
      document.getElementById("word").innerText = "██████";
    } else {
      document.getElementById("word").innerText = data.word;
    }
  }

  // кнопки скрыты
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