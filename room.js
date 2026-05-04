const params = new URLSearchParams(window.location.search);

const room = params.get("room");
const name = params.get("name");

document.getElementById("info").innerText =
  `Room: ${room} | Player: ${name}`;

socket.emit("joinRoom", { roomId: room, name });

/* ---------------- LOG ---------------- */
function log(msg) {
  const el = document.getElementById("log");
  el.innerHTML += `<div>${msg}</div>`;
}

/* ---------------- WORD ---------------- */
function sendWord() {
  const word = document.getElementById("wordInput").value;

  socket.emit("gameAction", {
    word,
    roomId: room
  });

  log(`${name}: ${word}`);
}

/* ---------------- PLAYERS ---------------- */
socket.on("playersUpdate", (players) => {
  document.getElementById("players").innerHTML =
    "<b>Players:</b><br>" +
    players.map(p => p.name).join("<br>");
});

/* ---------------- GAME ---------------- */
socket.on("gameUpdate", (data) => {
  log(`${data.name}: ${data.word}`);
});

/* ---------------- TIMER ---------------- */
socket.on("timerUpdate", (t) => {
  document.getElementById("timer").innerText = t;
});

/* ---------------- CONTROL ---------------- */
function startGame() {
  socket.emit("gameControl", { action: "start" });
}

function pauseGame() {
  socket.emit("gameControl", { action: "pause" });
}