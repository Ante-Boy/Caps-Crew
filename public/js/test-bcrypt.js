const bcrypt = require('bcrypt');

const storedHash = '$2b$10$Hfo6IyGxWAdpeGREN9R26OUMWYgqfoISTywt8.7X7HblO/4CzPIxq'; // Hash for 'password123'
const inputPassword = 'password123';

bcrypt.compare(inputPassword, storedHash, (err, result) => {
  if (err) throw err;
  console.log('Password match? ', result); // Should print: true
});
