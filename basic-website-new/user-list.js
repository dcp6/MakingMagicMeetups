const statusEl = document.getElementById('userListStatus');
const usersTable = document.getElementById('usersTable');
const usersTableBody = document.getElementById('usersTableBody');
const logoutBtn = document.getElementById('logoutBtn');

const adminToken = sessionStorage.getItem('adminToken') || '';

if (!adminToken) {
  setStatus('Admin login required. Redirecting to home...', 'error');
  setTimeout(() => {
    window.location.assign('/index.html');
  }, 900);
} else {
  loadUsers();
}

logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem('adminToken');
  window.location.assign('/index.html');
});

async function loadUsers() {
  setStatus('Loading users...', '');

  try {
    const res = await fetch('/api/users', {
      headers: { 'x-admin-token': adminToken }
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        sessionStorage.removeItem('adminToken');
        throw new Error('Admin session expired. Please log in again.');
      }
      throw new Error(data.error || 'Failed to load user list');
    }

    renderUsers(data);
    setStatus(`Loaded ${data.length} user(s).`, 'success');
  } catch (error) {
    usersTable.hidden = true;
    setStatus(error.message, 'error');
  }
}

function renderUsers(users) {
  usersTableBody.innerHTML = '';

  if (!users.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="7">No users found.</td>';
    usersTableBody.appendChild(tr);
    usersTable.hidden = false;
    return;
  }

  for (const user of users) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(String(user.id))}</td>
      <td>${escapeHtml(user.name || '')}</td>
      <td>${escapeHtml(user.username || '')}</td>
      <td>${escapeHtml(user.role || '')}</td>
      <td>${escapeHtml(user.email || '')}</td>
      <td>${escapeHtml(user.password_hash || '')}</td>
      <td>${escapeHtml(formatJoinTimestamp(user.created_at || ''))}</td>
    `;
    usersTableBody.appendChild(tr);
  }

  usersTable.hidden = false;
}

function setStatus(message, type) {
  statusEl.textContent = message;
  statusEl.className = 'status';
  if (type) statusEl.classList.add(type);
}

function formatJoinTimestamp(value) {
  const match = String(value).match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/
  );
  if (!match) return value;

  const yyyy = match[1];
  const mm = match[2];
  const dd = match[3];
  const hh = match[4];
  const min = match[5];
  return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
