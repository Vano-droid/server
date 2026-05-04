import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// комнаты и игроки
const rooms = {};

io.on("connection", (socket) => {

  socket.on("joinRoom", (roomId) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }

    rooms[roomId].push(socket.id);

    io.to(roomId).emit("playersUpdate", rooms[roomId]);
  });

  socket.on("gameAction", (data) => {
    // пересылаем всем в комнате
    io.to(data.roomId).emit("gameUpdate", data);
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      io.to(roomId).emit("playersUpdate", rooms[roomId]);
    }
  });
});

server.listen(3000, () => {
  console.log("Server running");
});