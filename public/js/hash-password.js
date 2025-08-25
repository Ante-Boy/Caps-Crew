const bcrypt = require('bcryptjs');

const pin = "4050";
bcrypt.hash(pin, 10, (err, hash) => {
  if (err) throw err;
  console.log("Hashed PIN:", hash);
});
