document.addEventListener('DOMContentLoaded', () => {
  let usersCache = []; // Will hold all users fetched from backend
  const adminUsersTbody = document.getElementById('adminUsers');
  const editModalEl = document.getElementById('editUserModal');
  const editModal = new bootstrap.Modal(editModalEl); // Bootstrap modal instance for editing users

  // Fetch users from backend and store in usersCache, then render them
  async function loadUsers() {
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to load users');
      usersCache = await res.json();
      renderUsers();
    } catch (e) {
      alert('Error loading users: ' + e.message);
    }
  }

  // Render users in the admin table
  function renderUsers() {
    adminUsersTbody.innerHTML = ''; // Clear existing rows

    usersCache.forEach(u => {
      // Pin presence is received as a boolean from backend as 'pinRegistered'
      const hasPin = u.pinRegistered === true;

      // Use explicit status from backend or derive from role if not set
      const status = u.status || (u.role === 'pending' ? 'pending' : 'approved');

      // Locked state from backend user object, default false if missing
      const isLocked = u.locked || false;

      // Create a row with user data
      adminUsersTbody.innerHTML += `
        <tr>
          <td>${u.username}</td>
          <td>${u.email}</td>
          <td>${u.role}</td>
          <td>
            <span class="badge ${
              status === 'approved' ? 'badge-approved' :
              status === 'pending' ? 'badge-pending' : 'badge-rejected'
            }">${status}</span>
          </td>
          <td>${u.emailNotifications ? 'Yes' : 'No'}</td>
          <td>${hasPin ? 'Yes' : '<span class="badge badge-pin">No</span>'}</td>
          <td>
            ${
              status === 'pending' ? `
                <button class="btn btn-sm btn-approve me-1 approve-user-btn" data-username="${u.username}">Approve</button>
                <button class="btn btn-sm btn-reject me-1 reject-user-btn" data-username="${u.username}">Reject</button>
              ` : ''
            }
            <button class="btn btn-sm btn-warning me-1 edit-user-btn" data-username="${u.username}">Edit</button>
            <button class="btn btn-sm btn-danger me-1 delete-user-btn" data-username="${u.username}">Delete</button>
            <button class="btn btn-sm ${
              isLocked ? 'btn-secondary' : 'btn-outline-warning'
            } lock-chat-btn" data-username="${u.username}" data-locked="${isLocked}">
              ${isLocked ? 'Unlock Chat' : 'Lock Chat'}
            </button>
          </td>
        </tr>
      `;
    });
  }

  // Approve a user by username via API call
  async function approveUser(username) {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/approve`, { method: 'POST' });
      const data = await res.json();
      alert(data.message || data.error || `User "${username}" approved`);
      await loadUsers(); // refresh list after action
    } catch (e) {
      alert('Error approving user: ' + e.message);
    }
  }

  // Reject a user by username via API call
  async function rejectUser(username) {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/reject`, { method: 'POST' });
      const data = await res.json();
      alert(data.message || data.error || `User "${username}" rejected`);
      await loadUsers(); // refresh list
    } catch (e) {
      alert('Error rejecting user: ' + e.message);
    }
  }

  // Delete a user after confirmation
  async function deleteUser(username) {
    if (!confirm(`Delete user '${username}'?`)) return;
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
      const data = await res.json();
      alert(data.message || data.error || `User "${username}" deleted`);
      await loadUsers();
    } catch (e) {
      alert('Error deleting user: ' + e.message);
    }
  }

  // Open Bootstrap modal for editing user details
  function openEditUser(username) {
    const user = usersCache.find(u => u.username === username);
    if (!user) return alert('User not found');

    // Pre-fill modal form inputs with user's current info
    document.getElementById('edit-originalUsername').value = user.username;
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editEmail').value = user.email;
    document.getElementById('editRole').value = user.role;
    document.getElementById('editEmailNotif').checked = user.emailNotifications || false;
    
    // Password and PIN fields cleared for security
    document.getElementById('editPassword').value = '';
    document.getElementById('editPin').value = '';

    // Show the modal
    editModal.show();
  }

  // Handle create user form submission
  document.getElementById('createUserForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const username = form['newUserUsername'].value.trim();
    const email = form['newUserEmail'].value.trim();
    const password = form['newUserPassword'].value;
    const pin = form['newUserPin'].value;
    const role = form['newUserRole'].value;
    const emailNotifications = form['newUserEmailNotif'].checked;

    if (!username || !email || !password || !role) {
      alert('Please fill in all required fields: Username, Email, Password, Role.');
      return;
    }
    const payload = { username, email, password, pin, role, emailNotifications };

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        alert('Error creating user: ' + (data.error || 'Unknown error'));
        return;
      }
      document.getElementById('createUserMsg').textContent = data.message || '';
      form.reset();
      await loadUsers();
    } catch (e) {
      alert('Error creating user: ' + e.message);
    }
  });

  // Handle edit user form submission
  document.getElementById('editUserForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const originalUsername = form['originalUsername'].value;
    const username = form['username'].value.trim();
    const email = form['email'].value.trim();
    const password = form['password'].value;
    const pin = form['pin'].value;
    const role = form['role'].value;
    const emailNotifications = form['emailNotifications'].checked;

    if (!originalUsername || !username || !email || !role) {
      alert('Please fill all required fields in edit form.');
      return;
    }
    const payload = { originalUsername, username, email, password, pin, role, emailNotifications };

    try {
      const res = await fetch('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        alert('Error updating user: ' + (data.error || 'Unknown error'));
        return;
      }
      alert(data.message || 'User updated');
      editModal.hide();
      await loadUsers();
    } catch (e) {
      alert('Error updating user: ' + e.message);
    }
  });

  // Event delegation for all user action buttons in the table
  adminUsersTbody.addEventListener('click', async e => {
    const username = e.target.dataset.username;
    if (!username) return;

    // Approve user button clicked
    if (e.target.classList.contains('approve-user-btn')) return approveUser(username);

    // Reject user button clicked
    if (e.target.classList.contains('reject-user-btn')) return rejectUser(username);

    // Edit user button clicked
    if (e.target.classList.contains('edit-user-btn')) return openEditUser(username);

    // Delete user button clicked
    if (e.target.classList.contains('delete-user-btn')) return deleteUser(username);

    // Lock/unlock chat button clicked
    if (e.target.classList.contains('lock-chat-btn')) {
      const isLocked = e.target.dataset.locked === 'true';
      try {
        const url = isLocked ? '/api/admin/unlockuser' : '/api/admin/lockuser';
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        });
        const data = await res.json();
        alert(data.message || (isLocked ? 'User unlocked' : 'User locked'));
        await loadUsers();
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
  });

  // Handle group settings form submission
  document.getElementById('groupSettingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const res = await fetch('/api/groupinfo', { method: 'POST', body: fd });
      const json = await res.json();
      document.getElementById('groupSettingsMsg').textContent = json.message || json.error || '';
    } catch (e) {
      document.getElementById('groupSettingsMsg').textContent = 'Error: ' + e.message;
    }
  });

  // Handle clear chat button click
  document.getElementById('clearChatBtn').addEventListener('click', async () => {
    if (!confirm('Clear chat history?')) return;
    try {
      const res = await fetch('/api/admin/clearchat', { method: 'POST' });
      const data = await res.json();
      alert(data.message || data.error || 'Chat cleared');
    } catch (e) {
      alert('Error: ' + e.message);
    }
  });

  // Initial load of the users
  loadUsers();
});
