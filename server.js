// ===== RAW PROTOCOL Chat Server with MongoDB Atlas =====
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');


const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// ===== MongoDB Connection =====
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('⚠️  Check your MONGODB_URI in .env file');
    process.exit(1);
  });

// ===== MongoDB Schemas =====

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, default: '', trim: true },
  passwordHash: { type: String, required: true },
  pin: { type: String, default: null },
  role: { type: String, default: 'user', enum: ['user', 'admin'] },
  status: { type: String, default: 'pending', enum: ['pending', 'approved', 'rejected'] },
  avatar: { type: String, default: 'default.png' },
  emailNotifications: { type: Boolean, default: false },
  locked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Message Schema
const messageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  text: { type: String, required: true },
  type: { type: String, default: 'text', enum: ['text', 'file'] },
  originalName: { type: String, default: '' },
  seen: { type: [String], default: [] },
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// Notification Schema
const notificationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, default: () => uuidv4() },
  userId: { type: String, required: true },
  type: { type: String, required: true },
  message: { type: String, required: true },
  meta: { type: Object, default: {} },
  read: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

const Notification = mongoose.model('Notification', notificationSchema);

// Group Settings Schema
const groupSettingsSchema = new mongoose.Schema({
  name: { type: String, default: 'RAW PROTOCOL Main Room' },
  icon: { type: String, default: 'default-group.png' }
});

const GroupSettings = mongoose.model('GroupSettings', groupSettingsSchema);

// ===== Middleware & Configuration =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/avatars', express.static(path.join(__dirname, 'public/avatars')));
app.use('/group-icons', express.static(path.join(__dirname, 'public/group-icons')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Session cookie
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'super-secret-key'],
  maxAge: null
}));

// Prevent caching
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Multer configs
const upload = multer({ dest: path.join(__dirname, 'public/avatars') });
const groupUpload = multer({ dest: path.join(__dirname, 'public/group-icons') });
const fileUpload = multer({ dest: path.join(__dirname, 'public/uploads') });

// ===== Nodemailer Setup =====
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { 
    user: 'tiwanacaptain@gmail.com', 
    pass: 'bevn ennp xrsz tgkd' 
  }
});

// ===== Helper Functions =====

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

// Create notification helper
const createNotification = async (userId, type, message, meta = {}) => {
  try {
    const notification = new Notification({
      id: uuidv4(),
      userId,
      type,
      message,
      meta,
      read: false
    });
    await notification.save();

    // Emit to user if online
    if (onlineUsers[userId]) {
      io.to(onlineUsers[userId]).emit('new_notification', notification);
    }

    // Send email if enabled
    if (meta.sendEmail && meta.email) {
      const username = meta.username || userId || 'Member';
      const toAll = meta.toAll || false;

      const containerStyle = `max-width: 600px; margin: 40px auto; background: #001100; border: 2px solid #00ff00; border-radius: 8px; padding: 25px 30px; box-shadow: 0 0 10px #00ff00aa; font-family: 'Courier New', Courier, monospace; color: #00ff00;`;
      const headingStyle = `font-weight: bold; font-size: 28px; text-align: center; margin-bottom: 25px; background: linear-gradient(90deg, #a0ff8f, #00bf00); -webkit-background-clip: text; -webkit-text-fill-color: transparent;`;
      const pStyle = `font-size: 16px; line-height: 1.5; margin-bottom: 18px; color: #ccc;`;
      const blurredMsgStyle = `filter: blur(7px); background-color: #002200; border: 1px solid #00ff00; border-radius: 6px; padding: 18px; user-select: none; pointer-events: none; color: transparent; font-size: 16px; margin-bottom: 25px;`;
      const btnStyle = `display: inline-block; background: linear-gradient(90deg, #00bb00, #007f00); color: #001100 !important; font-weight: bold; padding: 14px 36px; border-radius: 6px; text-decoration: none; text-align: center; box-shadow: 0 0 8px #00ff00aa; font-family: 'Courier New', monospace;`;
      const hrStyle = `border-color: #003300; margin: 35px 0;`;
      const footerStyle = `font-size: 12px; color: #004400; text-align: center; letter-spacing: 1px; font-family: 'Courier New', Courier, monospace; margin: 0;`;

      let emailHtml = `
        <div style="${containerStyle}">
          <h2 style="${headingStyle}">Captain Tiwana's Crew Gallery</h2>
          <p style="${pStyle}">Hello <strong>${username}</strong>,</p>
      `;

      if (toAll) {
        emailHtml += `
          <p style="${pStyle}">Silent frames, hidden stories — your pass to the crew's secrets awaits.</p>
          <div style="${blurredMsgStyle}">[Message content concealed]</div>
          <p style="text-align:center; margin-top: 0;">
            <a href="https://chat-private-wsmb.onrender.com/" style="${btnStyle}">Watch Your Exclusive Clip</a>
          </p>
        `;
      } else {
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
        <p style="${footerStyle}">This message is delivered under strict confidentiality. Do not reply.</p>
      </div>
      `;

      await transporter.sendMail({
        from: 'Captain Tiwana\'s Crew Gallery <tiwanacaptain@gmail.com>',
        to: meta.email,
        subject: `Captain Tiwana's Crew Gallery: ${type}`,
        html: emailHtml
      });
    }
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};

// Middleware to ensure admin
function requireAdmin(req, res, next) {
  if (!req.session?.username || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ===== Serve Pages =====
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

// ===== Auth APIs =====


// Registration
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create new user
    const newUser = new User({
      username,
      email: email || '',
      passwordHash,
      status: 'pending',
      role: 'user',
      avatar: 'default.png',
      locked: false
    });

    await newUser.save();
    
    // Create notification
    await createNotification(username, 'Registration', 'Account created. Awaiting admin approval.');
    
    res.json({ message: 'Registration successful. Please wait for admin approval.' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'Invalid username or password' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(400).json({ error: 'Invalid username or password' });

    if (user.status !== 'approved') {
      return res.status(403).json({ error: 'Account not approved yet. Please wait for admin approval.' });
    }

    if (!user.pin) {
      return res.json({ message: 'PIN setup required', pinSetup: true, username });
    }

    req.session.username = username;
    req.session.role = user.role;
    
    await createNotification(username, 'Login', `Welcome back, ${username}!`, { 
      sendEmail: user.emailNotifications, 
      email: user.email 
    });

    res.json({ message: 'OK', role: user.role });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Logout
app.post('/api/logout', async (req, res) => {
  const username = req.session?.username;
  if (username) {
    await createNotification(username, 'Logout', 'You have been logged out successfully.');
  }
  req.session = null;
  res.json({ ok: true });
});

// Session info
app.get('/api/session', async (req, res) => {
  if (!req.session?.username) {
    return res.json({ username: null, role: 'user', email: '', avatar: '/avatars/default.png' });
  }
  
  try {
    const me = await User.findOne({ username: req.session.username });
    res.json({
      username: req.session.username,
      role: req.session.role || 'user',
      email: me?.email || '',
      avatar: me ? `/avatars/${me.avatar}` : '/avatars/default.png'
    });
  } catch (error) {
    res.json({ username: null, role: 'user', email: '', avatar: '/avatars/default.png' });
  }
});

// PIN Setup
app.post('/api/users/pin-setup', async (req, res) => {
  const { username, pin, emailNotifications } = req.body;

  if (!username || !pin || !/^\d{4,6}$/.test(pin)) {
    return res.status(400).json({ error: 'Invalid input. PIN must be 4 to 6 digits.' });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.pin = await bcrypt.hash(pin, 10);
    user.emailNotifications = !!emailNotifications;
    await user.save();

    res.json({ message: 'PIN setup successful.' });
  } catch (error) {
    console.error('Error in pin-setup:', error);
    res.status(500).json({ error: 'Server error during PIN setup.' });
  }
});

// Verify PIN
app.post('/api/verify-pin', async (req, res) => {
  const { username, pin } = req.body;
  if (!username || !pin) return res.status(400).json({ error: 'Missing data' });

  try {
    const user = await User.findOne({ username });
    if (!user || !user.pin) return res.status(400).json({ error: 'No PIN set for this user' });

    const isMatch = await bcrypt.compare(pin, user.pin);
    if (isMatch) {
      await createNotification(username, 'Access Granted', 'PIN verification successful. Access granted to secure chat.');
      return res.json({ message: "OK" });
    } else {
      return res.status(403).json({ error: 'Invalid PIN' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== User APIs =====

// Get all users (for sidebar)
app.get('/api/allusers', async (req, res) => {
  try {
    const users = await User.find({});
    const online = Object.keys(onlineUsers);
    res.json(users.map(user => ({
      username: user.username,
      email: user.email,
      avatar: `/avatars/${user.avatar}`,
      role: user.role,
      online: online.includes(user.username)
    })));
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user profile
app.put('/api/users/me', upload.single('avatar'), async (req, res) => {
  if (!req.session?.username) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const me = await User.findOne({ username: req.session.username });
    if (!me) return res.status(404).json({ error: 'User not found' });

    if (req.file) me.avatar = req.file.filename;
    if (req.body.email) me.email = req.body.email;
    
    if (req.body.username && req.body.username !== me.username) {
      const existing = await User.findOne({ username: req.body.username });
      if (existing) return res.status(400).json({ error: 'Username taken' });
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

    await me.save();
    res.json({ message: 'Profile updated' });
  } catch (error) {
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

// ===== Admin APIs =====

// Get users for admin panel
app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({});
    res.json(users.map(u => ({
      username: u.username,
      email: u.email,
      role: u.role,
      status: u.status || 'approved',
      emailNotifications: u.emailNotifications || false,
      avatar: u.avatar || 'default.png',
      locked: u.locked || false,
      pinRegistered: Boolean(u.pin)
    })));
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create user (admin)
app.post('/api/users', requireAdmin, async (req, res) => {
  const { username, email, password, role, pin, emailNotifications } = req.body;
  if (!username || !email || !password || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (pin && !/^\d{4,6}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be 4-6 digits' });
  }

  try {
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ error: 'Username already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const pinHash = pin ? await bcrypt.hash(pin, 10) : null;
    
    const newUser = new User({
      username,
      email,
      passwordHash,
      pin: pinHash,
      role,
      status: 'approved',
      emailNotifications: emailNotifications === 'true' || emailNotifications === true,
      avatar: 'default.png',
      locked: false
    });

    await newUser.save();
    res.json({ message: 'User created successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update user (admin)
app.put('/api/users', requireAdmin, async (req, res) => {
  const { originalUsername, username, email, password, pin, role, emailNotifications } = req.body;
  if (!originalUsername) return res.status(400).json({ error: 'Original username missing' });
  if (pin && !/^\d{4,6}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be 4-6 digits' });
  }

  try {
    const user = await User.findOne({ username: originalUsername });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (username && username !== originalUsername) {
      const existing = await User.findOne({ username });
      if (existing) return res.status(400).json({ error: 'New username already exists' });
    }

    if (username) user.username = username;
    if (email) user.email = email;
    if (typeof emailNotifications !== 'undefined') {
      user.emailNotifications = emailNotifications === 'true' || emailNotifications === true;
    }
    if (role) user.role = role;
    if (password) user.passwordHash = await bcrypt.hash(password, 10);
    if (pin) user.pin = await bcrypt.hash(pin, 10);

    await user.save();
    res.json({ message: 'User updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user (admin)
app.delete('/api/users/:username', requireAdmin, async (req, res) => {
  try {
    const result = await User.deleteOne({ username: req.params.username });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Approve user
app.post('/api/users/:username/approve', requireAdmin, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.role = 'user';
    user.status = 'approved';
    await user.save();

    res.json({ message: `User ${req.params.username} approved.` });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Reject user
app.post('/api/users/:username/reject', requireAdmin, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.role = 'rejected';
    user.status = 'rejected';
    await user.save();

    res.json({ message: `User ${req.params.username} rejected.` });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Lock user
app.post('/api/admin/lockuser', requireAdmin, async (req, res) => {
  const username = (req.body.username || '').toLowerCase();
  if (!username) return res.status(400).json({ error: 'Username is required.' });

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.locked = true;
    await user.save();

    lockedUsers.add(username);

    if (onlineUsers[username]) {
      io.to(onlineUsers[username]).emit('chatLockStateChanged', { locked: true });
      io.to(onlineUsers[username]).emit('notification', {
        title: 'Chat Locked',
        message: 'Your access to group chat has been restricted by Admin.'
      });
    }

    res.json({ message: `User ${username} locked from group chat.` });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Unlock user
app.post('/api/admin/unlockuser', requireAdmin, async (req, res) => {
  const username = (req.body.username || '').toLowerCase();
  if (!username) return res.status(400).json({ error: 'Username is required.' });

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found.' });

    user.locked = false;
    await user.save();

    lockedUsers.delete(username);

    if (onlineUsers[username]) {
      io.to(onlineUsers[username]).emit('chatLockStateChanged', { locked: false });
      io.to(onlineUsers[username]).emit('notification', {
        title: 'Chat Unlocked',
        message: 'Your access to group chat has been restored by Admin.'
      });
    }

    res.json({ message: `User ${username} unlocked for group chat.` });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Clear chat history
app.post('/api/admin/clearchat', requireAdmin, async (req, res) => {
  try {
    await Message.deleteMany({});
    io.emit('chatHistoryCleared');
    res.json({ message: 'Chat history cleared' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update group info
app.post('/api/groupinfo', requireAdmin, groupUpload.single('icon'), async (req, res) => {
  try {
    let settings = await GroupSettings.findOne();
    if (!settings) {
      settings = new GroupSettings();
    }

    if (req.body.name) settings.name = req.body.name;
    if (req.file) settings.icon = req.file.filename;

    await settings.save();
    res.json({ message: 'Group info updated' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== Notification APIs =====

// Get notifications
app.get('/api/notifications', async (req, res) => {
  if (!req.session?.username) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const notifications = await Notification.find({ userId: req.session.username })
      .sort({ timestamp: -1 });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', async (req, res) => {
  if (!req.session?.username) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const notification = await Notification.findOne({ 
      id: req.params.id, 
      userId: req.session.username 
    });
    
    if (notification) {
      notification.read = true;
      await notification.save();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Notification not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete all notifications
app.delete('/api/notifications/all', async (req, res) => {
  if (!req.session?.username) return res.status(401).json({ error: 'Not authenticated' });

  try {
    await Notification.deleteMany({ userId: req.session.username });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Send notification (admin)
app.post('/api/notifications/send', async (req, res) => {
  if (!req.session?.username || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { userId, type, message, sendEmail } = req.body;

  try {
    if (userId === 'all') {
      const users = await User.find({});
      for (const user of users) {
        await createNotification(user.username, type, message, {
          sendEmail: sendEmail && user.emailNotifications,
          email: user.email
        });
      }
    } else {
      const user = await User.findOne({ username: userId });
      if (user) {
        await createNotification(userId, type, message, {
          sendEmail: sendEmail && user.emailNotifications,
          email: user.email
        });
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== File Upload API =====
app.post('/api/upload', fileUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const filePath = `/uploads/${req.file.filename}`;
  res.json({ filePath, filename: req.file.originalname || req.file.filename });
});

// ===== Test Email API =====
app.get('/test-email-all', async (req, res) => {
  try {
    const users = await User.find({ emailNotifications: true, email: { $ne: '' } });
    const sendResults = [];

    for (const user of users) {
      try {
        await transporter.sendMail({
          from: 'RAW PROTOCOL <tiwanacaptain@gmail.com>',
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
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ===== Socket.IO for Real-time Chat =====
const onlineUsers = {};
const lockedUsers = new Set();
const emailNotificationTracker = {};

io.on('connection', socket => {
  let username = null;
  let userRole = 'user';

  const emitOnlineList = async () => {
    try {
      const users = await User.find({});
      const list = Object.keys(onlineUsers).map(u => {
        const data = users.find(x => x.username === u);
        return { 
          username: u, 
          avatar: data ? `/avatars/${data.avatar}` : '/avatars/default.png' 
        };
      });

      let settings = await GroupSettings.findOne();
      if (!settings) {
        settings = new GroupSettings();
        await settings.save();
      }

      io.emit('online', { 
        list, 
        groupName: settings.name, 
        groupIcon: `/group-icons/${settings.icon}` 
      });
    } catch (error) {
      console.error('Error emitting online list:', error);
    }
  };

  socket.on('join', async name => {
    username = name;
    
    try {
      const me = await User.findOne({ username });
      if (me) {
        userRole = me.role;
        onlineUsers[username] = socket.id;

        if (me.locked) {
          lockedUsers.add(username);
        }

        emailNotificationTracker[username] = { groupNotified: false, directNotified: false };

        const history = await Message.find({}).sort({ timestamp: 1 });
        const filteredHistory = history
          .filter(m => {
            if (lockedUsers.has(username) && m.to === 'all') return false;
            return m.to === 'all' || m.to === username || m.from === username;
          })
          .map(m => (m.type === 'file' ? m.toObject() : { ...m.toObject(), text: decrypt(m.text) }));

        socket.emit('history', filteredHistory);
        socket.emit('chatLockStateChanged', { locked: lockedUsers.has(username) });
        await emitOnlineList();
      }
    } catch (error) {
      console.error('Error on join:', error);
    }
  });

  socket.on('send', async data => {
    if (data.to === 'all' && lockedUsers.has(username)) {
      socket.emit('messageBlocked', { reason: 'Group chat is locked for you by Admin.' });
      return;
    }

    try {
      const msg = {
        id: uuidv4(),
        from: username,
        to: data.to,
        text: encrypt(data.text),
        type: 'text',
        seen: [username]
      };

      const newMessage = new Message(msg);
      await newMessage.save();

      const toSend = { ...msg, text: data.text };

      if (data.to === 'all') {
        const users = await User.find({});
        for (const u of users) {
          if (u.emailNotifications && u.username !== username) {
            if (!emailNotificationTracker[u.username]) {
              emailNotificationTracker[u.username] = { groupNotified: false, directNotified: false };
            }
            const notified = emailNotificationTracker[u.username];
            if (!notified.groupNotified) {
              await createNotification(u.username, 'NEW_CHAT_MESSAGE', data.text, {
                sendEmail: true,
                email: u.email,
                username: u.username,
                toAll: true
              });
              notified.groupNotified = true;
            }
          }
        }

        Object.entries(onlineUsers).forEach(([user, sockId]) => {
          if (!lockedUsers.has(user)) {
            io.to(sockId).emit('message', toSend);
          }
        });
      } else {
        if (onlineUsers[username]) io.to(onlineUsers[username]).emit('message', toSend);
        if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('message', toSend);

        const recipient = await User.findOne({ username: data.to });
        if (recipient?.emailNotifications) {
          if (!emailNotificationTracker[data.to]) {
            emailNotificationTracker[data.to] = { groupNotified: false, directNotified: false };
          }
          const notified = emailNotificationTracker[data.to];
          if (!notified.directNotified) {
            await createNotification(data.to, 'NEW_CHAT_MESSAGE', data.text, {
              sendEmail: true,
              email: recipient.email,
              username: recipient.username,
              toAll: false
            });
            notified.directNotified = true;
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  });

  socket.on('fileMessage', async data => {
    if (data.to === 'all' && lockedUsers.has(username)) {
      socket.emit('messageBlocked', { reason: 'Group chat is locked for you by Admin.' });
      return;
    }

    try {
      const msg = {
        id: uuidv4(),
        from: username,
        to: data.to,
        text: data.filePath,
        originalName: data.filename || 'file.bin',
        type: 'file',
        seen: [username]
      };

      const newMessage = new Message(msg);
      await newMessage.save();

      if (data.to === 'all') {
        const users = await User.find({});
        for (const u of users) {
          if (u.emailNotifications && u.username !== username) {
            if (!emailNotificationTracker[u.username]) {
              emailNotificationTracker[u.username] = { groupNotified: false, directNotified: false };
            }
            const notified = emailNotificationTracker[u.username];
            if (!notified.groupNotified) {
              await createNotification(u.username, 'FILE_RECEIVED', `File received in group chat`, {
                sendEmail: true,
                email: u.email
              });
              notified.groupNotified = true;
            }
          }
        }

        Object.entries(onlineUsers).forEach(([user, sockId]) => {
          if (!lockedUsers.has(user)) {
            io.to(sockId).emit('message', msg);
          }
        });
      } else {
        if (onlineUsers[username]) io.to(onlineUsers[username]).emit('message', msg);
        if (onlineUsers[data.to]) io.to(onlineUsers[data.to]).emit('message', msg);

        const recipient = await User.findOne({ username: data.to });
        if (recipient?.emailNotifications) {
          if (!emailNotificationTracker[data.to]) {
            emailNotificationTracker[data.to] = { groupNotified: false, directNotified: false };
          }
          const notified = emailNotificationTracker[data.to];
          if (!notified.directNotified) {
            await createNotification(data.to, 'FILE_RECEIVED', `File received from ${username}`, {
              sendEmail: true,
              email: recipient.email
            });
            notified.directNotified = true;
          }
        }
      }
    } catch (error) {
      console.error('Error sending file message:', error);
    }
  });

  socket.on('seen', async msgId => {
    try {
      const msg = await Message.findOne({ id: msgId });
      if (msg && !msg.seen.includes(username)) {
        msg.seen.push(username);
        await msg.save();
      }
    } catch (error) {
      console.error('Error marking message as seen:', error);
    }
  });

  socket.on('delete', async msgId => {
    try {
      const msg = await Message.findOne({ id: msgId });
      if (msg && (msg.from === username || userRole === 'admin')) {
        await Message.deleteOne({ id: msgId });
        io.emit('deleteMessage', msgId);
      }
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  });

  socket.on('disconnect', async () => {
    if (onlineUsers[username]) delete onlineUsers[username];
    
    if (username) {
      try {
        const messages = await Message.find({ from: username });
        const users = await User.find({});
        const usernames = users.map(u => u.username);

        for (const m of messages) {
          if (m.to === 'all' && m.seen.length >= usernames.length) {
            await Message.deleteOne({ id: m.id });
            io.emit('deleteMessage', m.id);
          } else if (m.to !== 'all' && m.seen.includes(m.from) && m.seen.includes(m.to)) {
            await Message.deleteOne({ id: m.id });
            io.emit('deleteMessage', m.id);
          }
        }
      } catch (error) {
        console.error('Error cleaning messages on disconnect:', error);
      }
    }

    if (username && emailNotificationTracker[username]) {
      delete emailNotificationTracker[username];
    }

    await emitOnlineList();
  });
});

// ===== Start Server =====
server.listen(PORT, () => {
  console.log(`🚀 RAW PROTOCOL running at http://localhost:${PORT}`);
  console.log(`📊 Database: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '⏳ Connecting...'}`);
});
