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
   CREATE ROOM
========================= */
function createRoom(roomId) {
  rooms[roomId] = {
    hostId: null,
    state: "lobby",

    settings: {
      mineTime: 50,
      guessTime: 50
    },

    players: [],
    scores: {},

    round: null,
    autoLoop: false
  };
}

/* =========================
   ROLE PICKER (SAFE)
========================= */
function pickRoles(players) {
  const alive = [...players];

  if (alive.length < 2) {
    return {
      explainer: alive[0] || null,
      guesser: alive[0] || null
    };
  }

  for (let i = alive.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [alive[i], alive[j]] = [alive[j], alive[i]];
  }

  return {
    explainer: alive[0],
    guesser: alive[1]
  };
}

/* =========================
   MINE PHASE
========================= */
function startMinePhase(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const players = room.players;
  if (players.length < 2) return;

  const { explainer, guesser } = pickRoles(players);

  room.round = {
    word: "apple",
    explainerId: explainer.id,
    guesserId: guesser.id,
    mines: {},
    activeMines: new Set()
  };

  room.state = "mine";

  let t = room.settings.mineTime;
  clearInterval(timers[roomId]);

  // 🔥 ВАЖНО: отправляем роли УЖЕ СЕЙЧАС
  io.to(roomId).emit("phaseChange", {
    phase: "mine",
    time: t,

    word: room.round.word,
    explainerId: explainer.id,
    guesserId: guesser.id,
    explainerName: explainer.name,
    guesserName: guesser.name
  });

  timers[roomId] = setInterval(() => {
    t--;

    io.to(roomId).emit("timerUpdate", t);

    if (t <= 0) {
      clearInterval(timers[roomId]);
      startGuessPhase(roomId);
    }
  }, 1000);
}

/* =========================
   ROUND START (FIXED VIEW MODEL)
========================= */
function startGuessPhase(roomId) {
  const room = rooms[roomId];
  if (!room || !room.round) return;

  room.state = "round";

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
   END ROUND (SAFE)
========================= */
function endRound(roomId, guessed) {
  const room = rooms[roomId];
  if (!room || !room.round) return;

  clearInterval(timers[roomId]);

  const round = room.round;

  const explainer = round.explainerId;
  const guesser = round.guesserId;

  room.scores[explainer] ??= 0;
  room.scores[guesser] ??= 0;

  if (guessed) {
    room.scores[guesser] += 5;
  }

  for (const minerId in round.mines) {
    const mines = round.mines[minerId] || [];

    for (const m of mines) {
      if (round.activeMines?.has(m)) {
        room.scores[minerId] = (room.scores[minerId] || 0) + 5;
        room.scores[explainer] -= 3;
      }
    }
  }

  io.to(roomId).emit("roundEnd", {
    scores: room.scores,
    word: round.word
  });

  room.state = "results";
  room.round = null;

  setTimeout(() => {
    if (room.autoLoop) startMinePhase(roomId);
  }, 4000);
}

/* =========================
   SOCKET
========================= */
io.on("connection", (socket) => {

  socket.on("joinRoom", ({ roomId, name }) => {
    if (!rooms[roomId]) createRoom(roomId);

    const room = rooms[roomId];

    socket.join(roomId);

    socket.data.roomId = roomId;
    socket.data.name = name;

    room.players = room.players.filter(p => p.id !== socket.id);

room.players.push({
  id: socket.id,
  name
});

    room.scores[socket.id] ??= 0;

    if (!room.hostId) {
      room.hostId = socket.id;
    }

    io.to(roomId).emit("playersUpdate", room.players);
  });

  socket.on("gameControl", (data) => {
    console.log("GAME CONTROL:", data);
    const room = rooms[socket.data.roomId];
    if (!room) return;

    if (socket.id !== room.hostId) return;
    console.log("ROOM FOUND:", room.state);
    if (data.action === "start") {
      console.log("START PRESSED");
      room.autoLoop = true;
      startMinePhase(socket.data.roomId);
    }

    if (data.action === "pause") {
      room.autoLoop = false;
      clearInterval(timers[socket.data.roomId]);
    }
  });

  socket.on("submitMines", ({ words }) => {
    const room = rooms[socket.data.roomId];
    if (!room?.round) return;

    room.round.mines[socket.id] = words;
  });

  socket.on("activateMine", ({ word }) => {
    const room = rooms[socket.data.roomId];
    if (!room?.round) return;

    room.round.activeMines.add(word);
  });

  socket.on("endRound", ({ guessed }) => {
    const room = rooms[socket.data.roomId];
    if (!room?.round) return;

    if (socket.id !== room.round.explainerId) return;

    endRound(socket.data.roomId, guessed);
  });

  socket.on("disconnect", () => {
    const room = rooms[socket.data.roomId];
    if (!room) return;

    room.players = room.players.filter(p => p.id !== socket.id);
    delete room.scores[socket.id];

    if (room.hostId === socket.id) {
      room.hostId = room.players[0]?.id || null;
    }

    io.to(socket.data.roomId).emit("playersUpdate", room.players);
  });
});

/* =========================
   START
========================= */
server.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});