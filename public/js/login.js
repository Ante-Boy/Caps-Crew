async function login() {
  let username = document.getElementById('loginUser').value;
  let password = document.getElementById('loginPass').value;
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  document.getElementById('loginMsg').innerText = data.message || data.error;
  if (res.ok) location.href = '/chat.html';
}
