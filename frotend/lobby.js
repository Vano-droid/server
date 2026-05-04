function join() {
  const name = document.getElementById("name").value;
  const room = document.getElementById("room").value;

  if (!name || !room) return;

  window.location.href = `room.html?room=${room}&name=${name}`;
}