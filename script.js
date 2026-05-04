const socket = io("https://server-xm7a.onrender.com");

let room, name;

/* INIT ROOM */
function init() {
  const params = new URLSearchParams(window.location.search);

  room = params.get("room");
  name = params.get("name");

  document.getElementById("info").innerText =
    `Room: ${room} | Player: ${name}`;

  socket.emit("joinRoom", { roomId: room, name });
}

/* SEND WORD */
function sendWord() {
  const word = document.getElementById("word").value;

  socket.emit("gameAction", { word });

  log(`${name}: ${word}`);
}

/* LOG */
function log(msg) {
  const el = document.getElementById("log");
  el.innerHTML += `<div>${msg}</div>`;
  el.scrollTop = el.scrollHeight;
}

/* PLAYERS LIST */
socket.on("playersUpdate", (players) => {
  document.getElementById("players").innerHTML =
    "<b>Players:</b><br>" +
    players.map(p => p.name).join("<br>");
});

/* GAME MESSAGES */
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