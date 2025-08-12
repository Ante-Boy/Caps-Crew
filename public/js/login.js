document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const errorMsg = document.getElementById('loginError');

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok) {
     location.href = '/chat.html';
    } else {
      errorMsg.textContent = data.error || 'Login failed';
      errorMsg.style.display = 'block';
    }
  });
});
