// Usage: node migrate-users-to-mongo.js
const fs = require('fs');
const mongoose = require('mongoose');

// 1. Update the path to your actual users.json:
const users = JSON.parse(fs.readFileSync('./data/users.json', 'utf-8'));

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://captain01:captain62840@chat-app-cluster.rjgvfyw.mongodb.net/chatapp?retryWrites=true&w=majority';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  passwordHash: String,
  pin: String,
  role: String,
  status: String,
  avatar: String,
  emailNotifications: Boolean,
  locked: Boolean,
  createdAt: Date
});

const User = mongoose.model('User', userSchema);

(async () => {
  try {
    for (const user of users) {
      await User.updateOne(
        { username: user.username },
        { $set: user },
        { upsert: true }
      );
      console.log(`Imported: ${user.username}`);
    }
    console.log('✅ All users imported to MongoDB');
    mongoose.disconnect();
  } catch (e) {
    console.error(e);
    mongoose.disconnect();
  }
})();
