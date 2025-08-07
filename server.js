const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const usersFilePath = path.join(__dirname, 'data', 'users.json');
const messagesFilePath = path.join(__dirname, 'data', 'messages.json');

function ensureDataFiles() {
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(usersFilePath)) fs.writeFileSync(usersFilePath, '[]', 'utf8');
  if (!fs.existsSync(messagesFilePath)) fs.writeFileSync(messagesFilePath, '[]', 'utf8');
}
ensureDataFiles();

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
  } catch (e) {
    console.error('Error reading users:', e);
    return [];
  }
}
function writeUsers(users) {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('Error writing users:', e);
  }
}
function readMessages() {
  try {
    return JSON.parse(fs.readFileSync(messagesFilePath, 'utf8'));
  } catch (e) {
    console.error('Error reading messages:', e);
    return [];
  }
}
function writeMessages(messages) {
  try {
    fs.writeFileSync(messagesFilePath, JSON.stringify(messages, null, 2));
  } catch (e) {
    console.error('Error writing messages:', e);
  }
}

const allowedRoles = ['admin', 'agent'];
const onlineUsers = new Map();

function markUserOnline(username) {
  onlineUsers.set(username, Date.now());
}
function updateUserActivity(username) {
  if (onlineUsers.has(username)) {
    onlineUsers.set(username, Date.now());
  }
}
function getUsersWithOnlineStatus() {
  const users = readUsers();
  const now = Date.now();
  return users.map(u => ({
    id: u.id,
    username: u.username,
    role: u.role,
    online: onlineUsers.has(u.username) && (now - onlineUsers.get(u.username) < 120000),
  }));
}

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ error: 'Username and password are required' });

    const users = readUsers();
    const user = users.find(u => u.username === username);
    if (!user)
      return res.status(400).json({ error: 'Invalid username or password' });

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword)
      return res.status(400).json({ error: 'Invalid username or password' });

    markUserOnline(user.username);
    const { passwordHash, ...userSafe } = user;
    res.json(userSafe);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users', (req, res) => {
  try {
    const users = getUsersWithOnlineStatus();
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to read users' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role)
      return res.status(400).json({ error: 'Missing username, password, or role' });

    if (!allowedRoles.includes(role))
      return res.status(400).json({ error: 'Invalid user role' });

    const users = readUsers();
    if (users.some(u => u.username === username))
      return res.status(400).json({ error: 'Username already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = { id: uuidv4(), username, passwordHash, role };

    users.push(newUser);
    writeUsers(users);

    const { passwordHash: _, ...userSafe } = newUser;
    res.status(201).json(userSafe);
  } catch (error) {
    console.error('Add user error:', error);
    res.status(500).json({ error: 'Failed to add user' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, password, role } = req.body;

    const users = readUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) return res.status(404).json({ error: 'User not found' });

    if (username) {
      if (users.some((u, i) => u.username === username && i !== index))
        return res.status(400).json({ error: 'Username already exists' });
      users[index].username = username;
    }
    if (role) {
      if (!allowedRoles.includes(role))
        return res.status(400).json({ error: 'Invalid user role' });
      users[index].role = role;
    }
    if (password) {
      users[index].passwordHash = await bcrypt.hash(password, 10);
    }
    writeUsers(users);
    const { passwordHash, ...userSafe } = users[index];
    res.json(userSafe);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    const userId = req.params.id;
    let users = readUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1) return res.status(404).json({ error: 'User not found' });

    users.splice(index, 1);
    writeUsers(users);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.get('/api/messages', (req, res) => {
  try {
    const username = req.query.username;
    if (username) updateUserActivity(username);

    const messages = readMessages();
    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to read messages' });
  }
});

app.post('/api/messages', (req, res) => {
  try {
    const { from, to, text, timestamp } = req.body;
    if (!from || !to || !text)
      return res.status(400).json({ error: 'Missing from, to, or text fields' });

    updateUserActivity(from);

    const messages = readMessages();
    const newMessage = {
      id: uuidv4(),
      from,
      to,
      text,
      timestamp: typeof timestamp === 'number' ? timestamp : Date.now(),
    };
    messages.push(newMessage);
    writeMessages(messages);
    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Post message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
