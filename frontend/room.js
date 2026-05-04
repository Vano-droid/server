const socket = io("https://server-xm7a.onrender.com");

let room, name;
let myRole = null;
let currentRound = null;
/* INIT */
function init() {
  const params = new URLSearchParams(window.location.search);

  room = params.get("room");
  name = params.get("name");

  socket.emit("joinRoom", { roomId: room, name });
}

/* START GAME */
function startGame() {
  socket.emit("gameControl", {
    action: "start"
  });
}

function renderRoles(data) {
  const el = document.getElementById("rolesLine");

  const explainer = data.explainerName;
  const guesser = data.guesserName;

  el.innerHTML = `
    <div style="text-align:center">
      <b>${explainer}</b>
      <div>▼</div>
      <div style="font-size:22px; color:#00ffcc">${data.word}</div>
      <div>▼</div>
      <b>${guesser}</b>
    </div>
  `;
}
/* PHASE */
socket.on("phaseChange", (data) => {
  document.getElementById("phase").innerText =
    data.phase.toUpperCase();
});

/* ROUND START */
socket.on("roundStart", (data) => {
  document.getElementById("word").innerText = "HIDDEN";

  if (socket.id === data.explainerId) {
    document.getElementById("word").innerText = data.word;
  }

  document.getElementById("role").innerText =
    socket.id === data.explainerId
      ? "EXPLAINER"
      : socket.id === data.guesserId
      ? "GUESSER"
      : "MINER";
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

/* MINES UI */
function sendMines() {
  const value = document.getElementById("mineInput").value;

  socket.emit("submitMines", {
    words: value.split(",").map(w => w.trim())
  });
}

/* MINE VISUALS */
socket.on("roundStart", () => {
  const mineBox = document.getElementById("mines");
  mineBox.innerHTML = "";

  for (let i = 0; i < 5; i++) {
    const el = document.createElement("div");
    el.className = "mine";
    el.innerText = "mine";
    el.onclick = () => {
      el.classList.toggle("active");
      socket.emit("activateMine", { word: "mine" + i });
    };
    mineBox.appendChild(el);
  }
});

/* SCOREBOARD */
socket.on("roundEnd", (data) => {
  const board = document.getElementById("scoreboard");

  board.innerHTML =
    "<h4>Results</h4>" +
    Object.entries(data.scores)
      .map(([id, score]) => `<div>${id}: ${score}</div>`)
      .join("<br>");
});