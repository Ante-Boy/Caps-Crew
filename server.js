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

let groupChatName = "RAW PROTOCOL Main Room";
let groupChatIcon = "default-group.png";

app.use(cookieSession({
  name: 'session',
  keys: ['super-secret-key'],
  maxAge: 24 * 60 * 60 * 1000
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/avatars', express.static(path.join(__dirname, 'public/avatars')));
app.use('/group-icons', express.static(path.join(__dirname, 'public/group-icons')));

if (!fs.existsSync('data')) fs.mkdirSync('data');
if (!fs.existsSync('public/avatars')) fs.mkdirSync('public/avatars');
if (!fs.existsSync('public/group-icons')) fs.mkdirSync('public/group-icons');

const upload = multer({ dest: path.join(__dirname, 'public/avatars') });
const groupUpload = multer({ dest: path.join(__dirname, 'public/group-icons') });

const usersFile = 'data/users.json';
const messagesFile = 'data/messages.json';
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]');
if (!fs.existsSync(messagesFile)) fs.writeFileSync(messagesFile, '[]');

const readUsers = () => JSON.parse(fs.readFileSync(usersFile));
const writeUsers = u => fs.writeFileSync(usersFile, JSON.stringify(u, null, 2));
const readMsgs = () => JSON.parse(fs.readFileSync(messagesFile));
const writeMsgs = m => fs.writeFileSync(messagesFile, JSON.stringify(m, null, 2));

const AES_KEY = "0123456789abcdef0123456789abcdef";
const AES_IV  = "abcdef0123456789";
const encrypt = text => {
  const cipher = crypto.createCipheriv('aes-256-cbc', AES_KEY, AES_IV);
  return cipher.update(text, 'utf8', 'base64') + cipher.final('base64');
};
const decrypt = text => {
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', AES_KEY, AES_IV);
    return decipher.update(text, 'base64', 'utf8') + decipher.final('utf8');
  } catch { return '[UNREADABLE]'; }
};

const adminOnly = (req, res, next) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
};

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => {
  if (req.session.username) return res.redirect('/chat.html');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/chat.html', (req, res) => {
  if (!req.session.username) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});
app.get('/admin.html', (req, res) => {
  if (!req.session.username) return res.redirect('/login');
  if (req.session.role !== 'admin') return res.status(403).send('Forbidden');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

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
  const me = readUsers().find(u => u.username === req.session.username);
  res.json({
    username: req.session.username || null,
    role: req.session.role || 'user',
    email: me?.email || '',
    avatar: me ? `/avatars/${me.avatar}` : '/avatars/default.png'
  });
});

app.get('/api/users', adminOnly, (req, res) => {
  res.json(readUsers().map(({ passwordHash, ...u }) => u));
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

// SOCKET.IO
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
      .map(m => ({ ...m, text: decrypt(m.text) }));
    socket.emit('history', history);
    emitOnlineList();
  });

  // Send
  socket.on('send', data => {
    const msg = { 
      id: uuidv4(), 
      from: username, 
      to: data.to, 
      text: encrypt(data.text), 
      saved: false, 
      seen: [username] 
    };
    const arr = readMsgs();
    arr.push(msg);
    writeMsgs(arr);

    if (data.to === 'all') {
      io.emit('message', { ...msg, text: data.text });
    } else {
      if (onlineUsers[username]) io.to(onlineUsers[username]).emit('message', { ...msg, text: data.text });
      if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('message', { ...msg, text: data.text });
    }
  });

  // Seen tracking: mark as seen, don't delete yet
  socket.on('seen', msgId => {
    const msgs = readMsgs();
    const msg = msgs.find(m => m.id === msgId);
    if (msg && !msg.seen.includes(username)) {
      msg.seen.push(username);
      writeMsgs(msgs);
    }
  });

  // Delete for everyone (sender or admin)
  socket.on('delete', msgId => {
    const msgs = readMsgs();
    const idx = msgs.findIndex(m => m.id === msgId);
    if (idx >= 0) {
      const msg = msgs[idx];
      const isSender = msg.from === username;
      const isAdmin = userRole === 'admin';
      if (isSender || isAdmin) {
        msgs.splice(idx, 1);
        writeMsgs(msgs);
        io.emit('deleteMessage', msgId);
      }
    }
  });

  // On disconnect: remove sender's seen-by-all messages
  socket.on('disconnect', () => {
    if (onlineUsers[username]) delete onlineUsers[username];

    if (username) {
      let msgs = readMsgs();
      const users = readUsers().map(u => u.username);

      msgs = msgs.filter(m => {
        if (m.from === username) {
          // Group: seen by everyone
          if (m.to === 'all' && m.seen.length >= users.length) {
            io.emit('deleteMessage', m.id);
            return false; // remove from storage
          }
          // DM: seen by both
          if (m.to !== 'all' && m.seen.includes(m.from) && m.seen.includes(m.to)) {
            io.emit('deleteMessage', m.id);
            return false;
          }
        }
        return true;
      });

      writeMsgs(msgs);
    }

    emitOnlineList();
  });
});

server.listen(PORT, () => console.log(`RAW PROTOCOL running at http://localhost:${PORT}`));
