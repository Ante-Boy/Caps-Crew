// routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const usersFile = path.join(__dirname, '../data/users.json');

// Helper to read users file
function readUsers() {
  try {
    const data = fs.readFileSync(usersFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Helper to write users file
function writeUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

// Registration route
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  const users = readUsers();

  // Check if username or email already exists (case insensitive)
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ message: 'Username or email already registered' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const newUser = {
      username,
      email,
      passwordHash,
      pin: null,
      role: 'user',
      avatar: 'default.png',
      locked: false,
      emailNotifications: true,
      status: 'pending'  // Pending approval by default
    };

    users.push(newUser);
    writeUsers(users);

    return res.status(201).json({ message: 'Registration successful! Your account is pending admin approval.' });
  } catch (error) {
    console.error('Error registering user:', error);
    return res.status(500).json({ message: 'Server error during registration' });
  }
});

module.exports = router;
