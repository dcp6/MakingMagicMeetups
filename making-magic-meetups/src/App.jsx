import React from 'react';
import { useEffect, useRef, useState } from 'react';

const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim();
const sessionStorageKey = 'making_magic_meetups_session_v1';
const apiBaseStorageKey = 'making_magic_meetups_api_base_v1';

const events = [
  {
    title: "Starlight Story Circle",
    date: "Friday, March 7",
    text: "Bring a blanket, trade stories, and meet your next creative collaborators."
  },
  {
    title: "Potion & Pastry Social",
    date: "Saturday, March 22",
    text: "Interactive stations, themed snacks, and guided intros that break the ice fast."
  },
  {
    title: "Lantern Walk Mixer",
    date: "Thursday, April 3",
    text: "Golden hour city walk with photo moments, conversation prompts, and live music."
  }
];

export default function App() {
  const isDetectingApiRef = useRef(false);
  const [apiBaseUrl, setApiBaseUrl] = useState(() => {
    if (import.meta.env.DEV) {
      return 'http://localhost:8787';
    }
    if (configuredApiBaseUrl) {
      return configuredApiBaseUrl;
    }
    try {
      const stored = window.localStorage.getItem(apiBaseStorageKey);
      if (stored && /^https?:\/\//i.test(stored)) {
        return stored;
      }
    } catch (_error) {
      // ignore
    }
    // Default guess; we will auto-detect the right one on load.
    return 'https://makingmagicmeetups.onrender.com';
  });
  const [route, setRoute] = useState('home');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountUsername, setAccountUsername] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountFeedback, setAccountFeedback] = useState('');
  const [isAccountSubmitting, setIsAccountSubmitting] = useState(false);
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginFeedback, setLoginFeedback] = useState('');
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [loginAuthHeader, setLoginAuthHeader] = useState(null);
  const [adminAccountCount, setAdminAccountCount] = useState(null);
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [cardInputText, setCardInputText] = useState('');
  const [uploadedCards, setUploadedCards] = useState([]);
  const [cardCostTotal, setCardCostTotal] = useState(0);
  const [cardAskingTotal, setCardAskingTotal] = useState(0);
  const [cardUploadFeedback, setCardUploadFeedback] = useState('');
  const [isCardPriceLoading, setIsCardPriceLoading] = useState(false);
  const [isCardsSaving, setIsCardsSaving] = useState(false);
  const [versionOptionsByKey, setVersionOptionsByKey] = useState({});
  const [versionLoadingKey, setVersionLoadingKey] = useState(null);
  const [cardSortMode, setCardSortMode] = useState('upload');
  const [settingsUsername, setSettingsUsername] = useState('');
  const [settingsFullName, setSettingsFullName] = useState('');
  const [settingsEmail, setSettingsEmail] = useState('');
  const [settingsCurrentPassword, setSettingsCurrentPassword] = useState('');
  const [settingsNewPassword, setSettingsNewPassword] = useState('');
  const [settingsFeedback, setSettingsFeedback] = useState('');
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [preferredStore, setPreferredStore] = useState(null);
  const [storeSearchQuery, setStoreSearchQuery] = useState('');
  const [storeSearchResults, setStoreSearchResults] = useState([]);
  const [storeSearchFeedback, setStoreSearchFeedback] = useState('');
  const [isStoreSearching, setIsStoreSearching] = useState(false);
  const [isPreferredStoreSaving, setIsPreferredStoreSaving] = useState(false);
  const [isMapKitReady, setIsMapKitReady] = useState(false);
  const [loginServiceStatus, setLoginServiceStatus] = useState('unknown');
  const [loginServiceLastCheckedAt, setLoginServiceLastCheckedAt] = useState(null);
  const [loginServiceLastStatusCode, setLoginServiceLastStatusCode] = useState(null);

  useEffect(() => {
    function syncRouteFromHash() {
      const hash = window.location.hash;
      if (hash === '#/create-account') {
        setRoute('create-account');
        return;
      }
      if (hash === '#/dashboard') {
        setRoute('dashboard');
        return;
      }
      if (hash === '#/settings') {
        setRoute('settings');
        return;
      }
      if (hash === '#/my-cards') {
        setRoute('my-cards');
        return;
      }
      setRoute('home');
    }

    syncRouteFromHash();
    window.addEventListener('hashchange', syncRouteFromHash);

    return () => {
      window.removeEventListener('hashchange', syncRouteFromHash);
    };
  }, []);

  async function probeApiHealth(baseUrl, timeoutMs = 4500) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        signal: controller.signal
      });
      return response.ok ? { ok: true, status: response.status } : { ok: false, status: response.status };
    } catch (_error) {
      return { ok: false, status: null };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function autoDetectApiBaseUrl() {
    if (import.meta.env.DEV) {
      return null;
    }
    if (isDetectingApiRef.current) {
      return null;
    }
    isDetectingApiRef.current = true;

    try {
      let stored = '';
      try {
        stored = String(window.localStorage.getItem(apiBaseStorageKey) || '').trim();
      } catch (_error) {
        stored = '';
      }

      const candidates = [
        apiBaseUrl,
        configuredApiBaseUrl,
        stored,
        'https://makingmagicmeetups.onrender.com',
        'https://makingmagicmeetups-api.onrender.com'
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean);

      const seen = new Set();
      const uniqueCandidates = [];
      for (const candidate of candidates) {
        if (seen.has(candidate)) {
          continue;
        }
        seen.add(candidate);
        uniqueCandidates.push(candidate);
      }

      for (const candidate of uniqueCandidates) {
        const result = await probeApiHealth(candidate);
        if (result.ok) {
          if (candidate !== apiBaseUrl) {
            setApiBaseUrl(candidate);
          }
          try {
            window.localStorage.setItem(apiBaseStorageKey, candidate);
          } catch (_error) {
            // ignore
          }
          return candidate;
        }
      }
      return null;
    } finally {
      isDetectingApiRef.current = false;
    }
  }

  useEffect(() => {
    autoDetectApiBaseUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkLoginService() {
    setLoginServiceStatus('unknown');
    try {
      const result = await probeApiHealth(apiBaseUrl);
      setLoginServiceLastStatusCode(result.status);
      setLoginServiceStatus(result.ok ? 'ok' : 'bad');
      if (!result.ok) {
        await autoDetectApiBaseUrl();
      }
    } catch (_error) {
      setLoginServiceStatus('bad');
      await autoDetectApiBaseUrl();
    } finally {
      setLoginServiceLastCheckedAt(Date.now());
    }
  }

  useEffect(() => {
    checkLoginService();
    const intervalId = window.setInterval(() => {
      checkLoginService();
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [apiBaseUrl]);

  useEffect(() => {
    if (route !== 'settings') {
      return;
    }
    if (!loggedInUser || loggedInUser.role !== 'user' || !loginAuthHeader) {
      return;
    }

    (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/me`, {
          headers: { Authorization: loginAuthHeader }
        });
        const payload = await response.json();
        if (!response.ok) {
          setSettingsFeedback(payload.error || 'Could not load settings.');
          return;
        }
        setSettingsUsername(payload.account?.username || '');
        setSettingsFullName(payload.account?.fullName || '');
        setSettingsEmail(payload.account?.email || '');
        setPreferredStore(payload.account?.preferredStore || null);
        setSettingsFeedback('');
      } catch (_error) {
        setSettingsFeedback('Could not load settings.');
      }
    })();
  }, [route, loggedInUser, loginAuthHeader, apiBaseUrl]);

  useEffect(() => {
    if (route !== 'my-cards') {
      return;
    }
    if (!loggedInUser || loggedInUser.role !== 'user' || !loginAuthHeader) {
      return;
    }
    loadUserCardsFromApi(loginAuthHeader);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, loggedInUser, loginAuthHeader, apiBaseUrl]);

  useEffect(() => {
    if (route !== 'settings') {
      return;
    }
    if (!loggedInUser || loggedInUser.role !== 'user') {
      return;
    }

    const mapkit = window.mapkit;
    if (!mapkit) {
      setIsMapKitReady(false);
      setStoreSearchFeedback('MapKit JS failed to load.');
      return;
    }

    if (!window.__makingMagicMapKitInited) {
      window.__makingMagicMapKitInited = true;
      mapkit.init({
        authorizationCallback(done) {
          fetch(`${apiBaseUrl}/api/mapkit/token`)
            .then((response) => response.json())
            .then((payload) => done(payload.token || ''))
            .catch(() => done(''));
        }
      });
    }

    setIsMapKitReady(true);
  }, [route, loggedInUser, apiBaseUrl]);

  async function handleStoreSearch(event) {
    event.preventDefault();
    setStoreSearchFeedback('');

    if (!loggedInUser || loggedInUser.role !== 'user') {
      setStoreSearchFeedback('Please log in with a user account.');
      return;
    }
    if (!loginAuthHeader) {
      setStoreSearchFeedback('Please log in again.');
      return;
    }

    const query = storeSearchQuery.trim();
    if (!query) {
      setStoreSearchFeedback('Enter a store name or city to search.');
      return;
    }

    if (!window.mapkit || !isMapKitReady) {
      setStoreSearchFeedback('MapKit is not ready yet.');
      return;
    }

    setIsStoreSearching(true);
    try {
      const search = new window.mapkit.Search();
      const data = await new Promise((resolve, reject) => {
        search.search(query, (error, response) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(response);
        });
      });

      const places = Array.isArray(data?.places) ? data.places : [];
      const stores = places.slice(0, 10).map((place) => {
        const placeId = place?.placeId || place?.identifier || place?.id || null;
        const name = place?.name || null;
        const address = place?.formattedAddress || place?.address || null;
        const url = placeId ? `https://maps.apple.com/place?place-id=${encodeURIComponent(placeId)}` : null;
        const website = place?.website || null;
        const phone = place?.phoneNumber || null;
        return { placeId, name, address, url, website, phone };
      });

      setStoreSearchResults(stores);
      setStoreSearchFeedback('');
    } catch (_error) {
      setStoreSearchResults([]);
      setStoreSearchFeedback('Could not search stores.');
    } finally {
      setIsStoreSearching(false);
    }
  }

  async function savePreferredStore(store) {
    setStoreSearchFeedback('');

    if (!loggedInUser || loggedInUser.role !== 'user') {
      setStoreSearchFeedback('Please log in with a user account.');
      return;
    }
    if (!loginAuthHeader) {
      setStoreSearchFeedback('Please log in again.');
      return;
    }

    setIsPreferredStoreSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/me/preferred-store`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: loginAuthHeader
        },
        body: JSON.stringify(
          store
            ? {
                placeId: store.placeId || null,
                name: store.name || null,
                address: store.address || null,
                url: store.url || null,
                website: store.website || null,
                phone: store.phone || null
              }
            : { placeId: null }
        )
      });
      const payload = await response.json();
      if (!response.ok) {
        setStoreSearchFeedback(payload.error || 'Could not save preferred store.');
        return;
      }
      setPreferredStore(payload.preferredStore || null);
      setStoreSearchFeedback(store ? 'Preferred store saved.' : 'Preferred store cleared.');
    } catch (_error) {
      setStoreSearchFeedback('Could not save preferred store.');
    } finally {
      setIsPreferredStoreSaving(false);
    }
  }

  useEffect(() => {
    const rawSession = window.localStorage.getItem(sessionStorageKey);
    if (!rawSession) {
      return;
    }

    try {
      const session = JSON.parse(rawSession);
      if (!session || !session.user || !session.authHeader) {
        window.localStorage.removeItem(sessionStorageKey);
        return;
      }

      setLoggedInUser(session.user);
      setLoginAuthHeader(session.authHeader);
      setLoginIdentifier(session.identifier || '');
      setLoginPassword(session.password || '');
      setLoginFeedback(`Welcome back, ${session.user.username || 'user'}.`);

      if (session.user.role === 'admin') {
        loadAdminAccountsFromApi(session.authHeader);
      } else if (session.user.role === 'user') {
        loadUserCardsFromApi(session.authHeader);
      }
    } catch (_error) {
      window.localStorage.removeItem(sessionStorageKey);
    }
  }, []);

  function clearStoredSession() {
    window.localStorage.removeItem(sessionStorageKey);
  }

  async function handleJoinSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback('');

    try {
      const response = await fetch(`${apiBaseUrl}/api/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
      });

      const payload = await response.json();

      if (!response.ok) {
        setFeedback(payload.error || 'Could not save your signup right now.');
        return;
      }

      setEmail('');
      setFeedback('You are subscribed. Check your inbox for meetup drops.');
    } catch (_error) {
      setFeedback('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUserLogin(event) {
    event.preventDefault();
    setLoginFeedback('');
    setIsLoginSubmitting(true);
    const trimmedIdentifier = loginIdentifier.trim();
    const submittedPassword = loginPassword;
    const authHeader = `Basic ${btoa(`${trimmedIdentifier}:${submittedPassword}`)}`;

    try {
      async function attemptLogin(baseUrl) {
        const loginResponse = await fetch(`${baseUrl}/api/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            identifier: trimmedIdentifier,
            password: submittedPassword
          })
        });

        const loginPayload = await loginResponse.json().catch(() => ({}));
        return { loginResponse, loginPayload };
      }

      const baseUrlUsed = apiBaseUrl;
      let { loginResponse, loginPayload } = await attemptLogin(baseUrlUsed);

      // If the request failed due to CORS / no-server / wrong API host, auto-detect and retry once.
      if (!loginResponse.ok && (loginResponse.status === 404 || loginResponse.status === 502)) {
        const detected = await autoDetectApiBaseUrl();
        if (detected && detected !== baseUrlUsed) {
          ({ loginResponse, loginPayload } = await attemptLogin(detected));
        }
      }

      if (!loginResponse.ok) {
        setLoggedInUser(null);
        setLoginAuthHeader(null);
        setAdminAccountCount(null);
        clearStoredSession();
        setLoginFeedback(loginPayload.error || 'Login failed.');
        return;
      }

      setLoggedInUser(loginPayload.user || null);
      setLoginAuthHeader(authHeader);
      setLoginFeedback(`Welcome, ${loginPayload.user?.username || 'user'}.`);
      window.localStorage.setItem(
        sessionStorageKey,
        JSON.stringify({
          user: loginPayload.user || null,
          authHeader,
          identifier: trimmedIdentifier,
          password: submittedPassword
        })
      );

      if (loginPayload.user?.role === 'admin') {
        await loadAdminAccountsFromApi(authHeader);
      } else {
        setAdminAccountCount(null);
        setAdminAccounts([]);
        await loadUserCardsFromApi(authHeader);
      }
    } catch (_error) {
      const detected = await autoDetectApiBaseUrl();
      if (detected && detected !== apiBaseUrl) {
        try {
          const retryResponse = await fetch(`${detected}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              identifier: trimmedIdentifier,
              password: submittedPassword
            })
          });
          const retryPayload = await retryResponse.json().catch(() => ({}));
          if (retryResponse.ok) {
            setLoggedInUser(retryPayload.user || null);
            setLoginAuthHeader(authHeader);
            setLoginFeedback(`Welcome, ${retryPayload.user?.username || 'user'}.`);
            window.localStorage.setItem(
              sessionStorageKey,
              JSON.stringify({
                user: retryPayload.user || null,
                authHeader,
                identifier: trimmedIdentifier,
                password: submittedPassword
              })
            );
            if (retryPayload.user?.role === 'admin') {
              await loadAdminAccountsFromApi(authHeader);
            } else {
              setAdminAccountCount(null);
              setAdminAccounts([]);
              await loadUserCardsFromApi(authHeader);
            }
            return;
          }
        } catch (_retryError) {
          // fall through to failure case below
        }
      }

      setLoggedInUser(null);
      setLoginAuthHeader(null);
      setAdminAccountCount(null);
      setAdminAccounts([]);
      clearStoredSession();
      setLoginFeedback('Could not reach login service.');
    } finally {
      setIsLoginSubmitting(false);
    }
  }

  function handleLogout() {
    setLoggedInUser(null);
    setLoginAuthHeader(null);
    setAdminAccountCount(null);
    setAdminAccounts([]);
    setUploadedCards([]);
    setCardInputText('');
    setLoginIdentifier('');
    setLoginPassword('');
    setLoginFeedback('Signed out.');
    clearStoredSession();
  }

  async function handleCreateAccount(event) {
    event.preventDefault();
    setIsAccountSubmitting(true);
    setAccountFeedback('');

    try {
      const response = await fetch(`${apiBaseUrl}/api/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: accountUsername,
          fullName: accountName,
          email: accountEmail,
          password: accountPassword
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        setAccountFeedback(payload.error || 'Could not create account.');
        return;
      }

      setAccountName('');
      setAccountUsername('');
      setAccountEmail('');
      setAccountPassword('');
      setAccountFeedback('Account created successfully. You can now log in.');
    } catch (_error) {
      setAccountFeedback('Network error. Please try again.');
    } finally {
      setIsAccountSubmitting(false);
    }
  }

  async function fetchCardFromScryfall(entry) {
    const cardName = entry.cardName;
    const endpoints = [];

    if (entry.scryfallId) {
      endpoints.push(`https://api.scryfall.com/cards/${encodeURIComponent(entry.scryfallId)}`);
    }

    const encoded = encodeURIComponent(cardName);
    endpoints.push(`https://api.scryfall.com/cards/named?exact=${encoded}`);
    endpoints.push(`https://api.scryfall.com/cards/named?fuzzy=${encoded}`);

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint);
        if (!response.ok) {
          if (response.status === 404) {
            continue;
          }
          return {
            inputName: cardName,
            resolvedName: cardName,
            tcgLow: 'N/A',
            tcgUrl: null,
            error: 'Lookup failed',
            scryfallId: entry.scryfallId || null,
            setCode: entry.setCode || null,
            setName: entry.setName || null,
            collectorNumber: entry.collectorNumber || null,
            imageSmall: entry.imageSmall || null,
            imageNormal: entry.imageNormal || null
          };
        }

        const data = await response.json();
        const faces = Array.isArray(data.card_faces) ? data.card_faces : null;
        const frontImage = data.image_uris
          ? data.image_uris
          : faces && faces[0] && faces[0].image_uris
            ? faces[0].image_uris
            : null;
        const backImage =
          faces && faces[1] && faces[1].image_uris ? faces[1].image_uris : null;
        return {
          inputName: cardName,
          resolvedName: data.name || cardName,
          tcgLow: data.prices?.usd ? `$${data.prices.usd}` : 'N/A',
          tcgUrl: data.purchase_uris?.tcgplayer || null,
          error: null,
          scryfallId: data.id || entry.scryfallId || null,
          setCode: data.set || entry.setCode || null,
          setName: data.set_name || entry.setName || null,
          collectorNumber: data.collector_number || entry.collectorNumber || null,
          imageSmall: frontImage?.small || entry.imageSmall || null,
          imageNormal: frontImage?.normal || entry.imageNormal || null,
          imageSmallBack: backImage?.small || entry.imageSmallBack || null,
          imageNormalBack: backImage?.normal || entry.imageNormalBack || null
        };
      } catch (_error) {
        return {
          inputName: cardName,
          resolvedName: cardName,
          tcgLow: 'N/A',
          tcgUrl: null,
          error: 'Network error',
          scryfallId: entry.scryfallId || null,
          setCode: entry.setCode || null,
          setName: entry.setName || null,
          collectorNumber: entry.collectorNumber || null,
          imageSmall: entry.imageSmall || null,
          imageNormal: entry.imageNormal || null,
          imageSmallBack: entry.imageSmallBack || null,
          imageNormalBack: entry.imageNormalBack || null
        };
      }
    }

    return {
      inputName: cardName,
      resolvedName: cardName,
      tcgLow: 'N/A',
      tcgUrl: null,
      error: 'Card not found',
      scryfallId: entry.scryfallId || null,
      setCode: entry.setCode || null,
      setName: entry.setName || null,
      collectorNumber: entry.collectorNumber || null,
      imageSmall: entry.imageSmall || null,
      imageNormal: entry.imageNormal || null,
      imageSmallBack: entry.imageSmallBack || null,
      imageNormalBack: entry.imageNormalBack || null
    };
  }

  function parseCardEntries(text) {
    const lines = text.split(/[\n,]/).map((line) => line.trim()).filter(Boolean);
    const entryMap = new Map();

    for (const line of lines) {
      let quantity = 1;
      let name = line;

      // Patterns supported:
      // - "2 Lightning Bolt"
      // - "2x Lightning Bolt"
      // - "Lightning Bolt x2"
      // - "Lightning Bolt (2)"
      const leading = line.match(/^(\d+)\s*x?\s+(.+)$/i);
      const trailingX = line.match(/^(.+?)\s*x\s*(\d+)$/i);
      const trailingParen = line.match(/^(.+?)\s*\(\s*(\d+)\s*\)\s*$/);

      if (leading) {
        quantity = Number(leading[1]);
        name = leading[2].trim();
      } else if (trailingX) {
        name = trailingX[1].trim();
        quantity = Number(trailingX[2]);
      } else if (trailingParen) {
        name = trailingParen[1].trim();
        quantity = Number(trailingParen[2]);
      }

      if (!name) {
        continue;
      }

      if (!Number.isFinite(quantity) || quantity <= 0) {
        quantity = 1;
      }

      const key = name.toLowerCase();
      const existing = entryMap.get(key);
      if (existing) {
        existing.quantity += quantity;
      } else {
        entryMap.set(key, { cardName: name, quantity });
      }
    }

    return Array.from(entryMap.values());
  }

  function expandEntries(entries) {
    const cards = [];
    for (const entry of entries) {
      for (let i = 0; i < entry.quantity; i += 1) {
        cards.push(entry.cardName);
      }
    }
    return cards;
  }

  function parseUsdPrice(tcgLowDisplay) {
    if (!tcgLowDisplay || tcgLowDisplay === 'N/A') {
      return null;
    }
    const normalized = String(tcgLowDisplay).replace(/[^0-9.]/g, '');
    const value = Number(normalized);
    if (!Number.isFinite(value)) {
      return null;
    }
    return value;
  }

  function formatCents(cents) {
    if (cents === null || cents === undefined) {
      return '';
    }
    const dollars = Number(cents) / 100;
    return Number.isFinite(dollars) ? dollars.toFixed(2) : '';
  }

  function parseDollarsToCents(value) {
    if (value === '' || value === null || value === undefined) {
      return null;
    }
    const normalized = String(value).trim().replace(/^\$/, '').replace(/,/g, '');
    if (!normalized) {
      return null;
    }
    const dollars = Number(normalized);
    if (!Number.isFinite(dollars) || dollars < 0) {
      return null;
    }
    return Math.round(dollars * 100);
  }

  function recomputeCostTotal(pricedEntries) {
    return pricedEntries.reduce((sum, entry) => {
      if (entry.lineTotalUsd === null) {
        return sum;
      }
      return sum + entry.lineTotalUsd;
    }, 0);
  }

  function recomputeAskingTotal(pricedEntries) {
    return pricedEntries.reduce((sum, entry) => {
      if (entry.askingLineTotalUsd === null) {
        return sum;
      }
      return sum + entry.askingLineTotalUsd;
    }, 0);
  }

  function getSortedCardsWithIndex(cards, mode) {
    const pairs = cards.map((card, index) => ({ card, index }));
    if (mode === 'alpha') {
      pairs.sort((a, b) => {
        const left = String(a.card.resolvedName || a.card.inputName || '').toLowerCase();
        const right = String(b.card.resolvedName || b.card.inputName || '').toLowerCase();
        return left.localeCompare(right);
      });
      return pairs;
    }
    if (mode === 'tcgLowDesc' || mode === 'tcgLowAsc') {
      const direction = mode === 'tcgLowAsc' ? 1 : -1;
      pairs.sort((a, b) => {
        const left = a.card.unitUsd === null || a.card.unitUsd === undefined ? null : Number(a.card.unitUsd);
        const right = b.card.unitUsd === null || b.card.unitUsd === undefined ? null : Number(b.card.unitUsd);
        if (left === null && right === null) {
          const leftName = String(a.card.resolvedName || a.card.inputName || '').toLowerCase();
          const rightName = String(b.card.resolvedName || b.card.inputName || '').toLowerCase();
          return leftName.localeCompare(rightName);
        }
        if (left === null) {
          return 1;
        }
        if (right === null) {
          return -1;
        }
        if (left === right) {
          const leftName = String(a.card.resolvedName || a.card.inputName || '').toLowerCase();
          const rightName = String(b.card.resolvedName || b.card.inputName || '').toLowerCase();
          return leftName.localeCompare(rightName);
        }
        return direction * (left - right);
      });
      return pairs;
    }
    return pairs;
  }

  async function priceCards(entries) {
    const pricedUnique = await Promise.all(entries.map((entry) => fetchCardFromScryfall(entry)));
    const pricedEntries = pricedUnique.map((priced, index) => {
      const quantity = entries[index]?.quantity ?? 1;
      const askingQuantityRaw = entries[index]?.askingQuantity ?? quantity;
      const askingQuantity =
        Number.isFinite(Number(askingQuantityRaw)) && Number(askingQuantityRaw) > 0
          ? Math.max(1, Math.min(quantity, Math.floor(Number(askingQuantityRaw))))
          : quantity;
      const unitUsd = parseUsdPrice(priced.tcgLow);
      const askingPriceCents = entries[index]?.askingPriceCents ?? null;
      const scryfallId = priced.scryfallId ?? entries[index]?.scryfallId ?? null;
      const setCode = priced.setCode ?? entries[index]?.setCode ?? null;
      const setName = priced.setName ?? entries[index]?.setName ?? null;
      const collectorNumber = priced.collectorNumber ?? entries[index]?.collectorNumber ?? null;
      const imageSmall = priced.imageSmall ?? entries[index]?.imageSmall ?? null;
      const imageNormal = priced.imageNormal ?? entries[index]?.imageNormal ?? null;
      const imageSmallBack = priced.imageSmallBack ?? entries[index]?.imageSmallBack ?? null;
      const imageNormalBack = priced.imageNormalBack ?? entries[index]?.imageNormalBack ?? null;
      // Asking For is a per-card unit price ($/card) and scales by quantity.
      const askingUnitUsd =
        askingPriceCents === null || askingPriceCents === undefined
          ? null
          : Number(askingPriceCents) / 100;
      return {
        ...priced,
        quantity,
        askingQuantity,
        unitUsd,
        lineTotalUsd: unitUsd !== null ? unitUsd * quantity : null,
        askingPriceCents,
        askingInput: formatCents(askingPriceCents),
        askingLineTotalUsd: askingUnitUsd !== null ? askingUnitUsd * askingQuantity : null,
        scryfallId,
        setCode,
        setName,
        collectorNumber,
        imageSmall,
        imageNormal,
        imageSmallBack,
        imageNormalBack
      };
    });

    setUploadedCards(pricedEntries);
    setCardCostTotal(recomputeCostTotal(pricedEntries));
    setCardAskingTotal(recomputeAskingTotal(pricedEntries));
  }

  async function loadAdminAccountsFromApi(authHeader) {
    const response = await fetch(`${apiBaseUrl}/api/admin/accounts`, {
      headers: {
        Authorization: authHeader
      }
    });

    if (!response.ok) {
      setAdminAccounts([]);
      setAdminAccountCount(null);
      return;
    }

    const payload = await response.json();
    const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
    setAdminAccounts(accounts);
    setAdminAccountCount(accounts.length);
  }

  async function loadUserCardsFromApi(authHeader = loginAuthHeader) {
    if (!authHeader) {
      setUploadedCards([]);
      return;
    }

    const response = await fetch(`${apiBaseUrl}/api/cards`, {
      headers: {
        Authorization: authHeader
      }
    });

    if (!response.ok) {
      setUploadedCards([]);
      return;
    }

    const payload = await response.json();
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    const cards = Array.isArray(payload.cards) ? payload.cards : [];
    const normalizedEntries =
      entries.length > 0
        ? entries.map((entry) => ({
            cardName: String(entry.cardName || entry.card_name || '').trim(),
            quantity: Number(entry.quantity) || 1,
            askingQuantity:
              entry.askingQuantity === null || entry.askingQuantity === undefined
                ? null
                : Number(entry.askingQuantity),
            askingPriceCents:
              entry.askingPriceCents === null || entry.askingPriceCents === undefined
                ? null
                : Number(entry.askingPriceCents),
            scryfallId: entry.scryfallId || null,
            setCode: entry.setCode || null,
            setName: entry.setName || null,
            collectorNumber: entry.collectorNumber || null,
            imageSmall: entry.imageSmall || null,
            imageNormal: entry.imageNormal || null,
            imageSmallBack: entry.imageSmallBack || null,
            imageNormalBack: entry.imageNormalBack || null
          }))
        : parseCardEntries(cards.join('\n'));

    const filteredEntries = normalizedEntries.filter((entry) => entry.cardName);
    if (filteredEntries.length === 0) {
      setUploadedCards([]);
      setCardCostTotal(0);
      return;
    }

    setIsCardPriceLoading(true);
    await priceCards(filteredEntries);
    setIsCardPriceLoading(false);
  }

  async function handleCardListUpload(event) {
    event.preventDefault();
    const entries = parseCardEntries(cardInputText);

    if (entries.length === 0) {
      setUploadedCards([]);
      setCardCostTotal(0);
      setCardUploadFeedback('Please add at least one card name.');
      return;
    }

    setIsCardPriceLoading(true);
    try {
      await priceCards(entries);
      setCardUploadFeedback(
        "Loaded card list for pricing. This is not saved yet. Click 'Save List' to store it permanently."
      );
    } catch (_error) {
      setCardUploadFeedback('Could not save card list right now.');
    } finally {
      setIsCardPriceLoading(false);
    }
  }

  function handleQuantityChange(index, nextValue) {
    const raw = Number(nextValue);
    const quantity = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;

    setUploadedCards((previous) => {
      const next = previous.map((card, i) => {
        if (i !== index) {
          return card;
        }
        const lineTotalUsd = card.unitUsd !== null ? card.unitUsd * quantity : null;
        const askingQuantity = Math.min(card.askingQuantity ?? quantity, quantity);
        const askingUnitUsd =
          card.askingPriceCents === null || card.askingPriceCents === undefined
            ? null
            : Number(card.askingPriceCents) / 100;
        const askingLineTotalUsd =
          askingUnitUsd !== null ? askingUnitUsd * askingQuantity : null;
        return { ...card, quantity, askingQuantity, lineTotalUsd, askingLineTotalUsd };
      });
      setCardCostTotal(recomputeCostTotal(next));
      setCardAskingTotal(recomputeAskingTotal(next));

      // Keep the textarea aligned with the current quantities.
      const nextText = next.map((card) => `${card.quantity} ${card.resolvedName || card.inputName}`).join('\n');
      setCardInputText(nextText);
      return next;
    });
  }

  function handleAskingPriceChange(index, nextValue) {
    const askingPriceCents = parseDollarsToCents(nextValue);

    setUploadedCards((previous) => {
      const next = previous.map((card, i) => {
        if (i !== index) {
          return card;
        }
        const askingUnitUsd =
          askingPriceCents === null ? null : Number(askingPriceCents) / 100;
        const askingLineTotalUsd =
          askingUnitUsd !== null ? askingUnitUsd * (card.askingQuantity ?? card.quantity) : null;
        return {
          ...card,
          askingInput: nextValue,
          askingPriceCents,
          askingLineTotalUsd
        };
      });
      setCardAskingTotal(recomputeAskingTotal(next));
      return next;
    });
  }

  function handleAskingQuantityChange(index, nextValue) {
    const raw = Number(nextValue);

    setUploadedCards((previous) => {
      const next = previous.map((card, i) => {
        if (i !== index) {
          return card;
        }
        const askingQuantity = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
        const clamped = Math.max(1, Math.min(card.quantity, askingQuantity));
        const askingUnitUsd =
          card.askingPriceCents === null || card.askingPriceCents === undefined
            ? null
            : Number(card.askingPriceCents) / 100;
        const askingLineTotalUsd = askingUnitUsd !== null ? askingUnitUsd * clamped : null;
        return { ...card, askingQuantity: clamped, askingLineTotalUsd };
      });
      setCardAskingTotal(recomputeAskingTotal(next));
      return next;
    });
  }

  function handleAskingPriceBlur(index) {
    setUploadedCards((previous) => {
      const next = previous.map((card, i) => {
        if (i !== index) {
          return card;
        }
        return {
          ...card,
          askingInput: formatCents(card.askingPriceCents)
        };
      });
      return next;
    });
  }

  async function loadVersionOptionsFor(cardKey, cardName) {
    if (!cardKey || !cardName) {
      return;
    }

    if (versionOptionsByKey[cardKey]) {
      return;
    }

    setVersionLoadingKey(cardKey);
    try {
      const query = encodeURIComponent(`!"${cardName}"`);
      const response = await fetch(
        `https://api.scryfall.com/cards/search?q=${query}&unique=prints&order=released&dir=desc`
      );
      if (!response.ok) {
        setVersionLoadingKey(null);
        return;
      }
      const payload = await response.json();
      const options = Array.isArray(payload.data)
        ? payload.data.slice(0, 25).map((card) => {
            const faces = Array.isArray(card.card_faces) ? card.card_faces : null;
            const frontImage = card.image_uris
              ? card.image_uris
              : faces && faces[0] && faces[0].image_uris
                ? faces[0].image_uris
                : null;
            const backImage =
              faces && faces[1] && faces[1].image_uris ? faces[1].image_uris : null;

            return {
              id: card.id,
              name: card.name,
              set: card.set,
              setName: card.set_name,
              collectorNumber: card.collector_number,
              releasedAt: card.released_at,
              imageSmall: frontImage?.small || null,
              imageNormal: frontImage?.normal || null,
              imageSmallBack: backImage?.small || null,
              imageNormalBack: backImage?.normal || null
            };
          })
        : [];

      setVersionOptionsByKey((prev) => ({ ...prev, [cardKey]: options }));
    } catch (_error) {
      // ignore
    } finally {
      setVersionLoadingKey(null);
    }
  }

  async function handleVersionChange(index, nextScryfallId) {
    const scryfallId = String(nextScryfallId || '').trim();
    if (!scryfallId) {
      return;
    }

    setUploadedCards((prev) =>
      prev.map((card, i) => (i === index ? { ...card, scryfallId } : card))
    );

    // Reprice & refresh metadata from the exact printing.
    const card = uploadedCards[index];
    if (!card) {
      return;
    }
    const refreshed = await fetchCardFromScryfall({
      cardName: card.resolvedName || card.inputName,
      scryfallId
    });

    setUploadedCards((prev) =>
      prev.map((row, i) => {
        if (i !== index) {
          return row;
        }
        const unitUsd = parseUsdPrice(refreshed.tcgLow);
        const lineTotalUsd = unitUsd !== null ? unitUsd * row.quantity : null;
        return {
          ...row,
          ...refreshed,
          scryfallId: refreshed.scryfallId || scryfallId,
          setCode: refreshed.setCode || row.setCode || null,
          setName: refreshed.setName || row.setName || null,
          collectorNumber: refreshed.collectorNumber || row.collectorNumber || null,
          imageSmall: refreshed.imageSmall || row.imageSmall || null,
          imageNormal: refreshed.imageNormal || row.imageNormal || null,
          imageSmallBack: refreshed.imageSmallBack || row.imageSmallBack || null,
          imageNormalBack: refreshed.imageNormalBack || row.imageNormalBack || null,
          unitUsd,
          lineTotalUsd
        };
      })
    );
  }

  async function handleSaveList() {
    if (!loggedInUser || loggedInUser.role !== 'user') {
      setCardUploadFeedback('Log in with a user account to save a card list.');
      return;
    }

    const authHeader = loginAuthHeader;
    if (!authHeader) {
      setCardUploadFeedback('Please log in again to continue.');
      return;
    }

    if (isCardsSaving) {
      return;
    }

    const entries = uploadedCards
      .map((card) => ({
        cardName: String(card.resolvedName || card.inputName || '').trim(),
        quantity: Number(card.quantity) || 1,
        askingQuantity: Number(card.askingQuantity) || Number(card.quantity) || 1,
        askingPriceCents:
          card.askingPriceCents === null || card.askingPriceCents === undefined
            ? null
            : Number(card.askingPriceCents),
        scryfallId: card.scryfallId || null,
        setCode: card.setCode || null,
        setName: card.setName || null,
        collectorNumber: card.collectorNumber || null,
        imageSmall: card.imageSmall || null,
        imageNormal: card.imageNormal || null,
        imageSmallBack: card.imageSmallBack || null,
        imageNormalBack: card.imageNormalBack || null
      }))
      .filter((entry) => entry.cardName);

    if (entries.length === 0) {
      setCardUploadFeedback('No cards to save.');
      return;
    }

    setIsCardsSaving(true);
    try {
      const saveResponse = await fetch(`${apiBaseUrl}/api/cards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader
        },
        body: JSON.stringify({ cards: entries })
      });

      const payload = await saveResponse.json();
      if (!saveResponse.ok) {
        setCardUploadFeedback(payload.error || 'Could not save your card list.');
        return;
      }

      setCardUploadFeedback(
        `Saved ${entries.length} unique card${entries.length === 1 ? '' : 's'} to My Cards.`
      );
    } catch (_error) {
      setCardUploadFeedback('Could not save card list right now.');
    } finally {
      setIsCardsSaving(false);
    }
  }

  async function handleSaveSettings(event) {
    event.preventDefault();
    setSettingsFeedback('');

    if (!loggedInUser || loggedInUser.role !== 'user') {
      setSettingsFeedback('Please log in with a user account.');
      return;
    }
    if (!loginAuthHeader) {
      setSettingsFeedback('Please log in again.');
      return;
    }

    setIsSettingsSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: loginAuthHeader
        },
        body: JSON.stringify({
          fullName: settingsFullName,
          email: settingsEmail,
          currentPassword: settingsNewPassword ? settingsCurrentPassword : undefined,
          password: settingsNewPassword ? settingsNewPassword : undefined
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        setSettingsFeedback(payload.error || 'Could not save settings.');
        return;
      }

      setSettingsFeedback('Settings saved.');
      setSettingsCurrentPassword('');
      setSettingsNewPassword('');
    } catch (_error) {
      setSettingsFeedback('Could not save settings.');
    } finally {
      setIsSettingsSaving(false);
    }
  }

  const headerLogin = (
    <div className="topbar-right">
      <form className="top-login-form" onSubmit={handleUserLogin}>
        <label htmlFor="top-login-identifier" className="sr-only">
          Username or Email
        </label>
        <input
          id="top-login-identifier"
          type="text"
          placeholder="username or email"
          value={loginIdentifier}
          onChange={(event) => setLoginIdentifier(event.target.value)}
          required
        />
        <label htmlFor="top-login-password" className="sr-only">
          Password
        </label>
        <input
          id="top-login-password"
          type="password"
          placeholder="password"
          value={loginPassword}
          onChange={(event) => setLoginPassword(event.target.value)}
          required
        />
        <button type="submit" disabled={isLoginSubmitting}>
          {isLoginSubmitting ? 'Signing in...' : 'Login'}
        </button>
      </form>
      {loginFeedback ? <p className="top-login-feedback">{loginFeedback}</p> : null}
      {loggedInUser ? (
        <p className="top-login-feedback">
          Signed in as {loggedInUser.username} ({loggedInUser.role})
        </p>
      ) : null}
      {loggedInUser?.role === 'admin' && adminAccountCount !== null ? (
        <p className="top-login-feedback">
          Admin access: {adminAccountCount} accounts in database.
        </p>
      ) : null}
      {loggedInUser ? (
        <button type="button" onClick={handleLogout}>
          Logout
        </button>
      ) : null}
    </div>
  );

  const headerBrand = (
    <div className="topbar-left">
      <a className="logo" href="#/">
        Making Magic Meetups
      </a>
      <a className="topbar-link" href="#/dashboard">
        Dashboard
      </a>
      <a className="topbar-link" href="#/settings">
        Settings
      </a>
      <a className="topbar-link" href="#/my-cards">
        My Cards
      </a>
    </div>
  );

  const loginServiceIndicator = (
    <div className="login-service-indicator" role="status" aria-live="polite">
      <button
        type="button"
        className={`login-service-button login-service-${loginServiceStatus}`}
        onClick={checkLoginService}
        title="Click to re-check login service"
      >
        Login Service:{' '}
        {loginServiceStatus === 'ok'
          ? 'Online'
          : loginServiceStatus === 'bad'
            ? 'Offline'
            : 'Checking...'}
      </button>
      {loginServiceLastCheckedAt ? (
        <p className="login-service-meta">
          {apiBaseUrl}{' '}
          {loginServiceLastStatusCode ? `(${loginServiceLastStatusCode}) ` : ''}
          · Last checked {new Date(loginServiceLastCheckedAt).toLocaleTimeString()}
        </p>
      ) : null}
    </div>
  );

  if (route === 'settings') {
    return (
      <div className="page">
        <header className="topbar">
          {headerBrand}
          {headerLogin}
        </header>

        <main>
          <section className="join">
            <p className="kicker">User Login</p>
            <h1>User Settings</h1>
            {!loggedInUser || loggedInUser.role !== 'user' ? (
              <p>Please log in with a user account to edit settings.</p>
            ) : (
              <>
                <form className="join-form" onSubmit={handleSaveSettings}>
                  <label htmlFor="settings-username" className="sr-only">
                    Username
                  </label>
                  <input
                    id="settings-username"
                    type="text"
                    placeholder="username"
                    value={settingsUsername}
                    readOnly
                    aria-readonly="true"
                    title="Username cannot be changed."
                  />
                  <label htmlFor="settings-fullname" className="sr-only">
                    Full Name
                  </label>
                  <input
                    id="settings-fullname"
                    type="text"
                    placeholder="Full name"
                    value={settingsFullName}
                    onChange={(event) => setSettingsFullName(event.target.value)}
                    required
                  />
                  <label htmlFor="settings-email" className="sr-only">
                    Email
                  </label>
                  <input
                    id="settings-email"
                    type="email"
                    placeholder="you@example.com"
                    value={settingsEmail}
                    onChange={(event) => setSettingsEmail(event.target.value)}
                    required
                  />
                  <label htmlFor="settings-password" className="sr-only">
                    New Password
                  </label>
                  <input
                    id="settings-password"
                    type="password"
                    placeholder="New password (optional)"
                    value={settingsNewPassword}
                    onChange={(event) => setSettingsNewPassword(event.target.value)}
                    minLength={6}
                  />
                  <label htmlFor="settings-current-password" className="sr-only">
                    Current Password
                  </label>
                  <input
                    id="settings-current-password"
                    type="password"
                    placeholder="Current password (required to change password)"
                    value={settingsCurrentPassword}
                    onChange={(event) => setSettingsCurrentPassword(event.target.value)}
                    required={Boolean(settingsNewPassword)}
                    disabled={!settingsNewPassword}
                  />
                  <button type="submit" disabled={isSettingsSaving}>
                    {isSettingsSaving ? 'Saving...' : 'Save Settings'}
                  </button>
                </form>

                <div className="settings-panel">
                  <h2>Preferred Store</h2>
                  {preferredStore ? (
                    <div className="settings-store">
                      <p className="settings-store-name">{preferredStore.name || 'Preferred store'}</p>
                      {preferredStore.address ? (
                        <p className="settings-store-address">{preferredStore.address}</p>
                      ) : null}
                      {preferredStore.website ? (
                        <p>
                          <a href={preferredStore.website} target="_blank" rel="noreferrer">
                            Website
                          </a>
                        </p>
                      ) : preferredStore.url ? (
                        <p>
                          <a href={preferredStore.url} target="_blank" rel="noreferrer">
                            Google Listing
                          </a>
                        </p>
                      ) : null}
                      {preferredStore.phone ? (
                        <p className="settings-store-address">{preferredStore.phone}</p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => savePreferredStore(null)}
                        disabled={isPreferredStoreSaving}
                      >
                        {isPreferredStoreSaving ? 'Clearing...' : 'Clear Preferred Store'}
                      </button>
                    </div>
                  ) : (
                    <p>No preferred store selected yet.</p>
                  )}

                  <form className="join-form" onSubmit={handleStoreSearch}>
                    <label htmlFor="store-search" className="sr-only">
                      Search stores
                    </label>
                    <input
                      id="store-search"
                      type="text"
                      placeholder="Search store name or city"
                      value={storeSearchQuery}
                      onChange={(event) => setStoreSearchQuery(event.target.value)}
                    />
                    <button type="submit" disabled={isStoreSearching}>
                      {isStoreSearching ? 'Searching...' : 'Search'}
                    </button>
                  </form>

                  {!isMapKitReady ? (
                    <p className="settings-store-address">
                      Store search requires Apple MapKit. If this message persists, the MapKit token
                      is not configured.
                    </p>
                  ) : null}

                  {storeSearchFeedback ? <p>{storeSearchFeedback}</p> : null}

                  {storeSearchResults.length ? (
                    <div className="store-results">
                      {storeSearchResults.map((store) => (
                        <div key={store.placeId || store.name} className="store-result">
                          <div className="store-result-main">
                            <p className="store-result-name">{store.name}</p>
                            {store.address ? <p className="store-result-address">{store.address}</p> : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => savePreferredStore(store)}
                            disabled={isPreferredStoreSaving || !store.placeId}
                          >
                            {isPreferredStoreSaving ? 'Saving...' : 'Set Preferred'}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            )}
            {settingsFeedback ? <p>{settingsFeedback}</p> : null}
          </section>
        </main>
        {loginServiceIndicator}
      </div>
    );
  }

  if (route === 'dashboard') {
    return (
      <div className="page">
        <header className="topbar">
          {headerBrand}
          {headerLogin}
        </header>

        <main>
          <section className="join">
            <p className="kicker">Dashboard</p>
            <h1>Dashboard</h1>
            <p>
              {loggedInUser?.role === 'admin'
                ? 'Admin view: account credentials and users.'
                : 'This is your dashboard workspace. Upload your card list below.'}
            </p>
            {loggedInUser?.role === 'admin' ? (
              <div className="card-upload-results">
                <h2>Account Credentials</h2>
                <table className="price-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminAccounts.map((account) => (
                      <tr key={account.id}>
                        <td>{account.id}</td>
                        <td>{account.username}</td>
                        <td>{account.email}</td>
                        <td>{account.password || '(not stored for older account)'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {loggedInUser?.role === 'user' ? (
              <>
                <form className="dashboard-tool" onSubmit={handleCardListUpload}>
                  <label htmlFor="card-list-input">Magic: The Gathering card list</label>
                  <textarea
                    id="card-list-input"
                    placeholder="Example: Black Lotus&#10;Lightning Bolt&#10;Sol Ring"
                    value={cardInputText}
                    onChange={(event) => setCardInputText(event.target.value)}
                    rows={8}
                  />
                  <button type="submit">Upload Card List</button>
                </form>
                {cardUploadFeedback ? <p className="notice">{cardUploadFeedback}</p> : null}
                {isCardPriceLoading ? <p className="notice subtle">Loading prices from Scryfall...</p> : null}
                {uploadedCards.length > 0 ? (
                  <div className="card-upload-results">
                    <h2>Uploaded Cards</h2>
                    <div className="dashboard-actions">
                      <button
                        type="button"
                        className="action-button primary"
                        onClick={handleSaveList}
                        disabled={isCardPriceLoading || isCardsSaving}
                      >
                        {isCardsSaving ? 'Saving...' : 'Save To My Cards'}
                      </button>
                      <label className="sort-control">
                        <span className="sort-label">Sort</span>
                        <select
                          className="sort-select"
                          value={cardSortMode}
                          onChange={(event) => setCardSortMode(event.target.value)}
                        >
                          <option value="upload">Upload order</option>
                          <option value="alpha">Alphabetical (A-Z)</option>
                          <option value="tcgLowDesc">TCGPlayer Low (High to Low)</option>
                          <option value="tcgLowAsc">TCGPlayer Low (Low to High)</option>
                        </select>
                      </label>
                    </div>
                    <table className="price-table">
                      <thead>
                        <tr>
                          <th>Pic</th>
                          <th>Card</th>
                          <th>Version</th>
                          <th>Qty</th>
                          <th>TCGPlayer Low</th>
                          <th>Line Total</th>
                          <th>Asking For</th>
                          <th>Ask Qty</th>
                          <th>Asking Total</th>
                          <th>Links / Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSortedCardsWithIndex(uploadedCards, cardSortMode).map(
                          ({ card, index }) => (
                            <tr key={`${card.scryfallId || card.inputName || card.resolvedName}-${index}`}>
                            <td>
                              {card.imageSmall ? (
                                <div className="thumb-wrap">
                                  <img
                                    className="card-thumb"
                                    src={card.imageSmall}
                                    alt={card.resolvedName}
                                    loading="lazy"
                                  />
                                  {card.imageNormal || card.imageSmall ? (
                                    <img
                                      className="card-thumb-preview front"
                                      src={card.imageNormal || card.imageSmall}
                                      alt=""
                                      loading="lazy"
                                    />
                                  ) : null}
                                  {card.imageNormalBack || card.imageSmallBack ? (
                                    <img
                                      className="card-thumb-preview back"
                                      src={card.imageNormalBack || card.imageSmallBack}
                                      alt=""
                                      loading="lazy"
                                    />
                                  ) : null}
                                </div>
                              ) : null}
                            </td>
                            <td>{card.resolvedName}</td>
                            <td>
                              <button
                                type="button"
                                className="version-button"
                                onClick={() =>
                                  loadVersionOptionsFor(
                                    card.scryfallId || card.resolvedName || card.inputName,
                                    card.resolvedName || card.inputName
                                  )
                                }
                              >
                                {card.setCode && card.collectorNumber
                                  ? `${card.setCode.toUpperCase()} #${card.collectorNumber}`
                                  : 'Choose'}
                              </button>
                              {versionLoadingKey ===
                              (card.scryfallId || card.resolvedName || card.inputName) ? (
                                <div className="version-picker">Loading...</div>
                              ) : null}
                              {versionOptionsByKey[
                                card.scryfallId || card.resolvedName || card.inputName
                              ]?.length ? (
                                <div className="version-picker">
                                  <select
                                    value={card.scryfallId || ''}
                                    onChange={(event) =>
                                      handleVersionChange(index, event.target.value)
                                    }
                                  >
                                    {versionOptionsByKey[
                                      card.scryfallId || card.resolvedName || card.inputName
                                    ].map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.set.toUpperCase()} #{option.collectorNumber} ·{' '}
                                        {option.setName} · {option.releasedAt}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : null}
                            </td>
                            <td>
                              <input
                                className="qty-input"
                                type="number"
                                min={1}
                                step={1}
                                value={card.quantity}
                                onChange={(event) => handleQuantityChange(index, event.target.value)}
                              />
                            </td>
                            <td>{card.tcgLow}</td>
                            <td>
                              {card.lineTotalUsd !== null
                                ? `$${card.lineTotalUsd.toFixed(2)}`
                                : 'N/A'}
                            </td>
                            <td>
                              <input
                                className="ask-input"
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={card.askingInput ?? formatCents(card.askingPriceCents)}
                                onChange={(event) => handleAskingPriceChange(index, event.target.value)}
                                onBlur={() => handleAskingPriceBlur(index)}
                              />
                            </td>
                            <td>
                              <input
                                className="qty-input"
                                type="number"
                                min={1}
                                step={1}
                                value={card.askingQuantity ?? card.quantity}
                                onChange={(event) =>
                                  handleAskingQuantityChange(index, event.target.value)
                                }
                              />
                            </td>
                            <td>
                              {card.askingLineTotalUsd !== null
                                ? `$${card.askingLineTotalUsd.toFixed(2)}`
                                : 'N/A'}
                            </td>
                            <td>
                              {card.tcgUrl ? (
                                <a href={card.tcgUrl} target="_blank" rel="noreferrer">
                                  TCGPlayer
                                </a>
                              ) : card.error ? (
                                card.error
                              ) : (
                                'No link'
                              )}
                            </td>
                          </tr>
                          )
                        )}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th colSpan={5}>Total</th>
                          <th>${cardCostTotal.toFixed(2)}</th>
                          <th />
                          <th>${cardAskingTotal.toFixed(2)}</th>
                          <th />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        </main>
        {loginServiceIndicator}
      </div>
    );
  }

  if (route === 'my-cards') {
    return (
      <div className="page">
        <header className="topbar">
          {headerBrand}
          {headerLogin}
        </header>

        <main>
          <section className="join">
            <p className="kicker">My Cards</p>
            <h1>My Cards</h1>
            {!loggedInUser || loggedInUser.role !== 'user' ? (
              <p>Please log in with a user account to view your saved card list.</p>
            ) : (
              <>
                <p>This is your saved card database (permanent storage). You can edit and save.</p>
                <div className="dashboard-actions">
                  <button
                    type="button"
                    className="action-button secondary"
                    onClick={() => loadUserCardsFromApi(loginAuthHeader)}
                    disabled={isCardPriceLoading || isCardsSaving}
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    className="action-button primary"
                    onClick={handleSaveList}
                    disabled={isCardPriceLoading || isCardsSaving || uploadedCards.length === 0}
                  >
                    {isCardsSaving ? 'Saving...' : 'Save'}
                  </button>
                  <label className="sort-control">
                    <span className="sort-label">Sort</span>
                    <select
                      className="sort-select"
                      value={cardSortMode}
                      onChange={(event) => setCardSortMode(event.target.value)}
                    >
                      <option value="upload">Current order</option>
                      <option value="alpha">Alphabetical (A-Z)</option>
                      <option value="tcgLowDesc">TCGPlayer Low (High to Low)</option>
                      <option value="tcgLowAsc">TCGPlayer Low (Low to High)</option>
                    </select>
                  </label>
                </div>
                {cardUploadFeedback ? <p className="notice">{cardUploadFeedback}</p> : null}
                {isCardPriceLoading ? <p className="notice subtle">Loading prices from Scryfall...</p> : null}
                {uploadedCards.length > 0 ? (
                  <div className="card-upload-results">
                    <h2>Saved Cards</h2>
                    <table className="price-table">
                      <thead>
                        <tr>
                          <th>Pic</th>
                          <th>Card</th>
                          <th>Version</th>
                          <th>Qty</th>
                          <th>TCGPlayer Low</th>
                          <th>Line Total</th>
                          <th>Asking For</th>
                          <th>Ask Qty</th>
                          <th>Asking Total</th>
                          <th>Links / Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSortedCardsWithIndex(uploadedCards, cardSortMode).map(
                          ({ card, index }) => (
                            <tr key={`${card.scryfallId || card.inputName || card.resolvedName}-${index}`}>
                            <td>
                              {card.imageSmall ? (
                                <div className="thumb-wrap">
                                  <img
                                    className="card-thumb"
                                    src={card.imageSmall}
                                    alt={card.resolvedName}
                                    loading="lazy"
                                  />
                                  {card.imageNormal || card.imageSmall ? (
                                    <img
                                      className="card-thumb-preview front"
                                      src={card.imageNormal || card.imageSmall}
                                      alt=""
                                      loading="lazy"
                                    />
                                  ) : null}
                                  {card.imageNormalBack || card.imageSmallBack ? (
                                    <img
                                      className="card-thumb-preview back"
                                      src={card.imageNormalBack || card.imageSmallBack}
                                      alt=""
                                      loading="lazy"
                                    />
                                  ) : null}
                                </div>
                              ) : null}
                            </td>
                            <td>{card.resolvedName}</td>
                            <td>
                              <button
                                type="button"
                                className="version-button"
                                onClick={() =>
                                  loadVersionOptionsFor(
                                    card.scryfallId || card.resolvedName || card.inputName,
                                    card.resolvedName || card.inputName
                                  )
                                }
                              >
                                {card.setCode && card.collectorNumber
                                  ? `${card.setCode.toUpperCase()} #${card.collectorNumber}`
                                  : 'Choose'}
                              </button>
                              {versionLoadingKey ===
                              (card.scryfallId || card.resolvedName || card.inputName) ? (
                                <div className="version-picker">Loading...</div>
                              ) : null}
                              {versionOptionsByKey[
                                card.scryfallId || card.resolvedName || card.inputName
                              ]?.length ? (
                                <div className="version-picker">
                                  <select
                                    value={card.scryfallId || ''}
                                    onChange={(event) =>
                                      handleVersionChange(index, event.target.value)
                                    }
                                  >
                                    {versionOptionsByKey[
                                      card.scryfallId || card.resolvedName || card.inputName
                                    ].map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.set.toUpperCase()} #{option.collectorNumber} ·{' '}
                                        {option.setName} · {option.releasedAt}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : null}
                            </td>
                            <td>
                              <input
                                className="qty-input"
                                type="number"
                                min={1}
                                step={1}
                                value={card.quantity}
                                onChange={(event) => handleQuantityChange(index, event.target.value)}
                              />
                            </td>
                            <td>{card.tcgLow}</td>
                            <td>
                              {card.lineTotalUsd !== null
                                ? `$${card.lineTotalUsd.toFixed(2)}`
                                : 'N/A'}
                            </td>
                            <td>
                              <input
                                className="ask-input"
                                type="text"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={card.askingInput ?? formatCents(card.askingPriceCents)}
                                onChange={(event) =>
                                  handleAskingPriceChange(index, event.target.value)
                                }
                                onBlur={() => handleAskingPriceBlur(index)}
                              />
                            </td>
                            <td>
                              <input
                                className="qty-input"
                                type="number"
                                min={1}
                                step={1}
                                value={card.askingQuantity ?? card.quantity}
                                onChange={(event) =>
                                  handleAskingQuantityChange(index, event.target.value)
                                }
                              />
                            </td>
                            <td>
                              {card.askingLineTotalUsd !== null
                                ? `$${card.askingLineTotalUsd.toFixed(2)}`
                                : 'N/A'}
                            </td>
                            <td>
                              {card.tcgUrl ? (
                                <a href={card.tcgUrl} target="_blank" rel="noreferrer">
                                  TCGPlayer
                                </a>
                              ) : card.error ? (
                                card.error
                              ) : (
                                'No link'
                              )}
                            </td>
                          </tr>
                          )
                        )}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th colSpan={5}>Total</th>
                          <th>${cardCostTotal.toFixed(2)}</th>
                          <th />
                          <th>${cardAskingTotal.toFixed(2)}</th>
                          <th />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p>No saved cards yet.</p>
                )}
              </>
            )}
          </section>
        </main>
        {loginServiceIndicator}
      </div>
    );
  }

  if (route === 'create-account') {
    return (
      <div className="page">
        <header className="topbar">
          {headerBrand}
          {headerLogin}
        </header>

        <main>
          <section className="join">
            <p className="kicker">Create Account</p>
            <h1>Create your account</h1>
            <p>Enter your basic information to create an account.</p>
            <form className="join-form" onSubmit={handleCreateAccount}>
              <label htmlFor="create-full-name" className="sr-only">
                Full Name
              </label>
              <input
                id="create-full-name"
                type="text"
                placeholder="Full name"
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                required
              />
              <label htmlFor="create-username" className="sr-only">
                Username
              </label>
              <input
                id="create-username"
                type="text"
                placeholder="username"
                value={accountUsername}
                onChange={(event) => setAccountUsername(event.target.value.toLowerCase())}
                required
                minLength={3}
                maxLength={24}
                pattern="[a-z0-9_]+"
              />
              <label htmlFor="create-email" className="sr-only">
                Email
              </label>
              <input
                id="create-email"
                type="email"
                placeholder="you@example.com"
                value={accountEmail}
                onChange={(event) => setAccountEmail(event.target.value)}
                required
              />
              <label htmlFor="create-password" className="sr-only">
                Password
              </label>
              <input
                id="create-password"
                type="password"
                placeholder="Create password"
                value={accountPassword}
                onChange={(event) => setAccountPassword(event.target.value)}
                required
                minLength={6}
              />
              <button type="submit" disabled={isAccountSubmitting}>
                {isAccountSubmitting ? 'Creating...' : 'Create Account'}
              </button>
            </form>
            {accountFeedback ? <p>{accountFeedback}</p> : null}
          </section>
        </main>
        {loginServiceIndicator}
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        {headerBrand}
        {headerLogin}
      </header>

      <main>
        <section className="hero">
          <p className="kicker">Landing Page</p>
          <h1>Enabling Trading Through a Digital Service</h1>
          <p>We strive to connect you to other players who just want to trade cards, am I right?</p>
          <div className="hero-actions">
            <a className="button primary" href="#/create-account">
              Create Account
            </a>
            <a className="button secondary" href="#events">
              View Upcoming
            </a>
          </div>
        </section>

        <section className="events" id="events">
          {events.map((event) => (
            <article className="card" key={event.title}>
              <p className="date">{event.date}</p>
              <h2>{event.title}</h2>
              <p>{event.text}</p>
            </article>
          ))}
        </section>

        <section className="join" id="join">
          <h2>Get the weekly meetup drop</h2>
          <p>One email every Tuesday with events, themes, and early RSVP links.</p>
          <form className="join-form" onSubmit={handleJoinSubmit}>
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Notify Me'}
            </button>
          </form>
          {feedback ? <p>{feedback}</p> : null}
        </section>

      </main>
      {loginServiceIndicator}
    </div>
  );
}
