(() => {
  const el = id => document.getElementById(id);
  let currentUser = null;
  let messagePollInterval = null;
  let userPollInterval = null;

  async function apiRequest(path, method = 'GET', data = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (data) options.body = JSON.stringify(data);
    const response = await fetch(path, options);
    if (!response.ok) {
      let errMsg = response.statusText;
      try {
        const errData = await response.json();
        errMsg = errData.error || errMsg;
      } catch {}
      throw new Error(errMsg);
    }
    return response.json();
  }

  async function loadUsers() {
    try {
      const users = await apiRequest('/api/users');
      const usersListEl = el('usersList');
      const recipientSel = el('recipientSelect');
      usersListEl.innerHTML = '';
      recipientSel.innerHTML = '';

      // Add group chat option
      const allOption = document.createElement('option');
      allOption.value = 'all';
      allOption.textContent = 'All (Group Chat)';
      recipientSel.appendChild(allOption);

      users.forEach(user => {
        if (user.username === currentUser.username) return;

        const div = document.createElement('div');
        div.className = 'user-item';
        div.textContent = user.username + (user.online ? ' (Online)' : ' (Offline)');
        usersListEl.appendChild(div);

        const option = document.createElement('option');
        option.value = user.username;
        option.textContent = user.username + (user.online ? ' (Online)' : ' (Offline)');
        recipientSel.appendChild(option);
      });

      recipientSel.value = 'all';
    } catch (error) {
      console.error('Load users failed:', error);
      el('usersList').textContent = 'Failed to load users.';
    }
  }

  async function loadMessages() {
    try {
      const msgs = await apiRequest(`/api/messages?username=${encodeURIComponent(currentUser.username)}`);

      const chatEl = el('chat');
      chatEl.innerHTML = '';

      const filtered = msgs.filter(m =>
        m.to === 'all' || m.to === currentUser.username || m.from === currentUser.username
      );

      filtered.forEach(msg => {
        const isOwn = msg.from === currentUser.username;
        const div = document.createElement('div');
        div.className = 'message ' + (isOwn ? 'own' : 'other');

        const sender = document.createElement('div');
        sender.className = 'sender';
        sender.textContent = msg.from + (msg.to === 'all' ? ' (Group)' : '');

        const text = document.createElement('div');
        text.className = 'text';
        text.textContent = msg.text;

        div.appendChild(sender);
        div.appendChild(text);
        chatEl.appendChild(div);
      });

      chatEl.scrollTop = chatEl.scrollHeight;
    } catch (error) {
      console.error('Load messages failed:', error);
      el('chat').innerHTML = '<p>Failed to load messages.</p>';
    }
  }

  async function sendMessage(ev) {
    ev.preventDefault();
    const textInput = el('msgInput');
    const recipientSelect = el('recipientSelect');
    const text = textInput.value.trim();
    const to = recipientSelect.value;

    if (!text) return;

    try {
      await apiRequest('/api/messages', 'POST', {
        from: currentUser.username,
        to,
        text,
        timestamp: Date.now()
      });
      textInput.value = '';
      await loadMessages();
    } catch (err) {
      alert('Failed to send message: ' + err.message);
    }
  }

  function logout() {
    sessionStorage.removeItem('currentUser');
    window.location.href = 'login.html';
  }

  // Chat page init
  function initChatPage() {
    const userStr = sessionStorage.getItem('currentUser');
    if (!userStr) {
      window.location.href = 'login.html';
      return;
    }
    currentUser = JSON.parse(userStr);

    el('logoutBtn').addEventListener('click', logout);
    el('messageForm').addEventListener('submit', sendMessage);

    loadUsers();
    loadMessages();

    userPollInterval = setInterval(loadUsers, 10000);   // refresh user list
    messagePollInterval = setInterval(loadMessages, 3000); // refresh messages
  }

  // Login form submit handler
  async function handleLogin(ev) {
    ev.preventDefault();

    const errorEl = el('errorMsg');
    errorEl.style.display = 'none';

    const username = el('username').value.trim();
    const password = el('password').value.trim();

    if (!username || !password) {
      errorEl.textContent = 'Please enter username and password';
      errorEl.style.display = 'block';
      return;
    }

    try {
      const user = await apiRequest('/api/login', 'POST', { username, password });
      sessionStorage.setItem('currentUser', JSON.stringify(user));

      if (user.role === 'admin') {
        location.href = 'admin.html';
      } else {
        location.href = 'chat.html';
      }
    } catch (err) {
      errorEl.textContent = err.message || 'Login failed';
      errorEl.style.display = 'block';
    }
  }

  // Admin page init
  function initAdminPage() {
    const userStr = sessionStorage.getItem('currentUser');
    if (!userStr) {
      window.location.href = 'login.html';
      return;
    }
    const user = JSON.parse(userStr);
    if (user.role !== 'admin') {
      alert('Access denied.');
      window.location.href = 'login.html';
      return;
    }

    el('logoutBtn').addEventListener('click', logout);
  }

  // User Management page code (next answer for brevity and clarity)

  document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    if (path.endsWith('chat.html')) {
      initChatPage();
    } else if (path.endsWith('login.html')) {
      el('loginForm').addEventListener('submit', handleLogin);
    } else if (path.endsWith('admin.html')) {
      initAdminPage();
    }
  });
})();
