// CPF Chat main.js - Updated with chat lock fixes, profile editing, and features

// ----- Mobile Device Detection -----
// Adds 'mobile-view' class to body if client is a mobile device for styling
function isMobileDevice() {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
if (isMobileDevice()) document.body.classList.add('mobile-view');

// ----- Socket.IO Setup -----
const socket = io();

// ----- Global State Variables -----
let myName = null,
  myRole = 'user',
  currentTarget = 'all', // current chat recipient ('all' = group)
  allMessages = [],      // all chat messages loaded
  onlineUsersList = [],  // online users list from server
  onlineUsersMap = {},   // map username => avatar URL for quick reference
  registeredUsers = [],  // all users registered on system
  groupName = 'RAW PROTOCOL',
  groupIcon = '/group-icons/default-group.png';

let isChatLocked = false; // whether group chat is locked by admin

// Cached DOM references
const chatInput = document.getElementById('messageInput'); // chat message input
const lockBanner = document.getElementById('chatLockBanner'); // banner for chat lock message

// ----- Handle Chat Lock State Changes from Server -----
// Toggle group chat lock banner visibility based on locked status and current target
socket.on('chatLockStateChanged', data => {
  isChatLocked = data.locked;
  if (lockBanner) {
    if (isChatLocked && currentTarget === 'all') {
      lockBanner.textContent = '⚠️ Chat Locked by Admin — Group messages disabled';
      lockBanner.style.display = 'block';
      lockBanner.style.color = '#ff4444';
      lockBanner.style.fontWeight = 'bold';
      lockBanner.style.textAlign = 'center';
      lockBanner.style.padding = '10px';
      lockBanner.style.backgroundColor = '#330000';
      lockBanner.style.border = '1px solid #ff4444';
      lockBanner.style.borderRadius = '4px';
      lockBanner.style.marginBottom = '10px';
    } else {
      lockBanner.style.display = 'none';
      lockBanner.textContent = '';
    }
  }
  // IMPORTANT: Don't disable input here because DMs are still allowed
});

// ----- Chat History Cleared Notification -----
// Clears chat messages UI and alerts user when history is cleared by admin
socket.on('chatHistoryCleared', () => {
  const messagesContainer = document.getElementById('chat');
  if (messagesContainer) messagesContainer.innerHTML = '';
  alert('⚡ Chat history has been cleared by Admin');
});

// ----- Initial Setup -----
// On page load, fetch user session info and user list, show admin button if admin, join chat room
(async () => {
  try {
    const session = await (await fetch('/api/session')).json();
    if (!session.username) return location.href = '/login.html'; // redirect if no session

    myName = session.username;
    myRole = session.role;

    // Show admin panel button only if user is admin
    if (myRole === 'admin') {
      const adminBtn = document.getElementById('adminPanelBtn');
      if (adminBtn) {
        adminBtn.style.display = '';
        adminBtn.onclick = () => window.location.href = '/admin.html';
      }
    }

    // Load all registered users for sidebar
    registeredUsers = await (await fetch('/api/allusers')).json();

    if (window.notificationManager) window.notificationManager.init();

    // Tell server we joined chat room
    socket.emit('join', myName);

    // Render the online user list UI
    renderUserList();
  } catch (e) {
    console.error('Initialization failed', e);
  }
})();

// ----- Logout Function -----
// Logs out user and redirects to login page
function logout() {
  fetch('/api/logout', { method: 'POST' }).then(() => (location.href = '/login.html'));
}

// ----- Render Online Users List -----
// Renders list of users and group ('all') in sidebar(s) for desktop and mobile
function renderUserList() {
  ['onlineUsers', 'onlineUsersMobile'].forEach(id => {
    const container = document.getElementById(id);
    if (!container) return;
    container.innerHTML = '';

    // Add main group chat entry
    addUser({ username: 'all', avatar: groupIcon, role: null, online: true }, groupName, true, container);

    // Add each registered user except self
    registeredUsers.forEach(u => {
      if (u.username !== myName) addUser(u, u.username, u.online, container);
    });
  });
}

// ----- Add Single User Entry to Sidebar -----
// Adds user or group entry with avatar, name, and status dot, and handles clicking to switch chats
function addUser(user, label, online, container) {
  const div = document.createElement('div');
  div.className = 'list-group-item d-flex align-items-center';
  if (container.id === 'onlineUsersMobile') div.classList.add('list-group-item-action');
  if (user.username === currentTarget) div.classList.add('active');
  if (!online && user.username !== 'all') div.classList.add('offline');

  const avatar = document.createElement('img');
  avatar.className = 'rounded-circle me-2';
  avatar.src = user.avatar || '/avatars/default.png';
  avatar.style.width = avatar.style.height = '32px';

  const nameSpan = document.createElement('span');
  nameSpan.textContent = label;

  const statusSpan = document.createElement('span');
  statusSpan.className = 'ms-auto';
  const dot = document.createElement('span');
  dot.className = `user-status-dot ${online ? 'online' : 'offline'}`;
  statusSpan.appendChild(dot);

  if (user.role === 'admin') {
    const badge = document.createElement('span');
    badge.className = 'badge bg-warning ms-2';
    badge.textContent = 'Admin';
    statusSpan.appendChild(badge);
  }

  div.appendChild(avatar);
  div.appendChild(nameSpan);
  div.appendChild(statusSpan);

  // Click on user switches chat target and updates UI
  div.addEventListener('click', () => {
    currentTarget = user.username;
    document.getElementById('groupNameSpan').textContent = currentTarget === 'all'
      ? groupName
      : `${label} ${online ? '●online' : '●offline'}`;

    // Show/hide chat lock banner depending on lock status and target
    if (lockBanner) {
      if (isChatLocked && currentTarget === 'all') {
        lockBanner.style.display = 'block';
      } else {
        lockBanner.style.display = 'none';
        lockBanner.textContent = '';
      }
    }
    renderUserList();
    renderMessages();
  });

  container.appendChild(div);
}

// ----- Render Chat Messages -----
// Displays visible messages in chat UI filtered by currentTarget (group or direct message)
function renderMessages() {
  const chat = document.getElementById('chat');
  chat.innerHTML = '';

  // Filter messages by current chat target
  let filtered =
    currentTarget === 'all'
      ? allMessages.filter(m => m.to === 'all')
      : allMessages.filter(m =>
          (m.from === currentTarget && m.to === myName) || (m.from === myName && m.to === currentTarget)
        );

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-muted text-center';
    empty.textContent = 'No messages yet';
    chat.appendChild(empty);
  }

  // Render each message with avatar and bubble
  filtered.forEach(m => {
    const row = document.createElement('div');
    row.className = m.from === myName ? 'message-row from-me' : 'message-row from-them';
    row.dataset.id = m.id;

    const avatar = document.createElement('img');
    avatar.className = 'bubble-avatar';
    avatar.src = onlineUsersMap[m.from] || '/avatars/default.png';

    const bubble = document.createElement('div');
    bubble.className = m.from === myName ? 'msg-bubble from-me' : 'msg-bubble from-them';

    if (m.type === 'file') {
      // Handle file messages depending on file type
      const lowerName = (m.originalName || '').toLowerCase();
      if (/\.(jpg|jpeg|png|gif)$/.test(lowerName)) {
        const img = document.createElement('img');
        img.src = m.text;
        img.className = 'chat-image';
        bubble.appendChild(img);
      } else if (/\.(mp4|webm|ogg)$/.test(lowerName)) {
        const video = document.createElement('video');
        video.controls = true;
        video.src = m.text;
        video.className = 'chat-video';
        bubble.appendChild(video);
      } else {
        const link = document.createElement('a');
        link.href = m.text;
        link.textContent = m.originalName || 'Download file';
        link.download = m.originalName;
        bubble.appendChild(link);
      }
    } else {
      bubble.textContent = m.text;
    }

    // Context menu on right-click for message
    bubble.addEventListener('contextmenu', e => {
      e.preventDefault();
      showContextMenu(e.pageX, e.pageY, m.id);
    });

    if (m.from === myName) {
      row.appendChild(bubble);
      row.appendChild(avatar);
    } else {
      row.appendChild(avatar);
      row.appendChild(bubble);
    }

    chat.appendChild(row);
  });

  chat.scrollTop = chat.scrollHeight;
}

// ----- Context Menu Functions -----

// Shows context menu with delete options at specified coordinates
function showContextMenu(x, y, messageId) {
  const menu = document.getElementById('context-menu');
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  menu.innerHTML = `
    <button onclick="deleteMessage('${messageId}'); closeMenu();">🗑 Delete for Everyone</button>
    <button onclick="deleteMessageForMe('${messageId}'); closeMenu();">🗑 Delete for Me</button>
    <button onclick="closeMenu();">Cancel</button>
  `;
  menu.style.display = 'block';
}

// Closes the context menu
function closeMenu() {
  const menu = document.getElementById('context-menu');
  if (menu) menu.style.display = 'none';
}

// Requests server to delete message for everyone
function deleteMessage(id) {
  socket.emit('delete', id);
  closeMenu();
}

// Deletes the message only locally for current user and re-renders chat
function deleteMessageForMe(id) {
  const el = document.querySelector(`[data-id='${id}']`);
  if (el) {
    el.classList.add('fade-out');
    setTimeout(() => {
      allMessages = allMessages.filter(m => m.id !== id);
      renderMessages();
    }, 350);
  } else {
    allMessages = allMessages.filter(m => m.id !== id);
    renderMessages();
  }
  closeMenu();
}

// ----- Chat Form Submit Handler -----
// Sends chat message if not empty and blocks group message sending when locked
document.getElementById('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  if (!message) return;

  // If group chat is locked, block sending group messages
  if (currentTarget === 'all' && isChatLocked) {
    alert('Group chat is locked by Admin. You can only send direct messages.');
    return;
  }

  socket.emit('send', { to: currentTarget, text: message });
  input.value = '';
});

// ----- File Upload Handler -----
document.getElementById('fileInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;

  // Optional: block group file upload when locked
  if (currentTarget === 'all' && isChatLocked) {
    alert('Group chat file upload is locked by Admin.');
    e.target.value = '';
    return;
  }

  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: fd,
    });
    const data = await res.json();
    if (data.filePath && data.filename) {
      socket.emit('fileMessage', {
        to: currentTarget,
        filePath: data.filePath,
        filename: data.filename,
      });
    }
  } catch (err) {
    console.error('File upload error:', err);
  }

  e.target.value = '';
});

// ----- Socket Event Listeners -----

// Updates online user list and group info from server
socket.on('online', data => {
  onlineUsersList = data.list;
  groupName = data.groupName;
  groupIcon = data.groupIcon;

  document.getElementById('groupNameSpan').textContent = groupName;
  document.getElementById('groupIcon').src = groupIcon;

  onlineUsersMap = {};
  data.list.forEach(user => (onlineUsersMap[user.username] = user.avatar));

  // Update registeredUsers with online status
  registeredUsers = registeredUsers.map(user => ({
    ...user,
    online: data.list.some(u => u.username === user.username),
  }));

  renderUserList();
});

// Loads chat history and renders messages
socket.on('history', msgs => {
  allMessages = msgs.map(m =>
    m.type === 'text' ? { ...m, text: m.text /* Decrypt if applicable */ } : m,
  );
  renderMessages();
});

// Handles incoming new messages
socket.on('message', msg => {
  const message = msg.type === 'text' ? { ...msg, text: msg.text /* Decrypt if applicable */ } : msg;
  allMessages.push(message);
  renderMessages();
});

// Handles message deletion emitted by server
socket.on('deleteMessage', id => {
  const el = document.querySelector(`[data-id='${id}']`);
  if (el) {
    el.classList.add('fade-out');
    el.addEventListener('animationend', () => {
      allMessages = allMessages.filter(m => m.id !== id);
      renderMessages();
    }, { once: true });
  } else {
    allMessages = allMessages.filter(m => m.id !== id);
    renderMessages();
  }
});

// Show notifications as alert (extend to rich UI as needed)
socket.on('notification', data => {
  alert(`${data.title}\n${data.message}`);
});

// Close context menu if clicking outside it
document.body.addEventListener('click', e => {
  if (!e.target.closest('#context-menu')) closeMenu();
});

// ----- User Settings (Profile Edit) modal handling -----
// Bootstrap modal instance for user settings modal
const userSettingsModalEl = document.getElementById('userSettingsModal');
const userSettingsModal = new bootstrap.Modal(userSettingsModalEl);

// Opens profile editing modal and populates fields with current user info
function openSettings() {
  fetch('/api/session')
    .then(res => res.json())
    .then(user => {
      document.getElementById('settings-username').value = user.username || '';
      document.getElementById('settings-email').value = user.email || '';
      document.getElementById('settings-oldpass').value = '';
      document.getElementById('settings-newpass').value = '';
      document.getElementById('settings-oldpin').value = '';
      document.getElementById('settings-newpin').value = '';
      document.getElementById('settings-msg').textContent = '';
      userSettingsModal.show();
    })
    .catch(err => {
      console.error('Failed to load user session for settings:', err);
      alert('Unable to load user settings.');
    });
}

// Saves profile updates to backend
async function saveSettings() {
  const username = document.getElementById('settings-username').value.trim();
  const email = document.getElementById('settings-email').value.trim();
  const oldPass = document.getElementById('settings-oldpass').value;
  const newPass = document.getElementById('settings-newpass').value;
  const oldPin = document.getElementById('settings-oldpin').value;
  const newPin = document.getElementById('settings-newpin').value;

  const msgDiv = document.getElementById('settings-msg');
  msgDiv.textContent = '';

  if (!username) {
    msgDiv.textContent = 'Username cannot be empty.';
    return;
  }

  const payload = {
    username,
    email,
    oldpass: oldPass || undefined,
    newpass: newPass || undefined,
    oldpin: oldPin || undefined,
    newpin: newPin || undefined,
  };

  Object.keys(payload).forEach(key => {
    if (!payload[key]) delete payload[key];
  });

  try {
    const res = await fetch('/api/users/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (res.ok) {
      msgDiv.style.color = 'lightgreen';
      msgDiv.textContent = data.message || 'Profile updated successfully.';
      setTimeout(() => {
        userSettingsModal.hide();
        window.location.reload();
      }, 1500);
    } else {
      msgDiv.style.color = 'lightcoral';
      msgDiv.textContent = data.error || 'Failed to update profile.';
    }
  } catch (e) {
    msgDiv.style.color = 'lightcoral';
    msgDiv.textContent = 'Network or server error. Please try again.';
    console.error('Error updating profile:', e);
  }
}
