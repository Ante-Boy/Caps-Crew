const bcrypt = require('bcrypt');

const storedHash = '$2b$10$SNr.CNHICaZO0u1X0Zx74uUuTbnQ71UM.0fX2RmcNwluDyzbhC9BK'; // Your hashed pin
const inputPin = '4050'; // Input pin to test

bcrypt.compare(inputPin, storedHash, (err, result) => {
  if (err) throw err;
  console.log('Pin match? ', result); // Expected output: true if pin matches
});
