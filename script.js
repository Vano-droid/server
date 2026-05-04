// подключение к серверу
const socket = io("https://server-xm7a.onrender.com");

let room = null;
let name = null;

/* =========================
   INDEX PAGE LOGIC
========================= */

function joinLobby() {
  name = document.getElementById("nickname").value;
  room = document.getElementById("room").value;

  if (!name || !room) return;

  window.location.href = `room.html?room=${room}&name=${name}`;
}

/* =========================
   ROOM PAGE LOGIC
========================= */

function initRoom() {
  const params = new URLSearchParams(window.location.search);

  room = params.get("room");
  name = params.get("name");

  const info = document.getElementById("info");
  if (info) {
    info.innerText = `Room: ${room} | Player: ${name}`;
  }

  if (!room || !name) return;

  socket.emit("joinRoom", {
    roomId: room,
    name: name
  });
}

/* отправка слова */
function sendWord() {
  const word = document.getElementById("word").value;
  if (!word) return;

  socket.emit("gameAction", {
    roomId: room,
    word,
    name
  });
}

/* лог сообщений */
function log(msg) {
  const el = document.getElementById("log");
  if (!el) return;

  el.innerHTML += `<div>${msg}</div>`;
  el.scrollTop = el.scrollHeight;
}

/* получение событий */
socket.on("gameUpdate", (data) => {
  log(`${data.name}: ${data.word}`);
});

/* авто-определение страницы */
window.onload = () => {
  if (document.getElementById("room") && document.getElementById("nickname")) {
    // index page
    window.joinLobby = joinLobby;
  }

  if (document.getElementById("word")) {
    // room page
    initRoom();
    window.sendWord = sendWord;
  }
};
