let usersCache = [];
fetch('/api/users').then(res=>res.json()).then(users=>{
  usersCache = users;
  const tbody = document.getElementById('adminUsers');
  tbody.innerHTML = '';
  users.forEach(u=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.email}</td>
      <td>${u.role}</td>
      <td>
        <button class="btn btn-sm btn-warning me-1" onclick="openEditUser('${u.username}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteUser('${u.username}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
});

function openEditUser(username){
  const user = usersCache.find(u => u.username===username);
  if (!user) return;
  document.getElementById('edit-originalUsername').value = user.username;
  document.getElementById('edit-username').value = user.username;
  document.getElementById('edit-email').value = user.email;
  document.getElementById('edit-role').value = user.role;
  new bootstrap.Modal(document.getElementById('editUserModal')).show();
}

document.getElementById('editUserForm').addEventListener('submit', e=>{
  e.preventDefault();
  const formData = new FormData(e.target);
  fetch('/api/users', {method:'PUT', body:formData})
    .then(res=>res.json().then(data=>({ok:res.ok,...data})))
    .then(data=>{
      alert(data.message || data.error);
      if (data.ok) location.reload();
    });
});

document.getElementById('createUserForm').addEventListener('submit', e => {
  e.preventDefault();
  const formData = new FormData(e.target);
  fetch('/api/users', { method: 'POST', body: formData })
    .then(res => res.json().then(data=>({ok:res.ok,...data})))
    .then(data => {
      document.getElementById('createUserMsg').textContent = data.message || data.error;
      if (data.ok) setTimeout(()=>location.reload(), 700);
    });
});

function deleteUser(username){
  if (!confirm(`Delete user ${username}?`)) return;
  fetch(`/api/users/${username}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(() => location.reload());
}

document.getElementById('groupSettingsForm').addEventListener('submit', e=>{
  e.preventDefault();
  const fd = new FormData();
  fd.append('name', document.getElementById('groupNameInput').value);
  const icon = document.getElementById('groupIconFile').files[0];
  if (icon) fd.append('icon', icon);
  fetch('/api/groupinfo', {method:'POST', body:fd})
    .then(res=>res.json().then(data=>({ok:res.ok,...data})))
    .then(data=>{
      document.getElementById('groupSettingsMsg').textContent = data.message || data.error;
    });
});
