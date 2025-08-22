const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Group chat
let groupChatName = "RAW PROTOCOL Main Room";
let groupChatIcon = "default-group.png";

// Middleware: strict session cookie (no persistence)
app.use(cookieSession({
  name: 'session',
  keys: ['super-secret-key'],
  maxAge: null // session cookie only, expires on browser close
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/avatars', express.static(path.join(__dirname, 'public/avatars')));
app.use('/group-icons', express.static(path.join(__dirname, 'public/group-icons')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Ensure dirs
if (!fs.existsSync('data')) fs.mkdirSync('data');
if (!fs.existsSync('public/avatars')) fs.mkdirSync('public/avatars');
if (!fs.existsSync('public/group-icons')) fs.mkdirSync('public/group-icons');
if (!fs.existsSync('public/uploads')) fs.mkdirSync('public/uploads');

const upload = multer({ dest: path.join(__dirname, 'public/avatars') });
const groupUpload = multer({ dest: path.join(__dirname, 'public/group-icons') });
const fileUpload = multer({ dest: path.join(__dirname, 'public/uploads') });

const usersFile = 'data/users.json';
const messagesFile = 'data/messages.json';
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]');
if (!fs.existsSync(messagesFile)) fs.writeFileSync(messagesFile, '[]');

const readUsers = () => JSON.parse(fs.readFileSync(usersFile));
const writeUsers = u => fs.writeFileSync(usersFile, JSON.stringify(u, null, 2));
const readMsgs = () => JSON.parse(fs.readFileSync(messagesFile));
const writeMsgs = m => fs.writeFileSync(messagesFile, JSON.stringify(m, null, 2));

// AES Encryption with random IV
const AES_KEY = "0123456789abcdef0123456789abcdef";
const encrypt = text => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', AES_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('base64');
};
const decrypt = enc => {
  try {
    const [ivHex, data] = enc.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', AES_KEY, iv);
    const decrypted = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '[UNREADABLE]';
  }
};

// Force-relogin middleware
app.use((req, res, next) => {
  // Allow login routes/resources
  if (req.path.startsWith('/api/login') || req.path.startsWith('/login') || req.path === '/' || req.path.startsWith('/css') || req.path.startsWith('/js') || req.path.startsWith('/socket.io')) {
    return next();
  }
  // If no valid session, redirect to login
  if (!req.session.username) {
    return res.redirect('/login');
  }
  // Clear session after serving route (enforce logout on refresh/back)
  req.session = null;
  next();
});

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => {
  if (req.session.username) return res.redirect('/chat.html');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/chat.html', (req, res) => {
  if (!req.session || !req.session.username) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});
app.get('/admin.html', (req, res) => {
  if (!req.session || !req.session.username) return res.redirect('/login');
  if (req.session.role !== 'admin') return res.status(403).send('Forbidden');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Authentication
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = readUsers().find(u => u.username === username);
  if (!user) return res.status(400).json({ error: 'Invalid username or password' });
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(400).json({ error: 'Invalid username or password' });
  req.session.username = username;
  req.session.role = user.role;
  res.json({ message: 'OK', role: user.role });
});
app.post('/api/logout', (req, res) => { req.session = null; res.json({ ok: true }); });

app.get('/api/session', (req, res) => {
  const me = readUsers().find(u => u.username === req.session?.username);
  res.json({
    username: req.session?.username || null,
    role: req.session?.role || 'user',
    email: me?.email || '',
    avatar: me ? `/avatars/${me.avatar}` : '/avatars/default.png'
  });
});
app.get('/api/allusers', (req, res) => {
  const users = readUsers();
  const online = Object.keys(onlineUsers);
  res.json(users.map(user => ({
    username: user.username,
    email: user.email,
    avatar: `/avatars/${user.avatar}`,
    role: user.role,
    online: online.includes(user.username)
  })));
});

// File upload
app.post('/api/upload', fileUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const filePath = `/uploads/${req.file.filename}`;
  res.json({ filePath, filename: req.file.originalname || req.file.filename });
});

// Socket.IO
let onlineUsers = {};
io.on('connection', socket => {
  let username = null;
  let userRole = 'user';

  const emitOnlineList = () => {
    const users = readUsers();
    const list = Object.keys(onlineUsers).map(u => {
      const data = users.find(x => x.username === u);
      return { username: u, avatar: data ? `/avatars/${data.avatar}` : '/avatars/default.png' };
    });
    io.emit('online', { list, groupName: groupChatName, groupIcon: `/group-icons/${groupChatIcon}` });
  };

  socket.on('join', name => {
    username = name;
    const me = readUsers().find(u => u.username === username);
    if (me) userRole = me.role;
    onlineUsers[username] = socket.id;

    const history = readMsgs()
      .filter(m => m.to === 'all' || m.to === username || m.from === username)
      .map(m => (m.type === 'file') ? { ...m } : { ...m, text: decrypt(m.text) });
    socket.emit('history', history);
    emitOnlineList();
  });

  socket.on('send', data => {
    const msg = { id: uuidv4(), from: username, to: data.to, text: encrypt(data.text), type: 'text', seen: [username] };
    const arr = readMsgs(); arr.push(msg); writeMsgs(arr);
    const toSend = { ...msg, text: data.text };
    if (data.to === 'all') io.emit('message', toSend);
    else {
      if (onlineUsers[username]) io.to(onlineUsers[username]).emit('message', toSend);
      if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('message', toSend);
    }
  });

  socket.on('fileMessage', data => {
    const msg = { id: uuidv4(), from: username, to: data.to, text: data.filePath, originalName: data.filename || "file.bin", type: 'file', seen: [username] };
    const arr = readMsgs(); arr.push(msg); writeMsgs(arr);
    if (data.to === 'all') io.emit('message', msg);
    else {
      if (onlineUsers[username]) io.to(onlineUsers[username]).emit('message', msg);
      if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('message', msg);
    }
  });

  socket.on('seen', msgId => {
    const msgs = readMsgs(); const msg = msgs.find(m => m.id === msgId);
    if (msg && !msg.seen.includes(username)) { msg.seen.push(username); writeMsgs(msgs); }
  });

  socket.on('delete', msgId => {
    const msgs = readMsgs(); const idx = msgs.findIndex(m => m.id === msgId);
    if (idx >= 0) {
      const msg = msgs[idx]; const isSender = msg.from === username; const isAdmin = userRole === 'admin';
      if (isSender || isAdmin) { msgs.splice(idx, 1); writeMsgs(msgs); io.emit('deleteMessage', msgId); }
    }
  });

  socket.on('disconnect', () => {
    if (onlineUsers[username]) delete onlineUsers[username];
    if (username) {
      let msgs = readMsgs();
      const users = readUsers().map(u => u.username);
      msgs = msgs.filter(m => {
        if (m.from === username) {
          if (m.to === 'all' && m.seen.length >= users.length) { io.emit('deleteMessage', m.id); return false; }
          if (m.to !== 'all' && m.seen.includes(m.from) && m.seen.includes(m.to)) { io.emit('deleteMessage', m.id); return false; }
        }
        return true;
      });
      writeMsgs(msgs);
    }
    emitOnlineList();
  });
});

server.listen(PORT, () => console.log(`RAW PROTOCOL running at http://localhost:${PORT}`));
