function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
if (isMobileDevice()) document.body.classList.add('mobile-view');

const socket = io();
let myName = null, currentTarget = "all", allMessages = [], 
    onlineUserList = [], onlineUserMap = {}, allRegisteredUsers = [];
let groupName = "RAW PROTOCOL", groupIcon = "/group-icons/default-group.png", myRole = "user";

// Fetch session and all registered users
(async () => {
  const session = await (await fetch('/api/session')).json();
  if (!session.username) return location.href='/';
  myName = session.username; myRole = session.role;
  if (myRole === 'admin') document.getElementById('adminPanelBtn').style.display = '';

  // NEW: Fetch all registered users from backend
  allRegisteredUsers = await (await fetch('/api/allusers')).json();

  socket.emit('join', myName);
  renderUserList(); // Initial render with offline users
})();

function logout(){ fetch('/api/logout', {method:'POST'}).then(()=>location.href='/'); }
function openAdmin(){ location.href='/admin.html'; }
function openSettings(){
  fetch('/api/session').then(r=>r.json()).then(d=>{
    document.getElementById('settings-username').value = d.username;
    document.getElementById('settings-email').value = d.email;
    document.getElementById('current-avatar').src = d.avatar;
    const modal = new bootstrap.Modal(document.getElementById('userSettingsModal'));
    modal.show();
  });
}
async function saveSettings(){
  const fd = new FormData();
  fd.append('username', document.getElementById('settings-username').value);
  fd.append('email', document.getElementById('settings-email').value);
  fd.append('oldpass', document.getElementById('settings-oldpass').value);
  fd.append('newpass', document.getElementById('settings-newpass').value);
  const a = document.getElementById('new-avatar-file').files[0];
  if (a) fd.append('avatar', a);
  const res = await fetch('/api/users/me',{method:'PUT',body:fd});
  const data = await res.json();
  document.getElementById('settings-msg').textContent = data.message || data.error;
  if (res.ok) {
    fetch('/api/session').then(r=>r.json()).then(sess=>{
      document.getElementById('current-avatar').src = sess.avatar;
      onlineUserMap[sess.username] = sess.avatar;
      renderUserList();
    });
  }
}

function renderUserList(){
  const container = document.getElementById('onlineUsers');
  container.innerHTML = '';
  // Always add group at top
  addUser({ username: 'all', avatar: groupIcon, role: null, online: true }, groupName, true);
  
  // Show all registered users (not only online)
  allRegisteredUsers.forEach(u=>{
    if (u.username !== myName) {
      addUser(u, u.username, u.online);
    }
  });
}

function addUser(userObj, label, isOnline){
  const div = document.createElement('div');
  div.className = 'list-group-item list-group-item-action d-flex align-items-center';
  if (currentTarget === userObj.username) div.classList.add('active');

  const av = document.createElement('img');
  av.className = 'rounded-circle me-2';
  av.src = userObj.avatar || '/avatars/default.png';
  av.style.width = '32px'; av.style.height = '32px';

  const nameWrap = document.createElement('div');
  nameWrap.textContent = label;

  const statusWrap = document.createElement('span');
  statusWrap.className = 'ms-auto';
  const dot = document.createElement('span');
  dot.className = `user-status-dot ${isOnline ? 'online' : 'offline'}`;
  statusWrap.append(dot);

  if (userObj.role === 'admin') {
    const badge = document.createElement('span');
    badge.className = 'badge bg-warning text-dark ms-2';
    badge.textContent = 'Admin';
    statusWrap.append(badge);
  }

  div.append(av, nameWrap, statusWrap);
  div.onclick = () => { currentTarget = userObj.username; renderUserList(); renderMessages(); };
  container.appendChild(div);
}

function renderMessages(){
  const chatDiv = document.getElementById('chat');
  chatDiv.innerHTML = '';
  const msgs = currentTarget === 'all'
    ? allMessages.filter(m=>m.to==='all')
    : allMessages.filter(m=>(m.from===myName && m.to===currentTarget) || (m.to===myName && m.from===currentTarget));
  msgs.forEach(m=>{
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
    bub.oncontextmenu = e => { e.preventDefault(); showContextMenu(e.pageX, e.pageY, m.id); };
    if (isMe) { wrap.style.justifyContent = 'flex-end'; wrap.append(bub, av); }
    else { wrap.style.justifyContent = 'flex-start'; wrap.append(av, bub); }
    chatDiv.appendChild(wrap);
  });
  chatDiv.scrollTop = chatDiv.scrollHeight;
}

function showContextMenu(x,y,id){
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
function closeMenu(){ document.getElementById('context-menu').style.display='none'; }

// Socket events
socket.on('online', data=>{
  onlineUserList = data.list;
  groupName = data.groupName; groupIcon = data.groupIcon;
  document.getElementById('groupIcon').src = groupIcon;
  document.getElementById('groupNameSpan').textContent = groupName;
  onlineUserMap = {};
  data.list.forEach(u=>{ onlineUserMap[u.username] = u.avatar; });
  // Merge online flags into allRegisteredUsers for status display
  allRegisteredUsers = allRegisteredUsers.map(u => ({
    ...u,
    online: onlineUserList.some(ou => ou.username === u.username)
  }));
  renderUserList();
});

socket.on('history', msgs=>{ allMessages = msgs; renderMessages(); });
socket.on('message', msg=>{ allMessages.push(msg); renderMessages(); });

// Form send
document.getElementById('chatForm').addEventListener('submit', e=>{
  e.preventDefault();
  const t = document.getElementById('messageInput').value.trim();
  if (!t) return;
  socket.emit('send', { to: currentTarget, text: t });
  document.getElementById('messageInput').value = '';
});
document.body.addEventListener('click', closeMenu);
