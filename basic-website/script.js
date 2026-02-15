document.getElementById('year').textContent = new Date().getFullYear();

document.getElementById('helloBtn').addEventListener('click', () => {
  alert('Hello! Your JavaScript is working.');
});

const deckRawInput = document.getElementById('deckRaw');
const loadDeckBtn = document.getElementById('loadDeckBtn');
const showPricesInput = document.getElementById('showPrices');
const importStatus = document.getElementById('importStatus');
const deckOutput = document.getElementById('deckOutput');
const deckTitle = document.getElementById('deckTitle');
const deckMeta = document.getElementById('deckMeta');
const deckCards = document.getElementById('deckCards');
const authForm = document.getElementById('authForm');
const authType = document.getElementById('authType');
const authUsernameInput = document.getElementById('authUsername');
const authPasswordInput = document.getElementById('authPassword');
const logoutBtnMain = document.getElementById('logoutBtnMain');
const usersTabLink = document.getElementById('usersTabLink');
const registerForm = document.getElementById('registerForm');
const loadUsersBtn = document.getElementById('loadUsersBtn');
const usersOutput = document.getElementById('usersOutput');
const usersList = document.getElementById('usersList');
const userStatus = document.getElementById('userStatus');
const currentUserDisplay = document.getElementById('currentUserDisplay');
let currentDeckData = null;
let adminToken = sessionStorage.getItem('adminToken') || '';
let currentUserName = sessionStorage.getItem('currentUserName') || '';
let currentUserRole = sessionStorage.getItem('currentUserRole') || '';

renderCurrentUserDisplay();
updateAuthUiState();

if (adminToken) {
  loadUsersBtn.disabled = false;
  validateAdminSession();
}

loadDeckBtn.addEventListener('click', async () => {
  const rawText = deckRawInput.value.trim();

  if (!rawText) {
    setStatus('Please paste your deck list first.', 'error');
    hideDeckOutput();
    return;
  }

  setStatus('Parsing deck list...', '');
  loadDeckBtn.disabled = true;

  try {
    const deckData = normalizeDeckFromText(rawText, 'Pasted Deck');
    if (!deckData.cards.length) {
      throw new Error(
        'No cards found. Use lines like: "4 Lightning Bolt" or "1 Sol Ring".'
      );
    }
    setStatus('Matching cards with Scryfall...', '');
    currentDeckData = await enrichDeckWithScryfall(deckData);
    renderDeck(currentDeckData);
    setStatus('Deck list loaded successfully.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
    hideDeckOutput();
  } finally {
    loadDeckBtn.disabled = false;
  }
});

showPricesInput.addEventListener('change', () => {
  if (currentDeckData) renderDeck(currentDeckData);
});

authType.addEventListener('change', () => {
  updateAuthUiState();
});

logoutBtnMain.addEventListener('click', () => {
  currentUserName = '';
  currentUserRole = '';
  adminToken = '';

  sessionStorage.removeItem('currentUserName');
  sessionStorage.removeItem('currentUserRole');
  sessionStorage.removeItem('adminToken');

  loadUsersBtn.disabled = true;
  usersOutput.hidden = true;
  setUserStatus('Logged out.', 'success');
  renderCurrentUserDisplay();
  updateAuthUiState();
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setUserStatus('Checking credentials...', '');

  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  const mode = authType.value;

  try {
    if (mode === 'admin') {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Admin login failed');

      adminToken = data.token;
      currentUserName = 'admin';
      currentUserRole = 'admin';
      sessionStorage.setItem('adminToken', adminToken);
      sessionStorage.setItem('currentUserName', currentUserName);
      sessionStorage.setItem('currentUserRole', currentUserRole);
      renderCurrentUserDisplay();
      updateAuthUiState();
      loadUsersBtn.disabled = false;
      authForm.reset();
      window.location.assign('/user-list.html');
      return;
    }

    const res = await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    currentUserName = data.name || data.username;
    currentUserRole = 'user';
    sessionStorage.setItem('currentUserName', currentUserName);
    sessionStorage.setItem('currentUserRole', currentUserRole);
    renderCurrentUserDisplay();
    updateAuthUiState();
    setUserStatus(`Logged in as ${data.name} (@${data.username})`, 'success');
    authForm.reset();
  } catch (error) {
    if (mode === 'admin') {
      adminToken = '';
      sessionStorage.removeItem('adminToken');
      loadUsersBtn.disabled = true;
    }
    setUserStatus(error.message, 'error');
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setUserStatus('Creating user...', '');

  const name = document.getElementById('registerName').value.trim();
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value;

  try {
    const res = await fetch('/api/users/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create user');

    setUserStatus(`User created: ${data.name} (@${data.username})`, 'success');
    registerForm.reset();
  } catch (error) {
    setUserStatus(error.message, 'error');
  }
});

loadUsersBtn.addEventListener('click', async () => {
  await loadUsers();
});

async function loadUsers() {
  if (!adminToken) {
    setUserStatus('Admin login required to load users.', 'error');
    return;
  }

  setUserStatus('Loading users...', '');
  try {
    const res = await fetch('/api/users', {
      headers: { 'x-admin-token': adminToken }
    });
    const users = await res.json();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        adminToken = '';
        sessionStorage.removeItem('adminToken');
        loadUsersBtn.disabled = true;
        throw new Error('Admin session expired. Please log in again.');
      }
      throw new Error(users.error || 'Failed to load users');
    }

    usersList.innerHTML = '';
    if (!users.length) {
      usersList.innerHTML = '<div class="user-row">No users yet.</div>';
    } else {
      for (const user of users) {
        const row = document.createElement('div');
        row.className = 'user-row';
        row.innerHTML = `<strong>${escapeHtml(user.name)}</strong> • @${escapeHtml(user.username)}`;
        usersList.appendChild(row);
      }
    }
    usersOutput.hidden = false;
    setUserStatus(`Loaded ${users.length} user(s).`, 'success');
  } catch (error) {
    setUserStatus(error.message, 'error');
  }
}

function normalizeDeckFromText(text, filename) {
  const lines = text.split(/\r?\n/);
  const cards = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    if (/^sideboard$/i.test(line)) continue;
    if (/^commander$/i.test(line)) continue;
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;

    const name = match[2].trim().replace(/\s+\((?:[A-Z0-9]{2,5})\)\s+\d+$/, '');
    cards.push({
      quantity: Number(match[1]),
      name
    });
  }

  const displayName = filename.replace(/\.[^/.]+$/, '') || 'Imported Deck';
  return {
    name: displayName,
    cards: mergeCards(cards)
  };
}

function mergeCards(cards) {
  const byName = new Map();
  for (const card of cards) {
    if (!card.name || !Number.isFinite(card.quantity) || card.quantity <= 0) continue;
    byName.set(card.name, (byName.get(card.name) || 0) + card.quantity);
  }

  return Array.from(byName.entries())
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderDeck(deckData) {
  const { name, cards } = deckData;
  const totalCards = cards.reduce((sum, card) => sum + card.quantity, 0);
  const showPrices = showPricesInput.checked;

  deckTitle.textContent = name;
  deckMeta.textContent = `${cards.length} unique cards • ${totalCards} total cards`;
  deckCards.innerHTML = '';

  for (const card of cards) {
    const cardEl = document.createElement('article');
    cardEl.className = 'deck-card';

    const cardName = card.scryfallUri
      ? `<a class="deck-card-name" href="${card.scryfallUri}" target="_blank" rel="noopener noreferrer">${escapeHtml(card.name)}</a>`
      : `<span class="deck-card-name">${escapeHtml(card.name)}</span>`;

    const subtypeLine = [card.typeLine, card.setCode ? card.setCode.toUpperCase() : '']
      .filter(Boolean)
      .join(' • ');
    const priceLine = showPrices
      ? `<p class="deck-card-price">Price: ${formatPrice(card.priceUsd)}</p>`
      : '';

    cardEl.innerHTML = `
      <div class="deck-card-top">
        <span class="qty">${card.quantity}x</span>
        ${cardName}
      </div>
      <p class="deck-card-line">${escapeHtml(subtypeLine || 'No Scryfall data')}</p>
      ${priceLine}
    `;

    deckCards.appendChild(cardEl);
  }

  deckOutput.hidden = false;
}

function hideDeckOutput() {
  deckOutput.hidden = true;
  deckCards.innerHTML = '';
}

function setStatus(message, type) {
  importStatus.textContent = message;
  importStatus.className = 'status';
  if (type) importStatus.classList.add(type);
}

function setUserStatus(message, type) {
  userStatus.textContent = message;
  userStatus.className = 'status';
  if (type) userStatus.classList.add(type);
}

async function validateAdminSession() {
  try {
    const res = await fetch('/api/users', {
      headers: { 'x-admin-token': adminToken }
    });
    if (res.status === 401 || res.status === 403) {
      adminToken = '';
      sessionStorage.removeItem('adminToken');
      if (currentUserRole === 'admin') {
        currentUserName = '';
        currentUserRole = '';
        sessionStorage.removeItem('currentUserName');
        sessionStorage.removeItem('currentUserRole');
        renderCurrentUserDisplay();
        updateAuthUiState();
      }
      loadUsersBtn.disabled = true;
      setUserStatus('Admin session expired. Please log in again.', 'error');
    }
  } catch {
    // Ignore transient network issues; user can retry manually.
  }
}

function renderCurrentUserDisplay() {
  const name = currentUserName ? currentUserName : 'Guest';
  currentUserDisplay.textContent = `Current user: ${name}`;
}

function updateAuthUiState() {
  const isLoggedIn = Boolean(currentUserName);
  const wantsAdminLogin = authType.value === 'admin';

  // Keep the password hidden for regular logged-in users, but allow it when
  // they explicitly switch the dropdown to Admin to elevate.
  authPasswordInput.hidden = isLoggedIn && !wantsAdminLogin;
  authPasswordInput.required = !authPasswordInput.hidden;
  logoutBtnMain.hidden = !isLoggedIn;

  // Do not lock auth controls for normal users; they may need to switch to Admin.
  // Only lock when already in an admin-authenticated state.
  const lockAuthInputs = currentUserRole === 'admin';
  authType.disabled = lockAuthInputs;
  authUsernameInput.disabled = lockAuthInputs;
  usersTabLink.hidden = !(currentUserRole === 'admin' && Boolean(adminToken));
}

function formatPrice(price) {
  if (!price) return 'N/A';
  const parsed = Number(price);
  if (!Number.isFinite(parsed)) return 'N/A';
  return `$${parsed.toFixed(2)}`;
}

async function enrichDeckWithScryfall(deckData) {
  const cards = deckData.cards.map((card) => ({ ...card }));
  const chunks = chunkArray(cards, 75);

  for (const chunk of chunks) {
    const identifiers = chunk.map((card) => ({ name: card.name }));

    try {
      const response = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ identifiers })
      });

      if (!response.ok) continue;
      const json = await response.json();
      const byName = new Map(
        (json.data || []).map((entry) => [entry.name.toLowerCase(), entry])
      );

      for (const card of chunk) {
        const data = byName.get(card.name.toLowerCase());
        if (!data) continue;
        card.typeLine = data.type_line || '';
        card.setCode = data.set || '';
        card.priceUsd = data?.prices?.usd || data?.prices?.usd_foil || null;
        card.scryfallUri = data.scryfall_uri || '';
      }
    } catch {
      // Leave unmatched cards without Scryfall enrichment.
    }
  }

  return {
    ...deckData,
    cards
  };
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function escapeHtml(str) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
