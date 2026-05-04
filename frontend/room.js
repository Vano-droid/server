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
  const isMiner = !isExplainer && !isGuesser;
  const isGuesser = socket.id === data.guesserId;

  myRole = isExplainer ? "explainer" : isGuesser ? "guesser" : "miner";

  // WORD
  if (isExplainer || isMiner) {
  wordEl.innerText = data.word;
} else {
  wordEl.innerText = "██████";
}

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


/* MINES */
function renderMines() {
  const mineBox = document.getElementById("mines");

  // ❗ если не майнер — вообще ничего не показываем
  if (myRole !== "miner") {
    mineBox.innerHTML = "";
    return;
  }

  mineBox.innerHTML = "";

  for (let i = 0; i < 5; i++) {
    const el = document.createElement("div");

    el.className = "mine";
    el.innerText = "+";

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
  document.getElementById("players").innerHTML =
    players.map(p => `<div>${p.name}</div>`).join("");
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