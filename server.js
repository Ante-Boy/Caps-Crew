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
const nodemailer = require('nodemailer');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;


const authRoutes = require('./routes/auth'); // Adjust path if needed



// Group chat settings
let groupChatName = "RAW PROTOCOL Main Room";
let groupChatIcon = "default-group.png";

// === Admin: Toggle chat lock ===

const lockedUsers = new Set(); // Track locked usernames



let onlineUsers = {};


// Session cookie (dies on browser close)
app.use(cookieSession({
  name: 'session',
  keys: ['super-secret-key'],
  maxAge: null
}));

// Prevent caching
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', authRoutes);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/avatars', express.static(path.join(__dirname, 'public/avatars')));
app.use('/group-icons', express.static(path.join(__dirname, 'public/group-icons')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

//PIN SETUP THING 

app.post('/api/users/pin-setup', async (req, res) => {
  const { username, pin, emailNotifications } = req.body;

  if (!username || !pin || !/^\d{4,6}$/.test(pin)) {
    return res.status(400).json({ error: 'Invalid input. PIN must be 4 to 6 digits.' });
  }

  try {
    const users = readUsers();
    const user = users.find(u => u.username === username);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    user.pin = await bcrypt.hash(pin, 10);
    user.emailNotifications = !!emailNotifications;

    writeUsers(users);

    res.json({ message: 'PIN setup successful.' });
  } catch (err) {
    console.error('Error in /api/users/pin-setup:', err);
    res.status(500).json({ error: 'Server error during PIN setup.' });
  }
});

// Create directories if they don't exist
['data', 'public/avatars', 'public/group-icons', 'public/uploads'].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer configs
const upload = multer({ dest: path.join(__dirname, 'public/avatars') });
const groupUpload = multer({ dest: path.join(__dirname, 'public/group-icons') });
const fileUpload = multer({ dest: path.join(__dirname, 'public/uploads') });

// File paths
const usersFile = 'data/users.json';
const messagesFile = 'data/messages.json';
const notificationsFile = 'data/notifications.json';

// Initialize files if missing
[usersFile, messagesFile, notificationsFile].forEach(file => {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
});

// Helpers to read/write files
const readUsers = () => JSON.parse(fs.readFileSync(usersFile));
const writeUsers = users => fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
const readMsgs = () => JSON.parse(fs.readFileSync(messagesFile));
const writeMsgs = msgs => fs.writeFileSync(messagesFile, JSON.stringify(msgs, null, 2));
const readNotifications = () => JSON.parse(fs.readFileSync(notificationsFile));
const writeNotifications = notifications => fs.writeFileSync(notificationsFile, JSON.stringify(notifications, null, 2));

// Nodemailer setup
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: 'tiwanacaptain@gmail.com', pass: 'bevn ennp xrsz tgkd' }
});

// Create notification helper
const createNotification = (userId, type, message, meta = {}) => {
  const notifications = readNotifications();
  const notification = {
    id: uuidv4(),
    userId, type, message, meta,
    read: false,
    timestamp: new Date().toISOString()
  };
  notifications.push(notification);
  writeNotifications(notifications);

  if (onlineUsers[userId]) io.to(onlineUsers[userId]).emit('new_notification', notification);

  if (meta.sendEmail && meta.email) {
    const username = meta.username || userId || 'Member';
    const toAll = meta.toAll || false; // Flag to distinguish group or DM

    // Common styles - inline for wide client support
    const containerStyle = `
      max-width: 600px;
      margin: 40px auto;
      background: #001100;
      border: 2px solid #00ff00;
      border-radius: 8px;
      padding: 25px 30px;
      box-shadow: 0 0 10px #00ff00aa;
      font-family: 'Courier New', Courier, monospace;
      color: #00ff00;
    `;

    const headingStyle = `
      font-weight: bold;
      font-size: 28px;
      text-align: center;
      margin-bottom: 25px;
      background: linear-gradient(90deg, #a0ff8f, #00bf00);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    `;

    const pStyle = `
      font-size: 16px;
      line-height: 1.5;
      margin-bottom: 18px;
      color: #ccc;
    `;

    const blurredMsgStyle = `
      filter: blur(7px);
      background-color: #002200;
      border: 1px solid #00ff00;
      border-radius: 6px;
      padding: 18px;
      user-select: none;
      pointer-events: none;
      color: transparent;
      font-size: 16px;
      margin-bottom: 25px;
    `;

    const btnStyle = `
      display: inline-block;
      background: linear-gradient(90deg, #00bb00, #007f00);
      color: #001100 !important;
      font-weight: bold;
      padding: 14px 36px;
      border-radius: 6px;
      text-decoration: none;
      text-align: center;
      box-shadow: 0 0 8px #00ff00aa;
      font-family: 'Courier New', monospace;
    `;

    const hrStyle = `border-color: #003300; margin: 35px 0;`;

    const footerStyle = `
      font-size: 12px;
      color: #004400;
      text-align: center;
      letter-spacing: 1px;
      font-family: 'Courier New', Courier, monospace;
      margin: 0;
    `;

    let emailHtml = `
      <div style="${containerStyle}">
        <h2 style="${headingStyle}">Captain Tiwana’s Crew Gallery</h2>
        <p style="${pStyle}">Hello <strong>${username}</strong>,</p>
    `;

    if (toAll) {
      // Group message
      emailHtml += `
        <p style="${pStyle}">Silent frames, hidden stories — your pass to the crew’s secrets awaits.</p>
        <div style="${blurredMsgStyle}">[Message content concealed]</div>
        <p style="text-align:center; margin-top: 0;">
          <a href="https://chat-private-wsmb.onrender.com/" style="${btnStyle}">Watch Your Exclusive Clip</a>
        </p>
      `;
    } else {
      // Personal DM
      emailHtml += `
        <p style="${pStyle}">Behind closed frames, your private story patiently awaits your gaze.</p>
        <div style="${blurredMsgStyle}">[Message content concealed]</div>
        <p style="text-align:center; margin-top: 0;">
          <a href="https://chat-private-wsmb.onrender.com/" style="${btnStyle}">View Your Private Showcase</a>
        </p>
      `;
    }

    emailHtml += `
      <hr style="${hrStyle}" />
      <p style="${footerStyle}">
        This message is delivered under strict confidentiality. Do not reply.
      </p>
    </div>
    `;

    transporter.sendMail({
      from: 'Captain Tiwana’s Crew Gallery <tiwanacaptain@gmail.com>',
      to: meta.email,
      subject: `Captain Tiwana’s Crew Gallery: ${type}`,
      html: emailHtml
    }).catch(console.error);
  }

  return notification;
};


// Encryption helpers
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

// Middleware to ensure admin
function requireAdmin(req, res, next) {
  if (!req.session?.username || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}


// Serve pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.redirect('/login.html'));
app.get('/login.html', (req, res) => {
  if (req.session?.username) return res.redirect('/loading.html');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/loading.html', (req, res) => {
  if (!req.session?.username) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'loading.html'));
});
app.get('/chat.html', (req, res) => {
  if (!req.session?.username) return res.redirect('/login.html');
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});
app.get('/admin.html', (req, res) => {
  if (!req.session?.username) return res.redirect('/login.html');
  if (req.session.role !== 'admin') return res.status(403).send('Forbidden');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Auth API
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = readUsers().find(u => u.username === username);
  if (!user) return res.status(400).json({ error: 'Invalid username or password' });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(400).json({ error: 'Invalid username or password' });

  // Check approval status before allowing login
  if (user.status !== 'approved') {
    return res.status(403).json({ error: 'Account not approved yet. Please wait for admin approval.' });
  }

  // NEW: Check if pin set, if not request pin setup
  if (!user.pin) {
    return res.json({ message: 'PIN setup required', pinSetup: true, username });
  }

  req.session.username = username;
  req.session.role = user.role;
  createNotification(username, 'Login', `Welcome back, ${username}!`, { sendEmail: user.emailNotifications, email: user.email });
  res.json({ message: 'OK', role: user.role });
});


app.post('/api/logout', (req, res) => {
  const username = req.session?.username;
  if (username) createNotification(username, 'Logout', 'You have been logged out successfully.');
  req.session = null;
  res.json({ ok: true });
});
app.get('/api/session', (req, res) => {
  const me = readUsers().find(u => u.username === req.session?.username);
  res.json({
    username: req.session?.username || null,
    role: req.session?.role || 'user',
    email: me?.email || '',
    avatar: me ? `/avatars/${me.avatar}` : '/avatars/default.png'
  });
});

// Users APIs
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

// User profile update
app.put('/api/users/me', upload.single('avatar'), async (req, res) => {
  if (!req.session?.username) return res.status(401).json({ error: 'Not authenticated' });
  const users = readUsers();
  const me = users.find(u => u.username === req.session.username);
  if (!me) return res.status(404).json({ error: 'User not found' });
  try {
    if (req.file) me.avatar = req.file.filename;
    if (req.body.email) me.email = req.body.email;
    if (req.body.username && req.body.username !== me.username) {
      if (users.some(u => u.username === req.body.username)) return res.status(400).json({ error: 'Username taken' });
      me.username = req.body.username;
      req.session.username = me.username;
    }
    if (req.body.oldpass && req.body.newpass) {
      const match = await bcrypt.compare(req.body.oldpass, me.passwordHash);
      if (!match) return res.status(400).json({ error: 'Old password incorrect' });
      me.passwordHash = await bcrypt.hash(req.body.newpass, 10);
    }
    if (req.body.oldpin && req.body.newpin) {
      if (!me.pin) return res.status(400).json({ error: 'No PIN set for this user' });
      const pinMatch = await bcrypt.compare(req.body.oldpin, me.pin);
      if (!pinMatch) return res.status(400).json({ error: 'Old PIN incorrect' });
      me.pin = await bcrypt.hash(req.body.newpin, 10);
    }
    writeUsers(users);
    res.json({ message: 'Profile updated' });
  } catch (error) {
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

// Admin management APIs
// Ensure admin middleware 'requireAdmin' is defined above this

app.get('/api/users', requireAdmin, (req, res) => {
  const users = readUsers();
  res.json(users.map(u => ({
    username: u.username,
    email: u.email,
    role: u.role,
    status: u.status || 'approved',
    emailNotifications: u.emailNotifications || false,
    avatar: u.avatar || 'default.png',
    locked: u.locked || false,
    pinRegistered: Boolean(u.pin) // add this field
  })));
});


app.post('/api/users', requireAdmin, async (req, res) => {
  const { username, email, password, role, pin, emailNotifications } = req.body;
  if (!username || !email || !password || !role) return res.status(400).json({ error: 'Missing required fields' });
  if (pin && !/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4-6 digits' });
  let users = readUsers();
  if (users.some(u => u.username === username)) return res.status(400).json({ error: 'Username already exists' });
  const passwordHash = await bcrypt.hash(password, 10);
  const pinHash = pin ? await bcrypt.hash(pin, 10) : null;
  users.push({ username, email, passwordHash, pin: pinHash, role, emailNotifications: emailNotifications === 'true' || emailNotifications === true, avatar: 'default.png', locked: false });
  writeUsers(users);
  res.json({ message: 'User created successfully' });
});

app.put('/api/users', requireAdmin, async (req, res) => {
  const { originalUsername, username, email, password, pin, role, emailNotifications } = req.body;
  if (!originalUsername) return res.status(400).json({ error: 'Original username missing' });
  if (pin && !/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4-6 digits' });
  let users = readUsers();
  const user = users.find(u => u.username === originalUsername);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (username && username !== originalUsername && users.some(u => u.username === username)) {
    return res.status(400).json({ error: 'New username already exists' });
  }
  if (username) user.username = username;
  if (email) user.email = email;
  if (typeof emailNotifications !== 'undefined') user.emailNotifications = emailNotifications === 'true' || emailNotifications === true;
  if (role) user.role = role;
  if (password) user.passwordHash = await bcrypt.hash(password, 10);
  if (pin) user.pin = await bcrypt.hash(pin, 10);
  writeUsers(users);
  res.json({ message: 'User updated successfully' });
});

app.delete('/api/users/:username', requireAdmin, (req, res) => {
  const username = req.params.username;
  let users = readUsers();
  const beforeCount = users.length;
  users = users.filter(u => u.username !== username);
  if (users.length === beforeCount) return res.status(404).json({ error: 'User not found' });
  writeUsers(users);
  res.json({ message: 'User deleted successfully' });
});

app.post('/api/groupinfo', requireAdmin, groupUpload.single('icon'), (req, res) => {
  if (req.body.name) groupChatName = req.body.name;
  if (req.file) groupChatIcon = req.file.filename;
  res.json({ message: 'Group info updated' });
});

app.post('/api/verify-pin', async (req, res) => {
  const { username, pin } = req.body;
  if (!username || !pin) return res.status(400).json({ error: 'Missing data' });
  const user = readUsers().find(u => u.username === username);
  if (!user || !user.pin) return res.status(400).json({ error: 'No PIN set for this user' });
  const isMatch = await bcrypt.compare(pin, user.pin);
  if (isMatch) {
    createNotification(username, 'Access Granted', 'PIN verification successful. Access granted to secure chat.');
    return res.json({ message: "OK" });
  } else {
    return res.status(403).json({ error: 'Invalid PIN' });
  }
});

// === Admin: Clear chat history ===
app.post('/api/admin/clearchat', requireAdmin, (req, res) => {
  writeMsgs([]); // empty message history file
  io.emit('chatHistoryCleared'); // notify clients to clear UI
  res.json({ message: 'Chat history cleared' });
});

// Admin: Lock user with persistent update and notification
app.post('/api/admin/lockuser', requireAdmin, (req, res) => {
  const username = (req.body.username || '').toLowerCase();
  if (!username) return res.status(400).json({ error: 'Username is required.' });

  let users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  user.locked = true;
  writeUsers(users);

  lockedUsers.add(username);

  if (onlineUsers[username]) {
    io.to(onlineUsers[username]).emit('chatLockStateChanged', { locked: true });
    io.to(onlineUsers[username]).emit('notification', {
      title: 'Chat Locked',
      message: 'Your access to group chat has been restricted by Admin.'
    });
  }

  res.json({ message: `User ${username} locked from group chat.`, lockedUsers: Array.from(lockedUsers) });
});

// Admin: Unlock user with persistent update and notification
app.post('/api/admin/unlockuser', requireAdmin, (req, res) => {
  const username = (req.body.username || '').toLowerCase();
  if (!username) return res.status(400).json({ error: 'Username is required.' });

  let users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  user.locked = false;
  writeUsers(users);

  lockedUsers.delete(username);

  if (onlineUsers[username]) {
    io.to(onlineUsers[username]).emit('chatLockStateChanged', { locked: false });
    io.to(onlineUsers[username]).emit('notification', {
      title: 'Chat Unlocked',
      message: 'Your access to group chat has been restored by Admin.'
    });
  }

  res.json({ message: `User ${username} unlocked for group chat.`, lockedUsers: Array.from(lockedUsers) });
});
// Approve user API
app.post('/api/users/:username/approve', requireAdmin, (req, res) => {
  const username = req.params.username;
  let users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.role = 'user'; // or 'approved' depending on your system
  user.status = 'approved';
  writeUsers(users);
  res.json({ message: `User ${username} approved.` });
});

// Reject user API
app.post('/api/users/:username/reject', requireAdmin, (req, res) => {
  const username = req.params.username;
  let users = readUsers();
  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'User not found' });
  user.role = 'rejected'; // or set status accordingly
  user.status = 'rejected';
  writeUsers(users);
  res.json({ message: `User ${username} rejected.` });
});






// Notifications APIs
app.get('/api/notifications', (req, res) => {
  if (!req.session?.username) return res.status(401).json({ error: 'Not authenticated' });
  const notifications = readNotifications();
  const userNotifications = notifications.filter(n => n.userId === req.session.username).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(userNotifications);
});

app.put('/api/notifications/:id/read', (req, res) => {
  if (!req.session?.username) return res.status(401).json({ error: 'Not authenticated' });
  const notifications = readNotifications();
  const notification = notifications.find(n => n.id === req.params.id && n.userId === req.session.username);
  if (notification) {
    notification.read = true;
    writeNotifications(notifications);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Notification not found' });
  }
});

app.post('/api/notifications/send', (req, res) => {
  if (!req.session?.username || req.session.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  const { userId, type, message, sendEmail } = req.body;
  const users = readUsers();
  if (userId === 'all') {
    users.forEach(user => {
      createNotification(user.username, type, message, { sendEmail: sendEmail && user.emailNotifications, email: user.email });
    });
  } else {
    const user = users.find(u => u.username === userId);
    if (user) {
      createNotification(userId, type, message, { sendEmail: sendEmail && user.emailNotifications, email: user.email });
    }
  }
  res.json({ success: true });

app.post('/api/admin/lockuser', requireAdmin, (req, res) => {
  const username = req.body.username.toLowerCase();
  lockedUsers.add(username);
  notifyLockChange(username, true);
  res.json({ message: `${username} locked from group chat.` });
});

app.post('/api/admin/unlockuser', requireAdmin, (req, res) => {
  const username = req.body.username.toLowerCase();
  lockedUsers.delete(username);
  notifyLockChange(username, false);
  res.json({ message: `${username} unlocked for group chat.` });
});





});

// ===== Added DELETE /api/notifications/all =====
app.delete('/api/notifications/all', (req, res) => {
  if (!req.session?.username) return res.status(401).json({ error: 'Not authenticated' });

  const notifications = readNotifications();

  // Remove notifications belonging to current user
  const filtered = notifications.filter(n => n.userId !== req.session.username);

  writeNotifications(filtered);

  res.json({ success: true });
});

app.get('/test-email-all', async (req, res) => {
  const users = readUsers();
  const enabledUsers = users.filter(u => u.emailNotifications && u.email);
  const sendResults = [];

  for (const user of enabledUsers) {
    try {
      await transporter.sendMail({
        from: 'RAW PROTOCOL <tiwanacaptain@gmail.com>', // your sender
        to: user.email,
        subject: 'Test Email from RAW PROTOCOL',
        text: `Hello ${user.username}, this is a test email to verify your email notification settings.`,
      });
      sendResults.push({ user: user.username, email: user.email, status: 'Success' });
    } catch (error) {
      console.error(`Error sending test email to ${user.email}:`, error);
      sendResults.push({ user: user.username, email: user.email, status: 'Failed', error: error.message });
    }
  }

  res.json({ results: sendResults });
});



// File upload API
app.post('/api/upload', fileUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const filePath = `/uploads/${req.file.filename}`;
  res.json({ filePath, filename: req.file.originalname || req.file.filename });
});

// Socket.IO handlers for chat
const emailNotificationTracker = {};
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

  function notifyLockChange(username, locked) {
    if (onlineUsers[username]) {
      io.to(onlineUsers[username]).emit('chatLockStateChanged', { locked });
      io.to(onlineUsers[username]).emit('notification', {
        title: `Chat ${locked ? 'Locked' : 'Unlocked'}`,
        message: `Your group chat access has been ${locked ? 'restricted' : 'restored'} by Admin.`,
      });
    }
  }

  socket.on('join', name => {
    username = name;
    const me = readUsers().find(u => u.username === username);
    if (me) userRole = me.role;
    onlineUsers[username] = socket.id;

    // Initialize email notification flags for this session
    emailNotificationTracker[username] = { groupNotified: false, directNotified: false };

    const history = readMsgs()
      .filter(m => {
        if (lockedUsers.has(username) && m.to === 'all') return false; // hide group if locked
        return m.to === 'all' || m.to === username || m.from === username;
      })
      .map(m => (m.type === 'file' ? { ...m } : { ...m, text: decrypt(m.text) }));

    socket.emit('history', history);
    socket.emit('chatLockStateChanged', { locked: lockedUsers.has(username) });
    emitOnlineList();
  });

  socket.on('send', data => {
  if (data.to === 'all' && lockedUsers.has(username)) {
    socket.emit('messageBlocked', { reason: 'Group chat is locked for you by Admin.' });
    return;
  }
  const msg = { id: uuidv4(), from: username, to: data.to, text: encrypt(data.text), type: 'text', seen: [username] };
  const arr = readMsgs();
  arr.push(msg);
  writeMsgs(arr);
  const toSend = { ...msg, text: data.text };

  if (data.to === 'all') {
    // Notify all users with email notifications enabled (even offline)
    const users = readUsers();
    users.forEach(u => {
      if (u.emailNotifications && u.username !== username) {
        if (!emailNotificationTracker[u.username]) {
          emailNotificationTracker[u.username] = { groupNotified: false, directNotified: false };
        }
        const notified = emailNotificationTracker[u.username];
        if (!notified.groupNotified) {
          console.log(`Sending group message email notification to ${u.username} <${u.email}>`);
          createNotification(u.username, 'NEW_CHAT_MESSAGE', data.text, {
            sendEmail: true,
            email: u.email,
            username: u.username,
            toAll: true
          });
          notified.groupNotified = true;
        }
      }
    });
    // Emit message to online unlocked users as usual
    Object.entries(onlineUsers).forEach(([user, sockId]) => {
      if (!lockedUsers.has(user)) {
        io.to(sockId).emit('message', toSend);
      }
    });
  } else {
    // Direct message handling
    if (onlineUsers[username]) io.to(onlineUsers[username]).emit('message', toSend);
    if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('message', toSend);
    const recipient = readUsers().find(u => u.username === data.to);
    if (recipient?.emailNotifications) {
      if (!emailNotificationTracker[data.to]) {
        emailNotificationTracker[data.to] = { groupNotified: false, directNotified: false };
      }
      const notified = emailNotificationTracker[data.to];
      if (!notified.directNotified) {
        console.log(`Sending direct message email notification to ${recipient.username} <${recipient.email}>`);
        createNotification(data.to, 'NEW_CHAT_MESSAGE', data.text, {
          sendEmail: true,
          email: recipient.email,
          username: recipient.username,
          toAll: false
        });
        notified.directNotified = true;
        }
       }
     }
    });


     

  socket.on('fileMessage', data => {
    if (data.to === 'all' && lockedUsers.has(username)) {
      socket.emit('messageBlocked', { reason: 'Group chat is locked for you by Admin.' });
      return;
    }
    const msg = {
      id: uuidv4(),
      from: username,
      to: data.to,
      text: data.filePath,
      originalName: data.filename || 'file.bin',
      type: 'file',
      seen: [username],
    };
    const arr = readMsgs();
    arr.push(msg);
    writeMsgs(arr);
    if (data.to === 'all') {
      // Notify all users with email notifications enabled (even offline)
      const users = readUsers();
      users.forEach(u => {
        if (u.emailNotifications && u.username !== username) {
          if (!emailNotificationTracker[u.username]) {
            emailNotificationTracker[u.username] = { groupNotified: false, directNotified: false };
          }
          const notified = emailNotificationTracker[u.username];
          if (!notified.groupNotified) {
            console.log(`Sending group file email notification to ${u.username} <${u.email}>`);
            createNotification(u.username, 'FILE_RECEIVED', `
              Notification Code: FILE_RECEIVED
              <br><a href="http://localhost:3000">Go to RAW PROTOCOL</a>
            `, { sendEmail: true, email: u.email });
            notified.groupNotified = true;
          }
        }
      });
      // Emit to online unlocked users
      Object.entries(onlineUsers).forEach(([user, sockId]) => {
        if (!lockedUsers.has(user)) {
          io.to(sockId).emit('message', msg);
        }
      });
    } else {
      if (onlineUsers[username]) io.to(onlineUsers[username]).emit('message', msg);
      if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('message', msg);
      const recipient = readUsers().find(u => u.username === data.to);
      if (recipient?.emailNotifications) {
        if (!emailNotificationTracker[data.to]) {
          emailNotificationTracker[data.to] = { groupNotified: false, directNotified: false };
        }
        const notified = emailNotificationTracker[data.to];
        if (!notified.directNotified) {
          console.log(`Sending direct file email notification to ${recipient.username} <${recipient.email}>`);
          createNotification(data.to, 'FILE_RECEIVED', `
            Notification Code: FILE_RECEIVED
            <br><a href="http://localhost:3000">Go to RAW PROTOCOL</a>
          `, { sendEmail: true, email: recipient.email });
          notified.directNotified = true;
        }
      }
    }
  });

  socket.on('seen', msgId => {
    const msgs = readMsgs();
    const msg = msgs.find(m => m.id === msgId);
    if (msg && !msg.seen.includes(username)) {
      msg.seen.push(username);
      writeMsgs(msgs);
    }
  });

  socket.on('delete', msgId => {
    const msgs = readMsgs();
    const idx = msgs.findIndex(m => m.id === msgId);
    if (idx >= 0) {
      const msg = msgs[idx];
      if (msg.from === username || userRole === 'admin') {
        msgs.splice(idx, 1);
        writeMsgs(msgs);
        io.emit('deleteMessage', msgId);
      }
    }
  });

  socket.on('disconnect', () => {
    if (onlineUsers[username]) delete onlineUsers[username];
    if (username) {
      let msgs = readMsgs();
      const users = readUsers().map(u => u.username);
      msgs = msgs.filter(m => {
        if (m.from === username) {
          if (m.to === 'all' && m.seen.length >= users.length) {
            io.emit('deleteMessage', m.id);
            return false;
          }
          if (m.to !== 'all' && m.seen.includes(m.from) && m.seen.includes(m.to)) {
            io.emit('deleteMessage', m.id);
            return false;
          }
        }
        return true;
      });
      writeMsgs(msgs);
    }
    if (username && emailNotificationTracker[username]) {
      delete emailNotificationTracker[username];
    }
    emitOnlineList();
  });
});

server.listen(PORT, () => console.log(`RAW PROTOCOL running at http://localhost:${PORT}`));
