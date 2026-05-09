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

const wordPacks = {
  default: ["яблоко", "кот", "дом", "машина", "школа", "компьютер", "дерево", "река", "книга", "стул"],
  animals: ["тигр", "дельфин", "слон", "попугай", "акула", "жираф", "панда", "змея", "орёл", "черепаха"],
  tech: ["ноутбук", "дрон", "робот", "интернет", "смартфон", "наушники", "принтер", "камера", "чип", "сервер"]
};

function createRoom(roomId) {
  rooms[roomId] = {
    hostId: null,
    state: "lobby",
    settings: {
      mineTime: 50,
      guessTime: 50,
      maxMines: 3,
      wordPack: "default",
      winScore: 30
    },
    players: [],
    scores: {},
    round: null,
    autoLoop: false,
    paused: false
  };
}

function pickRoles(players) {
  const alive = [...players];
  if (alive.length < 2) return { explainer: alive[0] || null, guesser: alive[0] || null };
  for (let i = alive.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [alive[i], alive[j]] = [alive[j], alive[i]];
  }
  return { explainer: alive[0], guesser: alive[1] };
}

function getRandomWord(pack) {
  const words = wordPacks[pack] || wordPacks.default;
  return words[Math.floor(Math.random() * words.length)];
}

function sendPlayersUpdate(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const playersData = room.players.map(p => ({
    id: p.id,
    name: p.name,
    score: room.scores[p.id] || 0,
    isHost: p.id === room.hostId
  }));
  io.to(roomId).emit("playersUpdate", playersData);
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
    word: getRandomWord(room.settings.wordPack),
    explainerId: explainer.id,
    guesserId: guesser.id,
    mines: {},
    activeMines: new Set()
  };
  room.state = "mine";
  room.paused = false;
  clearInterval(timers[roomId]);

  let t = room.settings.mineTime;
  const explainerData = room.players.find(p => p.id === room.round?.explainerId);
  const guesserData = room.players.find(p => p.id === room.round?.guesserId);

  io.to(roomId).emit("phaseChange", {
    phase: "mine",
    time: t,
    word: room.round?.word,
    explainerId: room.round?.explainerId,
    guesserId: room.round?.guesserId,
    explainerName: explainerData?.name || "PLAYER",
    guesserName: guesserData?.name || "PLAYER"
  });

  timers[roomId] = setInterval(() => {
    if (room.paused) return;
    t--;
    io.to(roomId).emit("timerUpdate", t);
    if (t <= 0) {
      clearInterval(timers[roomId]);
      startGuessPhase(roomId);
    }
  }, 1000);
}

/* =========================
   ROUND START
========================= */
function startGuessPhase(roomId) {
  const room = rooms[roomId];
  if (!room || !room.round) return;
  room.state = "round";
  room.paused = false;
  clearInterval(timers[roomId]);

  const explainer = room.players.find(p => p.id === room.round.explainerId);
  const guesser = room.players.find(p => p.id === room.round.guesserId);
  const minesArray = [];
  for (const minerId in room.round.mines) {
    const words = room.round.mines[minerId];
    words.forEach(word => minesArray.push({ minerId, word }));
  }

  io.to(roomId).emit("roundStart", {
    word: room.round.word,
    explainerId: room.round.explainerId,
    guesserId: room.round.guesserId,
    explainerName: explainer?.name || "PLAYER",
    guesserName: guesser?.name || "PLAYER",
    mines: minesArray,
    activeMines: [...room.round.activeMines]
  });

  startGuessTimer(roomId);
}

function startGuessTimer(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  let t = room.settings.guessTime;
  clearInterval(timers[roomId]);
  timers[roomId] = setInterval(() => {
    if (room.paused) return;
    t--;
    io.to(roomId).emit("timerUpdate", t);
    if (t <= 0) {
      clearInterval(timers[roomId]);
      endRound(roomId, false);
    }
  }, 1000);
}

/* =========================
   END ROUND (исправленная логика очков)
========================= */
function endRound(roomId, guessed) {
  const room = rooms[roomId];
  if (!room || !room.round) return;
  clearInterval(timers[roomId]);
  room.paused = false;

  const round = room.round;
  const explainer = round.explainerId;
  const guesser = round.guesserId;

  room.scores[explainer] ??= 0;
  room.scores[guesser] ??= 0;

  const anyMineActivated = round.activeMines.size > 0;

  // 1. Штрафы и бонусы за мины (всегда, если активированы)
  for (const minerId in round.mines) {
    const mines = round.mines[minerId] || [];
    for (const m of mines) {
      const mineKey = `${minerId}:${m}`;
      if (round.activeMines.has(mineKey)) {
        // Минёр получает +5
        room.scores[minerId] = (room.scores[minerId] || 0) + 5;
        // Объясняющий получает -3
        room.scores[explainer] -= 3;
      }
    }
  }

  // 2. Результат раунда (угадано / не угадано)
  if (guessed) {
    // Отгадывающий всегда +5
    room.scores[guesser] += 5;
    // Объясняющий +5 только если ни одна мина не взорвалась
    if (!anyMineActivated) {
      room.scores[explainer] += 5;
    }
  }
  // Если не угадано – дополнительных очков никому (кроме уже учтённых мин)

  io.to(roomId).emit("roundEnd", {
    scores: room.scores,
    word: round.word
  });

  room.state = "results";
  room.round = null;
  sendPlayersUpdate(roomId);

  // Проверка победы
  const winScore = room.settings.winScore || 30;
  let winnerId = null;
  for (const id in room.scores) {
    if (room.scores[id] >= winScore) {
      winnerId = id;
      break;
    }
  }

  if (winnerId) {
    room.autoLoop = false;
    const winner = room.players.find(p => p.id === winnerId);
    io.to(roomId).emit("gameOver", {
      winner: winner?.name || "Unknown",
      winnerId,
      scores: room.scores
    });
    room.state = "finished";
    io.to(roomId).emit("phaseChange", { phase: "finished", time: 0 });
    sendPlayersUpdate(roomId);
  } else {
    setTimeout(() => {
      if (room.autoLoop && room.state === "results") {
        startMinePhase(roomId);
      }
    }, 4000);
  }
}

/* =========================
   FULL RESTART
========================= */
function restartGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  clearInterval(timers[roomId]);
  room.state = "lobby";
  room.round = null;
  room.autoLoop = false;
  room.paused = false;

  for (const p of room.players) {
    room.scores[p.id] = 0;
  }

  io.to(roomId).emit("gameRestarted");
  sendPlayersUpdate(roomId);
  io.to(roomId).emit("phaseChange", { phase: "lobby", time: 0 });
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
    room.players.push({ id: socket.id, name });
    room.scores[socket.id] ??= 0;

    if (!room.hostId) {
      room.hostId = socket.id;
    }

    sendPlayersUpdate(roomId);
  });

  socket.on("gameControl", (data) => {
    const room = rooms[socket.data.roomId];
    if (!room || socket.id !== room.hostId) return;
    if (data.action === "start") {
      if (room.state === "lobby" || room.state === "finished") {
        room.autoLoop = true;
        if (room.state === "finished") room.state = "lobby";
        startMinePhase(socket.data.roomId);
      }
    }
    if (data.action === "pause") {
      room.autoLoop = false;
      clearInterval(timers[socket.data.roomId]);
    }
  });

  socket.on("updateSettings", (newSettings) => {
    const room = rooms[socket.data.roomId];
    if (!room || socket.id !== room.hostId) return;

    if (newSettings.mineTime) room.settings.mineTime = Number(newSettings.mineTime);
    if (newSettings.guessTime) room.settings.guessTime = Number(newSettings.guessTime);
    if (newSettings.maxMines) room.settings.maxMines = Number(newSettings.maxMines);
    if (newSettings.wordPack) room.settings.wordPack = newSettings.wordPack;
    if (newSettings.winScore) room.settings.winScore = Number(newSettings.winScore);

    io.to(socket.data.roomId).emit("settingsUpdated", room.settings);
  });

  socket.on("restartGame", () => {
    const room = rooms[socket.data.roomId];
    if (!room || socket.id !== room.hostId) return;
    restartGame(socket.data.roomId);
  });

  socket.on("skipPhase", () => {
    const room = rooms[socket.data.roomId];
    if (!room?.round || socket.id !== room.hostId) return;
    clearInterval(timers[socket.data.roomId]);
    if (room.state === "mine") startGuessPhase(socket.data.roomId);
    else if (room.state === "round") endRound(socket.data.roomId, false);
  });

  socket.on("pauseResume", () => {
    const room = rooms[socket.data.roomId];
    if (!room || socket.id !== room.hostId) return;
    if (room.state === "lobby" || room.state === "results" || room.state === "finished") return;

    room.paused = !room.paused;
    io.to(socket.data.roomId).emit("pauseToggled", room.paused);
  });

  socket.on("submitMines", ({ words }) => {
    const room = rooms[socket.data.roomId];
    if (!room?.round) return;

    const existing = room.round.mines[socket.id] || [];
    const combined = existing.concat(words);
    const max = room.settings.maxMines || 3;
    room.round.mines[socket.id] = combined.slice(0, max);
  });

  socket.on("activateMine", ({ word }) => {
    const room = rooms[socket.data.roomId];
    if (!room?.round) return;
    const minerId = socket.id;
    const mineKey = `${minerId}:${word}`;
    const minerWords = room.round.mines[minerId];
    if (!minerWords || !minerWords.includes(word) || room.round.activeMines.has(mineKey)) return;
    room.round.activeMines.add(mineKey);
    io.to(socket.data.roomId).emit("mineActivated", { mineKey, word, minerId });
  });

  socket.on("endRound", ({ guessed }) => {
    const room = rooms[socket.data.roomId];
    if (!room?.round || socket.id !== room.round.explainerId) return;
    endRound(socket.data.roomId, guessed);
  });

  socket.on("disconnect", () => {
    const room = rooms[socket.data.roomId];
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    delete room.scores[socket.id];
    if (room.hostId === socket.id) room.hostId = room.players[0]?.id || null;
    sendPlayersUpdate(socket.data.roomId);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});