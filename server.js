const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Для больших HTML игр

app.get('/', (req, res) => res.send('<h1>✅ MiniBlox server работает</h1>'));

// --- БАЗЫ ДАННЫХ (ФАЙЛЫ) ---
const GAMES_FILE = 'games.json';
const USERS_FILE = 'users.json';

let gamesDB = fs.existsSync(GAMES_FILE) ? JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8')) : {};
let usersDB = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')) : {};

function saveGames() { fs.writeFileSync(GAMES_FILE, JSON.stringify(gamesDB)); }
function saveUsers() { fs.writeFileSync(USERS_FILE, JSON.stringify(usersDB)); }

// --- API ДЛЯ ИГР ---
app.get('/api/games', (req, res) => {
  res.json(Object.values(gamesDB));
});

app.post('/api/upload', (req, res) => {
  const { name, html, author } = req.body;
  if (!name || !html) return res.status(400).json({ error: 'Нет данных' });
  gamesDB[name] = { name, html, author, date: Date.now() };
  saveGames();
  res.json({ ok: true });
});

// --- API ДЛЯ ПОЛЬЗОВАТЕЛЕЙ ---
// Регистрация на сервере
app.post('/api/register', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Нет имени' });
  if (!usersDB[username]) {
    usersDB[username] = { username, friends: [] };
    saveUsers();
  }
  res.json({ ok: true });
});

// Получить список всех игроков (для поиска друзей)
app.get('/api/users', (req, res) => {
  res.json(Object.keys(usersDB));
});

// Добавить в друзья (запрос)
app.post('/api/friends/add', (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) return res.status(400).json({ error: 'Нет данных' });
  if (!usersDB[from] || !usersDB[to]) return res.status(404).json({ error: 'Игрок не найден' });
  
  if (!usersDB[to].friends.includes(from)) {
    usersDB[to].friends.push(from); // Просто добавляем в список (упрощенно)
    saveUsers();
  }
  res.json({ ok: true });
});

// Получить друзей
app.get('/api/friends/:username', (req, res) => {
  const user = usersDB[req.params.username];
  if (!user) return res.json([]);
  res.json(user.friends || []);
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// --- МУЛЬТИПЛЕЕР (как было) ---
const rooms = {};
io.on('connection', (socket) => {
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
  });

  socket.on('action', (data) => {
    if (!socket.gameId || !data || !data.type) return;
    if (data.type === 'move' && rooms[socket.gameId]?.[socket.id]) {
      rooms[socket.gameId][socket.id].x = data.x;
      rooms[socket.gameId][socket.id].y = data.y;
    }
    socket.to('game_' + socket.gameId).emit('action', { id: socket.id, username: socket.username, ...data });
  });

  socket.on('disconnect', () => {
    const room = rooms[socket.gameId];
    if (room) {
      delete room[socket.id];
      io.to('game_' + socket.gameId).emit('players', room);
      if (!Object.keys(room).length) delete rooms[socket.gameId];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('🚀 Server on port ' + PORT));
