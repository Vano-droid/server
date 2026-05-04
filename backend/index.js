import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => res.send("Server running"));

const io = new Server(server, {
  cors: { origin: "*" }
});

/* =========================
   STATE
========================= */
const rooms = {};
const timers = {};

/* =========================
   ROOM MODEL
========================= */
function createRoom(roomId) {
  rooms[roomId] = {
    hostId: null,
    state: "lobby", // lobby | mine | round | results

    settings: {
      mineTime: 50,
      guessTime: 50
    },

    players: [],
    scores: {},

    round: null
  };
}

/* =========================
   ROUND START (MINE PHASE)
========================= */
function startMinePhase(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.state = "mine";

  let t = room.settings.mineTime;

  io.to(roomId).emit("phaseChange", {
    phase: "mine",
    time: t
  });

  clearInterval(timers[roomId]);

  timers[roomId] = setInterval(() => {
    t--;

    io.to(roomId).emit("timerUpdate", t);

    if (t <= 0) {
      clearInterval(timers[roomId]);
      startRound(roomId);
    }
  }, 1000);
}

/* =========================
   ROUND PHASE
========================= */
function startRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.state = "round";

  const players = room.players;
  if (players.length === 0) return;

  room.round = {
    word: "apple",
    explainerId: players[Math.floor(Math.random() * players.length)].id,
    guesserId: players[Math.floor(Math.random() * players.length)].id,
    mines: {},
    activeMines: new Set()
  };

  io.to(roomId).emit("roundStart", {
    word: room.round.word,
    explainerId: room.round.explainerId,
    guesserId: room.round.guesserId
  });

  startGuessTimer(roomId);
}

/* =========================
   GUESS TIMER
========================= */
function startGuessTimer(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  let t = room.settings.guessTime;

  clearInterval(timers[roomId]);

  timers[roomId] = setInterval(() => {
    t--;

    io.to(roomId).emit("timerUpdate", t);

    if (t <= 0) {
      clearInterval(timers[roomId]);
      endRound(roomId, false);
    }
  }, 1000);
}

/* =========================
   END ROUND + SCORING
========================= */
function endRound(roomId, guessed) {
  const room = rooms[roomId];
  if (!room) return;

  const explainer = room.round.explainerId;
  const guesser = room.round.guesserId;

  // guess reward
  if (guessed) {
    room.scores[guesser] = (room.scores[guesser] || 0) + 5;
  }

  // mine system
  for (const minerId in room.round.mines) {
    const mines = room.round.mines[minerId];

    for (const m of mines) {
      if (room.round.activeMines.has(m)) {
        room.scores[minerId] = (room.scores[minerId] || 0) + 5;
        room.scores[explainer] = (room.scores[explainer] || 0) - 3;
      }
    }
  }

  io.to(roomId).emit("roundEnd", {
    scores: room.scores
  });

  room.state = "results";

  setTimeout(() => {
    startMinePhase(roomId);
  }, 4000);
}

/* =========================
   SOCKET LOGIC
========================= */
io.on("connection", (socket) => {

  /* JOIN ROOM */
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

  /* CHAT / WORDS */
  socket.on("gameAction", (data) => {
    const roomId = socket.data.roomId;

    io.to(roomId).emit("gameUpdate", {
      name: socket.data.name,
      word: data.word
    });
  });

  /* HOST CONTROLS */
  socket.on("gameControl", (data) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];
    if (!room) return;

    if (data.action === "start") {
      if (socket.id !== room.hostId) return;

      startMinePhase(roomId);
    }

    if (data.action === "pause") {
      clearInterval(timers[roomId]);
    }
  });

  /* SETTINGS */
  socket.on("updateSettings", ({ settings }) => {
    const room = rooms[socket.data.roomId];
    if (!room) return;

    if (socket.id !== room.hostId) return;

    room.settings = settings;
  });

  /* MINES */
  socket.on("submitMines", ({ words }) => {
    const room = rooms[socket.data.roomId];
    if (!room || !room.round) return;

    room.round.mines[socket.id] = words;
  });

  socket.on("activateMine", ({ word }) => {
    const room = rooms[socket.data.roomId];
    if (!room || !room.round) return;

    room.round.activeMines.add(word);
  });

  /* WORD USED CHECK */
  socket.on("wordUsed", ({ word }) => {
    const room = rooms[socket.data.roomId];
    if (!room || !room.round) return;

    for (const playerId in room.round.mines) {
      if (room.round.mines[playerId]?.includes(word)) {
        room.scores[room.round.explainerId] -= 2;
        room.scores[playerId] += 5;
      }
    }
  });

  /* NEXT ROUND */
  socket.on("nextRound", () => {
    const roomId = socket.data.roomId;
    startMinePhase(roomId);
  });

  /* DISCONNECT */
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];

    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);
    delete room.scores[socket.id];

    io.to(roomId).emit("playersUpdate", room.players);
  });
});

/* =========================
   START SERVER
========================= */
server.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});