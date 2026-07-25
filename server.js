const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'database.json');

// Hàm đọc Database
function readDB() {
  if (!fs.existsSync(DB_FILE)) return { users: [], messages: [] };
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { users: [], messages: [] };
  }
}

// Lưu các socket đang online: { socketId: username }
const onlineUsers = new Map();

// API Đăng ký
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  if (db.users.find(u => u.username === username)) {
    return res.status(400).json({ message: 'Tài khoản đã tồn tại!' });
  }
  db.users.push({ username, password });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  res.json({ message: 'Đăng ký thành công!' });
});

// API Đăng nhập
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(400).json({ message: 'Sai tài khoản hoặc mật khẩu!' });
  res.json({ message: 'Đăng nhập thành công!', username });
});

// Xử lý Realtime với Socket.io
io.on('connection', (socket) => {
  // Khi user báo danh tên đăng nhập
  socket.on('user_connected', (username) => {
    onlineUsers.set(socket.id, username);
    broadcastUserList();
  });

  // Khi có tin nhắn mới
  socket.on('send_message', (data) => {
    // data = { sender, receiver, text }
    const db = readDB();
    db.messages.push(data);
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

    // Gửi tin nhắn cho tất cả các máy
    io.emit('receive_message', data);
  });

  // Khi mất kết nối
  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    broadcastUserList();
  });
});

// Hàm gửi danh sách TẤT CẢ tài khoản (Kèm trạng thái Online/Offline)
function broadcastUserList() {
  const db = readDB();
  const activeUsernames = Array.from(onlineUsers.values());

  const fullUserList = db.users.map(u => ({
    username: u.username,
    isOnline: activeUsernames.includes(u.username)
  }));

  io.emit('update_user_list', fullUserList);
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
