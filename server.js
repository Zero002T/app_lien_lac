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
  if (!fs.existsSync(DB_FILE)) {
    const initialData = { users: [], messages: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { users: [], messages: [] };
  }
}

const onlineUsers = new Map();

// API ĐĂNG KÝ (Loại bỏ khoảng trắng dư thừa)
app.post('/api/register', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();

  if (!username || !password) {
    return res.status(400).json({ message: 'Tên và mật khẩu không được để trống!' });
  }

  const db = readDB();
  // Kiểm tra tài khoản đã tồn tại (không phân biệt hoa thường)
  const userExists = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  
  if (userExists) {
    return res.status(400).json({ message: 'Tài khoản này đã tồn tại!' });
  }

  db.users.push({ username, password });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  res.json({ message: 'Đăng ký thành công!' });
});

// API ĐĂNG NHẬP (Chuẩn hóa so sánh)
app.post('/api/login', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = (req.body.password || '').trim();

  const db = readDB();
  
  // Tìm user chính xác tên và mật khẩu
  const user = db.users.find(u => 
    u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );

  if (!user) {
    return res.status(400).json({ message: 'Tài khoản hoặc mật khẩu không chính xác!' });
  }

  res.json({ message: 'Đăng nhập thành công!', username: user.username });
});

// Realtime Socket.io
io.on('connection', (socket) => {
  socket.on('user_connected', (username) => {
    onlineUsers.set(socket.id, username);
    broadcastUserList();
  });

  socket.on('send_message', (data) => {
    const db = readDB();
    db.messages.push(data);
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    io.emit('receive_message', data);
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    broadcastUserList();
  });
});

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
