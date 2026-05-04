import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => res.send("Server running"));

const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = {};
const timers = {};

/* =========================
   ROOM CREATE (NEW)
========================= */
function createRoom(roomId) {
  rooms[roomId] = {
    hostId: null,
    state: "lobby",
    players: [],
    scores: {},
    round: null
  };
}

/* =========================
   ROUND START (NEW)
========================= */
function startRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.state = "round";

  const players = room.players;

  if (players.length === 0) return;

  room.round = {
    word: "apple",
    timeLeft: 50,
    explainerId: players[Math.floor(Math.random() * players.length)].id,
    guesserId: players[Math.floor(Math.random() * players.length)].id,
    mines: {}
  };

  io.to(roomId).emit("roundStart", {
    word: room.round.word,
    explainerId: room.round.explainerId,
    guesserId: room.round.guesserId
  });

  startTimer(roomId);
}

/* =========================
   TIMER (NEW)
========================= */
function startTimer(roomId) {
  let t = 50;

  clearInterval(timers[roomId]);

  timers[roomId] = setInterval(() => {
    t--;

    io.to(roomId).emit("timerUpdate", t);

    if (t <= 0) {
      clearInterval(timers[roomId]);
      endRound(roomId);
    }
  }, 1000);
}

/* =========================
   END ROUND (NEW)
========================= */
function endRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.state = "results";

  io.to(roomId).emit("roundEnd", {
    scores: room.scores
  });

  setTimeout(() => {
    startRound(roomId);
  }, 4000);
}

/* =========================
   SOCKET
========================= */
io.on("connection", (socket) => {

  /* JOIN ROOM (FIXED) */
  socket.on("joinRoom", ({ roomId, name }) => {

    if (!rooms[roomId]) createRoom(roomId);

    socket.join(roomId);

    socket.data.roomId = roomId;
    socket.data.name = name;

    const room = rooms[roomId];

    room.players.push({
      id: socket.id,
      name
    });

    room.scores[socket.id] = 0;

    if (!room.hostId) {
      room.hostId = socket.id;
    }

    io.to(roomId).emit("playersUpdate", room.players);
  });

  /* CHAT / WORDS (YOUR OLD SYSTEM KEPT) */
  socket.on("gameAction", (data) => {
    const roomId = socket.data.roomId;

    io.to(roomId).emit("gameUpdate", {
      name: socket.data.name,
      word: data.word
    });
  });

  /* GAME CONTROL (HOST ONLY START) */
  socket.on("gameControl", (data) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];

    if (!room) return;

    if (data.action === "start") {
      if (socket.id !== room.hostId) return;

      startRound(roomId);
    }

    if (data.action === "pause") {
      clearInterval(timers[roomId]);
    }
  });

  /* MINES SYSTEM (NEW CORE FEATURE) */
  socket.on("submitMines", ({ words }) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];

    if (!room || !room.round) return;

    room.round.mines[socket.id] = words;
  });

  /* WORD USED CHECK (NEW) */
  socket.on("wordUsed", ({ word }) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];

    if (!room || !room.round) return;

    for (const playerId in room.round.mines) {
      if (room.round.mines[playerId]?.includes(word)) {

        room.scores[room.round.explainerId] -= 2;
        room.scores[playerId] += 5;
      }
    }
  });

  /* DISCONNECT (FIXED SAFE) */
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;

    if (!rooms[roomId]) return;

    rooms[roomId].players =
      rooms[roomId].players.filter(p => p.id !== socket.id);

    delete rooms[roomId].scores[socket.id];

    io.to(roomId).emit("playersUpdate", rooms[roomId].players);
  });

});

/* =========================
   START SERVER
========================= */
server.listen(process.env.PORT || 3000, () =>
  console.log("Server running")
);