const socket = io("https://server-xm7a.onrender.com");

let currentRoom = "";

function log(text) {
  const el = document.getElementById("log");
  el.innerHTML += `<div>${text}</div>`;
  el.scrollTop = el.scrollHeight;
}

function joinRoom() {
  currentRoom = document.getElementById("room").value;
  socket.emit("joinRoom", currentRoom);
  log("Joined: " + currentRoom);
}

function sendWord() {
  const word = document.getElementById("word").value;

  socket.emit("gameAction", {
    roomId: currentRoom,
    word
  });
}

socket.on("gameUpdate", (data) => {
  log("Word: " + data.word);
});
