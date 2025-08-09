// --- Mobile detection to force mobile layout ---
function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
// Add mobile-view class to body if mobile
if (isMobileDevice()) {
  document.body.classList.add('mobile-view');
}

// --- Socket.io initial setup ---
const socket = io();
let myName = null,
    currentTarget = "all",
    allMessages = [],
    onlineUserList = [],
    onlineUserMap = {};
let groupName = "RAW PROTOCOL",
    groupIcon = "/group-icons/default-group.png",
    myRole = "user";

// Fetch logged-in user session
fetch('/api/session').then(r => r.json()).then(({ username, role }) => {
  if (!username) return location.href = '/';
  myName = username;
  myRole = role;
  if (role === 'admin') document.getElementById('admin-panel-btn').style.display = '';
  socket.emit('join', myName);
});

// --- Navigation & actions ---
function logout() {
  fetch('/api/logout', { method: 'POST' }).then(() => location.href = '/');
}
function openAdmin() {
  location.href = '/admin.html';
}
function openSettings() {
  fetch('/api/session').then(r => r.json()).then(d => {
    document.getElementById('settings-username').value = d.username;
    document.getElementById('settings-email').value = d.email;
    document.getElementById('current-avatar').src = d.avatar;
    document.getElementById('user-settings-modal').style.display = 'flex';
  });
}
function closeSettings() {
  document.getElementById('user-settings-modal').style.display = 'none';
}
async function saveSettings() {
  const fd = new FormData();
  fd.append('username', document.getElementById('settings-username').value);
  fd.append('email', document.getElementById('settings-email').value);
  fd.append('oldpass', document.getElementById('settings-oldpass').value);
  fd.append('newpass', document.getElementById('settings-newpass').value);
  const a = document.getElementById('new-avatar-file').files[0];
  if (a) fd.append('avatar', a);
  const res = await fetch('/api/users/me', { method: 'PUT', body: fd });
  const data = await res.json();
  document.getElementById('settings-msg').textContent = data.message || data.error;
  // Refresh avatar and username in UI
  if (res.ok) {
    fetch('/api/session').then(r => r.json()).then(sess => {
      document.getElementById('current-avatar').src = sess.avatar;
      onlineUserMap[sess.username] = sess.avatar;
      renderUserList();
    });
  }
}

// --- User sidebar rendering ---
const onlineUsersDiv = document.getElementById('onlineUsers'),
      chatDiv = document.getElementById('chat');

function renderUserList() {
  onlineUsersDiv.innerHTML = '';
  addUser({ username: 'all', avatar: groupIcon }, groupName, true);
  onlineUserList.forEach(u => {
    if (u.username !== myName)
      addUser(u, u.username, true);
  });
}
function addUser(userObj, label, on) {
  const d = document.createElement('div');
  d.className = 'user-item' + (currentTarget === userObj.username ? ' active' : '');
  const av = document.createElement('img');
  av.className = 'user-avatar';
  av.src = userObj.avatar;
  const n = document.createElement('div');
  n.className = 'user-name';
  n.textContent = label;
  const st = document.createElement('span');
  st.className = 'user-status ' + (on ? 'status-online' : 'status-offline');
  d.appendChild(av);
  d.appendChild(n);
  d.appendChild(st);
  d.onclick = () => { currentTarget = userObj.username; renderUserList(); renderMessages(); };
  onlineUsersDiv.appendChild(d);
}

// --- Messaging rendering ---
function renderMessages() {
  chatDiv.innerHTML = '';
  const msgs = currentTarget === 'all'
    ? allMessages.filter(m => m.to === 'all')
    : allMessages.filter(m => (m.from === myName && m.to === currentTarget) ||
                              (m.to === myName && m.from === currentTarget));
  msgs.forEach(m => {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'flex-end';
    wrap.style.marginBottom = '10px';
    const isMe = m.from === myName;
    const av = document.createElement('img');
    av.src = onlineUserMap[m.from] || '/avatars/default.png';
    av.className = 'bubble-avatar';
    const bub = document.createElement('div');
    bub.className = 'msg-bubble ' + (isMe ? 'from-me' : 'from-them');
    bub.textContent = m.text;
    bub.oncontextmenu = function (e) {
      e.preventDefault();
      showContextMenu(e.pageX, e.pageY, m.id);
    };
    if (isMe) {
      wrap.style.justifyContent = 'flex-end';
      wrap.appendChild(bub);
      wrap.appendChild(av);
    } else {
      wrap.style.justifyContent = 'flex-start';
      wrap.appendChild(av);
      wrap.appendChild(bub);
    }
    chatDiv.appendChild(wrap);
  });
  chatDiv.scrollTop = chatDiv.scrollHeight;
}

// --- Context menu for message actions ---
function showContextMenu(x, y, id) {
  closeMenu();
  const menu = document.getElementById('context-menu');
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.innerHTML = `
    <button onclick="socket.emit('save','${id}');closeMenu()">💾 Save</button>
    <button onclick="socket.emit('delete','${id}');closeMenu()">🗑 Delete</button>
    <button onclick="closeMenu()">Cancel</button>
  `;
  menu.style.display = 'block';
}
function closeMenu() {
  document.getElementById('context-menu').style.display = 'none';
}

// --- Socket event handling ---
socket.on('online', data => {
  onlineUserList = data.list;
  groupName = data.groupName;
  groupIcon = data.groupIcon;
  document.getElementById('groupIcon').src = groupIcon;
  document.getElementById('groupNameSpan').textContent = groupName;
  onlineUserMap = {};
  data.list.forEach(u => { onlineUserMap[u.username] = u.avatar; });
  renderUserList();
});

socket.on('history', msgs => { allMessages = msgs; renderMessages(); });
socket.on('message', msg => { allMessages.push(msg); renderMessages(); });

// --- Message send form ---
document.getElementById('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const t = document.getElementById('messageInput').value.trim();
  if (!t) return;
  socket.emit('send', { to: currentTarget, text: t });
  document.getElementById('messageInput').value = '';
});

// --- General UI click ---
document.body.addEventListener('click', closeMenu);
