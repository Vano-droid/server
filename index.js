import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

app.get("/", (req, res) => {
  res.send("Server is running");
});

const io = new Server(server, {
  cors: { origin: "*" }
});

const rooms = {};
const timers = {};

io.on("connection", (socket) => {

  socket.on("joinRoom", ({ roomId, name }) => {
    socket.join(roomId);

    socket.data.roomId = roomId;
    socket.data.name = name;

    if (!rooms[roomId]) rooms[roomId] = [];

    rooms[roomId].push({
      id: socket.id,
      name
    });

    io.to(roomId).emit("playersUpdate", rooms[roomId]);
  });

  socket.on("gameAction", (data) => {
    io.to(socket.data.roomId).emit("gameUpdate", {
      name: socket.data.name,
      word: data.word
    });
  });

  socket.on("gameControl", (data) => {
    const roomId = socket.data.roomId;

    if (data.action === "start") {
      let time = 60;

      clearInterval(timers[roomId]);

      timers[roomId] = setInterval(() => {
        time--;

        io.to(roomId).emit("timerUpdate", time);

        if (time <= 0) {
          clearInterval(timers[roomId]);
          io.to(roomId).emit("gameEnd");
        }
      }, 1000);
    }

    if (data.action === "pause") {
      clearInterval(timers[roomId]);
    }
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;

    if (!rooms[roomId]) return;

    rooms[roomId] = rooms[roomId].filter(p => p.id !== socket.id);

    io.to(roomId).emit("playersUpdate", rooms[roomId]);
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running");
});