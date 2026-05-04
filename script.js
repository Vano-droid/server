const socket = io("https://server-xm7a.onrender.com");

let currentRoom = "";

function log(text) {
  const logBox = document.getElementById("log");
  logBox.innerHTML += `<div>${text}</div>`;
  logBox.scrollTop = logBox.scrollHeight;
}

function joinRoom() {
  currentRoom = document.getElementById("room").value;

  if (!currentRoom) return;

  socket.emit("joinRoom", currentRoom);
  log("Joined room: " + currentRoom);
}

function sendWord() {
  const word = document.getElementById("word").value;

  if (!currentRoom || !word) return;

  socket.emit("gameAction", {
    roomId: currentRoom,
    word
  });
}

socket.on("gameUpdate", (data) => {
  log("Word: " + data.word);
});
