const bcrypt = require('bcrypt');

const storedHash = '$2b$10$SoztfTY7vHz1o/bYqVazmey.0uEWhszSeM/ZnFB45jlmwKyAYfaXO'; // Hash for 'adminpass'
const inputPassword = 'adminpass';

bcrypt.compare(inputPassword, storedHash, (err, result) => {
  if (err) throw err;
  console.log('Password match? ', result); // Should print: true
});
