let room = null;
let name = null;

/* INIT */
function init() {
  const params = new URLSearchParams(window.location.search);

  room = params.get("room");
  name = params.get("name");

  document.getElementById("info").innerText =
    `Room: ${room} | Player: ${name}`;

  socket.emit("joinRoom", { roomId: room, name });
}

/* SEND WORD */
let canSend = true;

function sendWord() {
  if (!canSend) return;

  const word = document.getElementById("word").value.trim();
  if (!word) return;

  canSend = false;

  socket.emit("gameAction", {
    roomId: room,
    word
  });

  log(`${name}: ${word}`);

  setTimeout(() => {
    canSend = true;
  }, 300);
}

/* LOG */
function log(msg) {
  const el = document.getElementById("log");
  el.innerHTML += `<div>${msg}</div>`;
  el.scrollTop = el.scrollHeight;
}

/* PLAYERS */
socket.on("playersUpdate", (players) => {
  document.getElementById("players").innerHTML =
    "<b>Players:</b><br>" +
    players.map(p => p.name).join("<br>");
});

/* GAME */
socket.on("gameUpdate", (data) => {
  log(`${data.name}: ${data.word}`);
});

/* TIMER */
socket.on("timerUpdate", (t) => {
  document.getElementById("timer").innerText = t;
});

/* CONTROLS */
function startGame() {
  socket.emit("gameControl", { action: "start" });
}

function pauseGame() {
  socket.emit("gameControl", { action: "pause" });
}

/* INIT */
window.onload = init;
