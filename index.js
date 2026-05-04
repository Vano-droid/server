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

// комнаты
const rooms = {};

io.on("connection", (socket) => {

  socket.on("joinRoom", ({ roomId, name }) => {
    socket.join(roomId);

    socket.data.roomId = roomId;
    socket.data.name = name;

    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId].push({ id: socket.id, name });

    io.to(roomId).emit("playersUpdate", rooms[roomId]);
  });

  socket.on("gameAction", (data) => {
    const roomId = socket.data.roomId;
    const name = socket.data.name;

    if (!roomId) return;

    io.to(roomId).emit("gameUpdate", {
      name,
      word: data.word
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;

    if (roomId && rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(p => p.id !== socket.id);

      io.to(roomId).emit("playersUpdate", rooms[roomId]);
    }
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running");
});
