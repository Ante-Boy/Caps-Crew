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
    const data = await response.json();

    if (response.ok) {
      if (data.pinSetup) {
        // Redirect user to pin setup page with username param
        window.location.href = `/pin-setup.html?username=${encodeURIComponent(data.username)}`;
      } else {
        // Normal login success: redirect to loading page
        window.location.href = '/loading.html';
      }
    } else {
      errorDiv.textContent = data.error || 'Login failed';
    }
  } catch (err) {
    errorDiv.textContent = 'Server error. Please try again later.';
    console.error(err);
  }
});
