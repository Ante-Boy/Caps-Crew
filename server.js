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
const upload = multer({ dest: path.join(__dirname, 'public/avatars') });
const groupUpload = multer({ dest: path.join(__dirname, 'public/group-icons') });

if (!fs.existsSync('data')) fs.mkdirSync('data');
if (!fs.existsSync('public/avatars')) fs.mkdirSync('public/avatars');
if (!fs.existsSync('public/group-icons')) fs.mkdirSync('public/group-icons');
const usersFile = 'data/users.json';
const messagesFile = 'data/messages.json';
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]');
if (!fs.existsSync(messagesFile)) fs.writeFileSync(messagesFile, '[]');

const readUsers = () => JSON.parse(fs.readFileSync(usersFile));
const writeUsers = (u) => fs.writeFileSync(usersFile, JSON.stringify(u, null, 2));
const readMsgs = () => JSON.parse(fs.readFileSync(messagesFile));
const writeMsgs = (m) => fs.writeFileSync(messagesFile, JSON.stringify(m, null, 2));

const AES_KEY = "0123456789abcdef0123456789abcdef";
const AES_IV  = "abcdef0123456789";
function encrypt(t) {
  const c = crypto.createCipheriv('aes-256-cbc', AES_KEY, AES_IV);
  let enc = c.update(t, 'utf8', 'base64');
  enc += c.final('base64');
  return enc;
}
function decrypt(t) {
  try {
    const d = crypto.createDecipheriv('aes-256-cbc', AES_KEY, AES_IV);
    let dec = d.update(t, 'base64', 'utf8');
    dec += d.final('utf8');
    return dec;
  } catch { return '[UNREADABLE]'; }
}
function adminOnly(req, res, next) {
  if (req.session.role !== 'admin') return res.status(403).end();
  next();
}

// Group info
app.get('/api/groupinfo', (req, res) => {
  res.json({ groupName: groupChatName, groupIcon: `/group-icons/${groupChatIcon}` });
});
app.post('/api/groupinfo', adminOnly, groupUpload.single('icon'), (req, res) => {
  if (req.body.name) groupChatName = req.body.name;
  if (req.file) groupChatIcon = req.file.filename;
  res.json({ message: 'Group info updated' });
});

app.post('/api/register', adminOnly, async (req, res) => {
  const { username, password, email, role } = req.body;
  const users = readUsers();
  if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Username exists' });
  const hash = await bcrypt.hash(password, 10);
  users.push({ username, passwordHash: hash, email, role: role || 'user', avatar: 'default.png' });
  writeUsers(users);
  res.json({ message: 'Registered' });
});
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = readUsers().find(u => u.username === username);
  if (!user) return res.status(400).json({ error: 'Invalid login' });
  if (!(await bcrypt.compare(password, user.passwordHash))) return res.status(400).json({ error: 'Invalid login' });
  req.session.username = username;
  req.session.role = user.role;
  res.json({ message: 'OK', role: user.role });
});
app.post('/api/logout', (req,res)=>{
  const username = req.session.username;
  if (username) {
    let messages = readMsgs();
    messages = messages.filter(m => {
      if (m.saved) return true;
      if (m.from === username && !m.seen.includes(m.to)) return true;
      if (m.to === username) return false;
      return true;
    });
    writeMsgs(messages);
  }
  req.session = null;
  res.json({ok:true});
});
app.get('/api/session', (req, res) => {
  const me = readUsers().find(u => u.username === req.session.username);
  res.json({
    username: req.session.username || null,
    role: req.session.role || 'user',
    email: me?.email || '',
    avatar: me ? `/avatars/${me.avatar}` : '/avatars/default.png'
  });
});
app.put('/api/users/me', upload.single('avatar'), (req, res) => {
  if (!req.session.username) return res.status(401).json({ error: 'Not logged in' });
  const users = readUsers();
  const me = users.find(u => u.username === req.session.username);
  if (!me) return res.status(404).json({ error: 'User not found' });

  if (req.body.username && req.body.username.trim() !== '' && req.body.username !== me.username) {
    if (users.find(u => u.username === req.body.username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    me.username = req.body.username.trim();
    req.session.username = me.username;
  }
  if (req.body.email && req.body.email.trim() !== '') {
    me.email = req.body.email.trim();
  }
  if (req.file) { me.avatar = req.file.filename; }
  if (req.body.newpass && req.body.newpass.trim() !== '') {
    if (req.session.role !== 'admin') {
      if (!bcrypt.compareSync(req.body.oldpass || '', me.passwordHash)) {
        return res.status(403).json({ error: 'Old password incorrect' });
      }
    }
    me.passwordHash = bcrypt.hashSync(req.body.newpass, 10);
  }
  writeUsers(users);
  res.json({ message: 'Profile updated successfully' });
});

// Admin user management
app.get('/api/users', adminOnly, (req, res) => {
  res.json(readUsers().map(({ passwordHash, ...u }) => u));
});
app.post('/api/users', adminOnly, async (req, res) => {
  const { username, password, email, role } = req.body;
  const users = readUsers();
  if (users.find(u => u.username === username)) return res.status(400).json({ error: 'Username exists' });
  const hash = await bcrypt.hash(password, 10);
  users.push({ username, passwordHash: hash, email, role: role || 'user', avatar: 'default.png' });
  writeUsers(users);
  res.json({ message: 'User added' });
});
app.delete('/api/users/:username', adminOnly, (req, res) => {
  writeUsers(readUsers().filter(u => u.username !== req.params.username));
  res.json({ message: 'Deleted' });
});
app.put('/api/users/role/:username', adminOnly, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.username === req.params.username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.role = req.body.role;
  writeUsers(users);
  res.json({ message: `${user.username} promoted to ${user.role}` });
});

// --- Socket.IO ---
let onlineUsers = {};
io.on('connection', socket => {
  let username = null;
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
    onlineUsers[username] = socket.id;
    const history = readMsgs()
      .filter(m => (m.to === 'all' || m.to === username || m.from === username))
      .map(m => ({ ...m, text: decrypt(m.text) }));
    socket.emit('history', history);
    emitOnlineList();
  });
  socket.on('send', data => {
    const msg = { id: uuidv4(), from: username, to: data.to, text: encrypt(data.text), saved: false, seen: [] };
    const arr = readMsgs();
    arr.push(msg);
    writeMsgs(arr);
    if (data.to === 'all') io.emit('message', { ...msg, text: data.text });
    else [username, data.to].forEach(u => {
      if (onlineUsers[u]) io.to(onlineUsers[u]).emit('message', { ...msg, text: data.text });
    });
  });
  socket.on('seen', id => {
    const msgs = readMsgs();
    const msg = msgs.find(m => m.id === id);
    if (msg && !msg.seen.includes(username)) {
      msg.seen.push(username);
      writeMsgs(msgs);
      io.emit('seenUpdate', { id, seen: msg.seen });
    }
  });
  socket.on('save', id => {
    const msgs = readMsgs();
    const msg = msgs.find(m => m.id === id);
    if (msg) { msg.saved = true; writeMsgs(msgs); io.emit('saveUpdate', { id }); }
  });
  socket.on('delete', id => {
    writeMsgs(readMsgs().filter(m => m.id !== id));
    io.emit('deleteUpdate', id);
  });
  socket.on('disconnect', () => {
    if (onlineUsers[username]) delete onlineUsers[username];
    emitOnlineList();
  });
});

server.listen(PORT, () => console.log(`RAW PROTOCOL running on http://localhost:${PORT}`));
