const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.get('/', (req, res) => res.send('<h1>✅ MiniBlox server работает</h1>'));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

const rooms = {}; // rooms[gameId] = { [socketId]: { x, y, username, ... } }

io.on('connection', (socket) => {
  console.log('🟢 connected:', socket.id);

  socket.on('join', ({ gameId, username }) => {
    if (!gameId || !username) return;

    if (socket.gameId && socket.gameId !== gameId) {
      socket.leave('game_' + socket.gameId);
      if (rooms[socket.gameId]) {
        delete rooms[socket.gameId][socket.id];
        io.to('game_' + socket.gameId).emit('players', rooms[socket.gameId]);
      }
    }

    socket.join('game_' + gameId);
    socket.gameId = gameId;
    socket.username = username;

    if (!rooms[gameId]) rooms[gameId] = {};
    rooms[gameId][socket.id] = { x: 100, y: 100, username };

    io.to('game_' + gameId).emit('players', rooms[gameId]);
    console.log(`👤 ${username} → ${gameId}`);
  });

  // УНИВЕРСАЛЬНЫЙ РЕТРАНСЛЯТОР:
  // клиент шлёт { type: 'move', ... } — сервер пересылает всем в комнате
  socket.on('action', (data) => {
    if (!socket.gameId || !data || !data.type) return;
    // обновляем позицию на сервере, чтобы новые игроки видели актуальные координаты
    if (data.type === 'move' && rooms[socket.gameId]?.[socket.id]) {
      rooms[socket.gameId][socket.id].x = data.x;
      rooms[socket.gameId][socket.id].y = data.y;
    }
    socket.to('game_' + socket.gameId).emit('action', {
      id: socket.id,
      username: socket.username,
      ...data
    });
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.gameId];
    if (room) {
      delete room[socket.id];
      io.to('game_' + socket.gameId).emit('players', room);
      if (!Object.keys(room).length) delete rooms[socket.gameId];
    }
    console.log('🔴 disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('🚀 Server on port ' + PORT));