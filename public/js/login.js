document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();

  const errorDiv = document.getElementById('error');
  errorDiv.textContent = '';

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    errorDiv.textContent = 'Please enter both username and password.';
    return;
  }

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ username, password })
    });

    if (response.ok) {
      // On success, redirect to chat.html
      window.location.href = '/chat.html';
    } else {
      const data = await response.json();
      errorDiv.textContent = data.error || 'Login failed';
    }
  } catch (err) {
    errorDiv.textContent = 'Server error. Please try again later.';
    console.error(err);
  }
});
