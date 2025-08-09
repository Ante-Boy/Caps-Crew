function logout(){
  fetch('/api/logout', { method: 'POST' }).then(() => location.href='/');
}

// Load group info
async function loadGroupInfo() {
  const res = await fetch('/api/groupinfo');
  const data = await res.json();
  document.getElementById('groupNameInput').value = data.groupName || '';
  document.getElementById('adminGroupIcon').src = data.groupIcon;
}
async function changeGroupInfo() {
  const formData = new FormData();
  const nameVal = document.getElementById('groupNameInput').value.trim();
  if (nameVal) formData.append('name', nameVal);
  const file = document.getElementById('groupIconInput').files[0];
  if (file) formData.append('icon', file);
  const res = await fetch('/api/groupinfo', { method: 'POST', body: formData });
  const data = await res.json();
  document.getElementById('groupNameMsg').textContent = data.message;
  loadGroupInfo();
}

async function loadUsers() {
  const res = await fetch('/api/users');
  const users = await res.json();
  const tbody = document.querySelector('#userTable tbody');
  tbody.innerHTML = '';
  users.forEach(u => {
    let row = document.createElement('tr');
    row.innerHTML = `
      <td>${u.username}</td>
      <td>${u.email || ''}</td>
      <td>
        <select onchange="promoteUser('${u.username}',this.value)">
          <option value="user"${u.role==='user'?' selected':''}>user</option>
          <option value="admin"${u.role==='admin'?' selected':''}>admin</option>
        </select>
      </td>
      <td>
        <button class="btn" onclick="deleteUser('${u.username}')">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}
async function promoteUser(username,newRole){
  await fetch(`/api/users/role/${username}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({role:newRole}) });
  loadUsers();
}
async function addUser() {
  let username = document.getElementById('newUser').value;
  let email = document.getElementById('newEmail').value;
  let password = document.getElementById('newPass').value;
  let role = document.getElementById('newRole').value;
  await fetch('/api/users', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ username, email, password, role })
  });
  loadUsers();
}
async function deleteUser(username) {
  await fetch('/api/users/' + username, { method: 'DELETE' });
  loadUsers();
}
loadGroupInfo();
loadUsers();
