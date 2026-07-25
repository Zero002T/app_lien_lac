const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));

const DB_FILE = path.join(__dirname, 'database.json');

// Đọc cơ sở dữ liệu từ file
function loadData() {
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, offlineMessages: {} }));
  }
  return JSON.parse(fs.readFileSync(DB_FILE));
}

// Lưu cơ sở dữ liệu vào file
function saveData(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Lấy danh sách tài khoản (có trạng thái online/offline)
function getUsersList(activeSocketUsers) {
  const db = loadData();
  const list = [];
  const onlineUsernames = Object.values(activeSocketUsers).map(u => u.username);

  for (let username in db.users) {
    list.push({
      username: username,
      avatar: db.users[username].avatar,
      isOnline: onlineUsernames.includes(username),
      socketId: Object.keys(activeSocketUsers).find(id => activeSocketUsers[id].username === username) || null
    });
  }
  return list;
}

let activeUsers = {}; // { socketId: { username } }

// API Đăng ký / Đăng nhập
app.post('/api/auth', (req, res) => {
  const { username, password, avatar } = req.body;
  if (!username || !password) return res.json({ success: false, message: 'Thiếu tên hoặc mật khẩu!' });

  const db = loadData();

  if (db.users[username]) {
    // Đăng nhập
    if (db.users[username].password !== password) {
      return res.json({ success: false, message: 'Mật khẩu không chính xác!' });
    }
    // Cập nhật avatar nếu người dùng chọn avatar mới
    if (avatar) db.users[username].avatar = avatar;
    saveData(db);
    return res.json({ success: true, user: { username, avatar: db.users[username].avatar } });
  } else {
    // Đăng ký tài khoản mới
    const defaultAvatar = avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + username;
    db.users[username] = { password, avatar: defaultAvatar };
    saveData(db);
    return res.json({ success: true, user: { username, avatar: defaultAvatar } });
  }
});

// Real-time qua Socket.io
io.on('connection', (socket) => {
  
  socket.on('join', (username) => {
    activeUsers[socket.id] = { username };
    
    // Phát tin nhắn offline chưa đọc cho người dùng
    const db = loadData();
    if (db.offlineMessages[username] && db.offlineMessages[username].length > 0) {
      socket.emit('pending_messages', db.offlineMessages[username]);
      db.offlineMessages[username] = []; // Xoá tin nhắn offline sau khi đã gửi
      saveData(db);
    }

    io.emit('user_list', getUsersList(activeUsers));
  });

  // Nhắn tin (Online & Offline)
  socket.on('send_message', (data) => {
    // data: { sender, receiver, text, fileUrl, fileName, isFile }
    const onlineReceiverSocketId = Object.keys(activeUsers).find(id => activeUsers[id].username === data.receiver);

    if (onlineReceiverSocketId) {
      // Người nhận đang Online -> Gửi trực tiếp
      io.to(onlineReceiverSocketId).emit('receive_message', data);
    } else {
      // Người nhận đang Offline -> Lưu vào danh sách chờ
      const db = loadData();
      if (!db.offlineMessages[data.receiver]) {
        db.offlineMessages[data.receiver] = [];
      }
      db.offlineMessages[data.receiver].push(data);
      saveData(db);
    }

    // Gửi lại tin nhắn về cho chính người gửi để hiển thị trên khung chat của họ
    socket.emit('receive_message', data);
  });

  // Gọi Video
  socket.on('call_user', (data) => {
    // data: { toSocketId, signalData, fromName, fromAvatar }
    io.to(data.toSocketId).emit('incoming_call', {
      signal: data.signalData,
      fromSocketId: socket.id,
      fromName: data.fromName,
      fromAvatar: data.fromAvatar
    });
  });

  socket.on('accept_call', (data) => {
    io.to(data.toSocketId).emit('call_accepted', data.signal);
  });

  socket.on('end_call', (data) => {
    io.to(data.toSocketId).emit('call_ended');
  });

  socket.on('disconnect', () => {
    delete activeUsers[socket.id];
    io.emit('user_list', getUsersList(activeUsers));
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server dang chay tai: http://localhost:${PORT}`);
});