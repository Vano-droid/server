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
   ROOM CREATE
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
   MINE PHASE
========================= */
function startMinePhase(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.state = "mine";

  let t = room.settings.mineTime;

  clearInterval(timers[roomId]);

  io.to(roomId).emit("phaseChange", {
    phase: "mine",
    time: t
  });

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
   ROUND START
========================= */
function startRound(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  room.state = "round";

  const players = room.players;
  if (!players.length) return;

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
  guesserId: room.round.guesserId,

  explainerName: players.find(p => p.id === room.round.explainerId)?.name,
  guesserName: players.find(p => p.id === room.round.guesserId)?.name
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
   END ROUND
========================= */
function endRound(roomId, guessed) {
  const room = rooms[roomId];
  if (!room || !room.round) return;

  clearInterval(timers[roomId]);

  const round = room.round;

  const explainer = round.explainerId;
  const guesser = round.guesserId;

  room.scores[explainer] = room.scores[explainer] || 0;
  room.scores[guesser] = room.scores[guesser] || 0;

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
    startMinePhase(roomId);
  }, 4000);
}

/* =========================
   SOCKET
========================= */
io.on("connection", (socket) => {

  /* JOIN ROOM */
  socket.on("joinRoom", ({ roomId, name }) => {
    if (!rooms[roomId]) createRoom(roomId);

    const room = rooms[roomId];

    socket.join(roomId);

    socket.data.roomId = roomId;
    socket.data.name = name;

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

  /* CHAT / DEBUG ACTION */
  socket.on("gameAction", (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    io.to(roomId).emit("gameUpdate", {
      name: socket.data.name,
      word: data.word
    });
  });

  /* HOST CONTROL */
  socket.on("gameControl", (data) => {
    const roomId = socket.data.roomId;
    const room = rooms[roomId];

    if (!room) return;

    if (socket.id !== room.hostId) return;

    if (data.action === "start") {
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

  /* WORD CHECK */
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
  socket.on("roundStart", (data) => {

  currentRound = data;

  const myId = socket.id;

  myRole =
    myId === data.explainerId
      ? "explainer"
      : myId === data.guesserId
      ? "guesser"
      : "miner";

  // WORD RULE
  const wordEl = document.getElementById("word");

  if (myRole === "explainer") {
    wordEl.innerText = data.word;
  } else {
    wordEl.innerText = "██████";
  }

  // ROLE UI
  renderRoles(data);

  // GUESS CONTROLS
  document.getElementById("guessControls").style.display =
    myRole === "explainer" ? "block" : "none";
});
  /* NEXT ROUND */
  socket.on("phaseChange", (data) => {

  document.getElementById("word").innerText = "██████";

  document.getElementById("guessControls").style.display = "none";

  document.getElementById("phase").innerText = data.phase;
});

  /* END ROUND (from client button) */
  socket.on("roundEnd", (data) => {

  document.getElementById("word").innerText =
    "WORD: " + currentRound.word;

  document.getElementById("guessControls").style.display = "none";

  const board = document.getElementById("scoreboard");

  board.innerHTML =
    "<h3>Results</h3>" +
    Object.entries(data.scores)
      .map(([id, score]) => `<div>${id}: ${score}</div>`)
      .join("");
});

  /* DISCONNECT */
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

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