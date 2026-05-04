console.log("server alive");
// подключение к твоему backend на Render
const socket = io("https://server-xm7a.onrender.com");

let currentRoom = null;

function log(text) {
  const div = document.getElementById("log");
  div.innerHTML += "<p>" + text + "</p>";
}

// вход в комнату
function joinRoom() {
  const room = document.getElementById("room").value;

  if (!room) return;

  currentRoom = room;

  socket.emit("joinRoom", room);

  log("Joined room: " + room);
}

// отправка слова
function sendWord() {
  const word = document.getElementById("word").value;

  if (!currentRoom || !word) return;

  socket.emit("gameAction", {
    roomId: currentRoom,
    word: word
  });
}

// получение обновлений от сервера
socket.on("gameUpdate", (data) => {
  log("Player: " + data.word);
});
