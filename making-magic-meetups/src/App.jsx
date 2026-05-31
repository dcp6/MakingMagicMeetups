import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyAskingQuantityChange,
  applyQuantityChange,
  buildMyCardsTableModel,
  sortCardsWithIndex
} from './tableLogic';

const canonicalApiBaseUrl = 'https://makingmagicmeetups-1.onrender.com';
const legacyApiBaseUrls = new Set([
  'https://makingmagicmeetups-api.onrender.com',
  'https://makingmagicmeetups.onrender.com'
]);

function normalizeApiBaseUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  if (!normalized) {
    return '';
  }
  if (legacyApiBaseUrls.has(normalized)) {
    return canonicalApiBaseUrl;
  }
  return normalized;
}

const configuredApiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || '');
const sessionStorageKey = 'making_magic_meetups_session_v1';
const apiBaseStorageKey = 'making_magic_meetups_api_base_v1';

// Standard TCGPlayer condition grade multipliers relative to Near Mint (NM = 1.0).
// These are widely-accepted community approximations; actual prices vary by card.
const CONDITION_MULTIPLIERS = { nm: 1.0, lp: 0.80, mp: 0.64, hp: 0.40, dmg: 0.25 };

function getConditionMultiplier(condition) {
  return CONDITION_MULTIPLIERS[String(condition || '').toLowerCase()] ?? 1.0;
}

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

const STATUS_OPTIONS = [
  { value: 'have',       label: 'Own',   mod: 'have' },
  { value: 'requesting', label: 'Want',  mod: 'want' },
  { value: 'offering',   label: 'Offer', mod: 'offer' },
];

function StatusToggle({ value, onChange, ariaLabel }) {
  const active = value || 'have';
  return (
    <div className="status-toggle" role="group" aria-label={ariaLabel}>
      {STATUS_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`status-toggle-btn status-toggle-btn--${opt.mod}${active === opt.value ? ' active' : ''}`}
          onClick={() => onChange(opt.value)}
          aria-pressed={active === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

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
      const stored = normalizeApiBaseUrl(window.localStorage.getItem(apiBaseStorageKey));
      if (stored && /^https?:\/\//i.test(stored)) {
        return stored;
      }
    } catch (_error) {
      // ignore
    }
    // Default guess; we will auto-detect the right one on load.
    return canonicalApiBaseUrl;
  });
  const [route, setRoute] = useState('home');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountUsername, setAccountUsername] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState('');
  const [accountFeedback, setAccountFeedback] = useState('');
  const [isAccountSubmitting, setIsAccountSubmitting] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotFeedback, setForgotFeedback] = useState('');
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);
  const [resetTokenInput, setResetTokenInput] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [resetFeedback, setResetFeedback] = useState('');
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginFeedback, setLoginFeedback] = useState('');
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [loginAuthHeader, setLoginAuthHeader] = useState(null);
  const [adminAccountCount, setAdminAccountCount] = useState(null);
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [adminPasswordResetEvents, setAdminPasswordResetEvents] = useState([]);
  const [futureIsNowMaterial, setFutureIsNowMaterial] = useState(['', '', '', '', '']);
  const [cardInputText, setCardInputText] = useState('');
  const [uploadedCards, setUploadedCards] = useState([]);
  const [showingJustSavedCards, setShowingJustSavedCards] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [cardCostTotal, setCardCostTotal] = useState(0);
  const [cardUploadFeedback, setCardUploadFeedback] = useState('');
  const [isCardPriceLoading, setIsCardPriceLoading] = useState(false);
  const [isCardsSaving, setIsCardsSaving] = useState(false);
  const [deletingCardKey, setDeletingCardKey] = useState(null);
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
  const [settingsResetFeedback, setSettingsResetFeedback] = useState('');
  const [isSettingsResetSubmitting, setIsSettingsResetSubmitting] = useState(false);
  const [preferredStore, setPreferredStore] = useState(null);
  const [citySearchQuery, setCitySearchQuery] = useState('');
  const [citySearchResults, setCitySearchResults] = useState([]);
  const [citySearchFeedback, setCitySearchFeedback] = useState('');
  const [isCitySearching, setIsCitySearching] = useState(false);
  const [isPreferredStoreSaving, setIsPreferredStoreSaving] = useState(false);
  const [dashboardMobileSelectedCardKey, setDashboardMobileSelectedCardKey] = useState('');
  const [savedMobileSelectedCardKey, setSavedMobileSelectedCardKey] = useState('');
  const [requestingMobileSelectedCardKey, setRequestingMobileSelectedCardKey] = useState('');
  const [offeringMobileSelectedCardKey, setOfferingMobileSelectedCardKey] = useState('');
  const [loginServiceStatus, setLoginServiceStatus] = useState('unknown');
  const [loginServiceLastCheckedAt, setLoginServiceLastCheckedAt] = useState(null);
  const [loginServiceLastStatusCode, setLoginServiceLastStatusCode] = useState(null);
  // Messages
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesFeedback, setMessagesFeedback] = useState('');
  const [composeRecipient, setComposeRecipient] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [activeConversationUsername, setActiveConversationUsername] = useState(null);
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  // Card matches
  const [cardMatches, setCardMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  // Price Matches dashboard filter
  const [priceMatchFilter, setPriceMatchFilter] = useState('all');
  // Great Offers (home page)
  const [greatOffers, setGreatOffers] = useState([]);
  const [greatOffersLoading, setGreatOffersLoading] = useState(false);

  useEffect(() => {
    function syncRouteFromHash() {
      const rawHash = window.location.hash || '#/';
      const hashWithoutPound = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
      const [pathPart, queryPart = ''] = hashWithoutPound.split('?');
      const normalizedPath = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;

      if (normalizedPath === '/create-account') {
        setRoute('create-account');
        return;
      }
      if (normalizedPath === '/dashboard') {
        setRoute('dashboard');
        return;
      }
      if (normalizedPath === '/settings') {
        setRoute('settings');
        return;
      }
      if (normalizedPath === '/my-cards') {
        setRoute('my-cards');
        return;
      }
      if (normalizedPath === '/messages') {
        setRoute('messages');
        return;
      }
      if (normalizedPath === '/forgot-password') {
        setRoute('forgot-password');
        return;
      }
      if (normalizedPath === '/reset-password') {
        const params = new URLSearchParams(queryPart);
        const tokenFromHash = String(params.get('token') || '').trim();
        if (tokenFromHash) {
          setResetTokenInput(tokenFromHash);
        }
        setRoute('reset-password');
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
        stored = normalizeApiBaseUrl(window.localStorage.getItem(apiBaseStorageKey));
      } catch (_error) {
        stored = '';
      }

      const candidates = [
        apiBaseUrl,
        configuredApiBaseUrl,
        stored,
        canonicalApiBaseUrl
      ]
        .map((value) => normalizeApiBaseUrl(value))
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
    if (route !== 'my-cards' && route !== 'dashboard') {
      return;
    }
    if (!loggedInUser || loggedInUser.role !== 'user' || !loginAuthHeader) {
      return;
    }
    loadUserCardsFromApi(loginAuthHeader);
    if (route === 'my-cards') {
      loadMatchesFromApi();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, loggedInUser, loginAuthHeader, apiBaseUrl]);

  useEffect(() => {
    if (route !== 'messages') {
      return;
    }
    if (!loggedInUser || loggedInUser.role !== 'user' || !loginAuthHeader) {
      return;
    }
    loadMessagesFromApi(loginAuthHeader);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, loggedInUser, loginAuthHeader, apiBaseUrl]);

  useEffect(() => {
    if (route !== 'home') return;
    setGreatOffersLoading(true);
    const params = new URLSearchParams();
    if (preferredStore?.latitude != null)  params.set('lat', preferredStore.latitude);
    if (preferredStore?.longitude != null) params.set('lng', preferredStore.longitude);
    const qs = params.toString() ? `?${params}` : '';
    fetch(`${apiBaseUrl}/api/great-offers${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.offers) setGreatOffers(data.offers); })
      .catch(() => {})
      .finally(() => setGreatOffersLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, apiBaseUrl, preferredStore]);

  function buildCityLabel(r) {
    const addr = r.address || {};
    const name = addr.city || addr.town || addr.village || addr.hamlet || addr.municipality || addr.borough || r.name;
    const countryCode = (addr.country_code || '').toUpperCase();
    if (countryCode === 'US') {
      const stateAbbr = (addr['ISO3166-2-lvl4'] || '').replace(/^US-/, '') || addr.state || '';
      return [name, stateAbbr].filter(Boolean).join(', ');
    }
    const region = addr.state || addr.county || '';
    return [name, region, countryCode].filter((p) => p).join(', ');
  }

  async function handleCitySearch(event) {
    event.preventDefault();
    setCitySearchFeedback('');
    setCitySearchResults([]);

    const query = citySearchQuery.trim();
    if (!query) {
      setCitySearchFeedback('Enter a city or town name.');
      return;
    }

    setIsCitySearching(true);
    try {
      const url =
        `https://nominatim.openstreetmap.org/search` +
        `?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=10&accept-language=en`;
      const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (!resp.ok) throw new Error('lookup failed');
      const data = await resp.json();

      const cityTypes = new Set([
        'city', 'town', 'village', 'hamlet', 'municipality',
        'borough', 'suburb', 'quarter', 'neighbourhood'
      ]);
      const results = data
        .filter((r) => cityTypes.has(r.addresstype) || (r.class === 'place' && cityTypes.has(r.type)))
        .map((r) => ({
          placeId: String(r.place_id),
          name: buildCityLabel(r),
          latitude: Number(r.lat),
          longitude: Number(r.lon)
        }));

      if (results.length === 0) {
        setCitySearchFeedback('No cities found. Try a different spelling or include a country name.');
      } else {
        setCitySearchResults(results);
      }
    } catch (_err) {
      setCitySearchFeedback('Search failed — please try again.');
    } finally {
      setIsCitySearching(false);
    }
  }

  async function savePreferredStore(city) {
    setCitySearchFeedback('');

    if (!loggedInUser || loggedInUser.role !== 'user') {
      setCitySearchFeedback('Please log in with a user account.');
      return;
    }
    if (!loginAuthHeader) {
      setCitySearchFeedback('Please log in again.');
      return;
    }

    setIsPreferredStoreSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/me/preferred-store`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: loginAuthHeader },
        body: JSON.stringify(
          city
            ? {
                placeId: city.placeId || null,
                name: city.name || null,
                latitude: Number.isFinite(city.latitude) ? city.latitude : null,
                longitude: Number.isFinite(city.longitude) ? city.longitude : null
              }
            : { placeId: null }
        )
      });
      const payload = await response.json();
      if (!response.ok) {
        setCitySearchFeedback(payload.error || 'Could not save preferred city.');
        return;
      }
      const saved = payload.preferredStore
        ? {
            name: payload.preferredStore.name || city?.name || null,
            latitude: payload.preferredStore.latitude != null
              ? Number(payload.preferredStore.latitude)
              : (city?.latitude ?? null),
            longitude: payload.preferredStore.longitude != null
              ? Number(payload.preferredStore.longitude)
              : (city?.longitude ?? null)
          }
        : null;
      setPreferredStore(saved);
      setCitySearchResults([]);
      setCitySearchFeedback(city ? '' : '');
    } catch (_error) {
      setCitySearchFeedback('Could not save preferred city. Please try again.');
    } finally {
      setIsPreferredStoreSaving(false);
    }
  }

  useEffect(() => {
    const rawSession =
      window.sessionStorage.getItem(sessionStorageKey) ||
      window.localStorage.getItem(sessionStorageKey);
    if (!rawSession) {
      return;
    }

    try {
      const session = JSON.parse(rawSession);
      if (!session || !session.user || !session.authHeader) {
        window.sessionStorage.removeItem(sessionStorageKey);
        window.localStorage.removeItem(sessionStorageKey);
        return;
      }

      setLoggedInUser(session.user);
      setLoginAuthHeader(session.authHeader);
      setLoginIdentifier(session.identifier || '');
      setLoginFeedback(`Welcome back, ${session.user.username || 'user'}.`);

      if (session.user.role === 'admin') {
        loadAdminAccountsFromApi(session.authHeader);
      } else if (session.user.role === 'user') {
        loadUserCardsFromApi(session.authHeader);
      }
    } catch (_error) {
      window.sessionStorage.removeItem(sessionStorageKey);
      window.localStorage.removeItem(sessionStorageKey);
    }
  }, []);

  function clearStoredSession() {
    window.sessionStorage.removeItem(sessionStorageKey);
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
        setAdminAccounts([]);
        setAdminPasswordResetEvents([]);
        clearStoredSession();
        setLoginFeedback(loginPayload.error || 'Login failed.');
        return;
      }

      setLoggedInUser(loginPayload.user || null);
      setLoginAuthHeader(authHeader);
      setLoginFeedback(`Welcome, ${loginPayload.user?.username || 'user'}.`);
      window.sessionStorage.setItem(
        sessionStorageKey,
        JSON.stringify({
          user: loginPayload.user || null,
          authHeader,
          identifier: trimmedIdentifier
        })
      );

      if (loginPayload.user?.role === 'admin') {
        await loadAdminAccountsFromApi(authHeader);
      } else {
        setAdminAccountCount(null);
        setAdminAccounts([]);
        setAdminPasswordResetEvents([]);
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
            window.sessionStorage.setItem(
              sessionStorageKey,
              JSON.stringify({
                user: retryPayload.user || null,
                authHeader,
                identifier: trimmedIdentifier
              })
            );
            if (retryPayload.user?.role === 'admin') {
              await loadAdminAccountsFromApi(authHeader);
            } else {
              setAdminAccountCount(null);
              setAdminAccounts([]);
              setAdminPasswordResetEvents([]);
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
      setAdminPasswordResetEvents([]);
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
    setAdminPasswordResetEvents([]);
    setUploadedCards([]);
    setCardInputText('');
    setShowingJustSavedCards(false);
    setDashboardMobileSelectedCardKey('');
    setSavedMobileSelectedCardKey('');
    setRequestingMobileSelectedCardKey('');
    setOfferingMobileSelectedCardKey('');
    setLoginIdentifier('');
    setLoginPassword('');
    setLoginFeedback('Signed out.');
    clearStoredSession();
  }

  async function handleCreateAccount(event) {
    event.preventDefault();
    setAccountFeedback('');

    if (accountPassword !== accountPasswordConfirm) {
      setAccountFeedback('Passwords do not match.');
      return;
    }

    setIsAccountSubmitting(true);

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
      setAccountPasswordConfirm('');
      setAccountFeedback('Account created successfully. You can now log in.');
    } catch (_error) {
      setAccountFeedback('Network error. Please try again.');
    } finally {
      setIsAccountSubmitting(false);
    }
  }

  async function handleForgotPasswordRequest(event) {
    event.preventDefault();
    setForgotFeedback('');
    const identifier = forgotIdentifier.trim();
    if (!identifier) {
      setForgotFeedback('Please provide your username or email.');
      return;
    }

    setIsForgotSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setForgotFeedback(payload.error || 'Could not start password reset.');
        return;
      }
      setForgotFeedback(
        payload.message || 'If an account exists, a password reset link has been sent.'
      );
    } catch (_error) {
      setForgotFeedback('Could not start password reset.');
    } finally {
      setIsForgotSubmitting(false);
    }
  }

  async function handleResetPasswordConfirm(event) {
    event.preventDefault();
    setResetFeedback('');

    const token = resetTokenInput.trim();
    if (!token) {
      setResetFeedback('Reset token is required.');
      return;
    }
    if (!resetPassword || resetPassword.length < 6) {
      setResetFeedback('Password must be at least 6 characters.');
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setResetFeedback('Passwords do not match.');
      return;
    }

    setIsResetSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: resetPassword
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResetFeedback(payload.error || 'Could not reset password.');
        return;
      }
      setResetPassword('');
      setResetPasswordConfirm('');
      setResetFeedback('Password reset complete. You can now log in.');
    } catch (_error) {
      setResetFeedback('Could not reset password.');
    } finally {
      setIsResetSubmitting(false);
    }
  }

  async function handleSettingsPasswordResetRequest() {
    setSettingsResetFeedback('');
    const identifier = String(settingsEmail || settingsUsername || '').trim();
    if (!identifier) {
      setSettingsResetFeedback('Could not determine account email/username for reset.');
      return;
    }

    setIsSettingsResetSubmitting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSettingsResetFeedback(payload.error || 'Could not send password reset link.');
        return;
      }
      setSettingsResetFeedback(
        payload.message || 'If an account exists, a password reset link has been sent.'
      );
    } catch (_error) {
      setSettingsResetFeedback('Could not send password reset link.');
    } finally {
      setIsSettingsResetSubmitting(false);
    }
  }

  async function fetchCardFromScryfall(entry) {
    const cardName = entry.cardName;
    const endpoints = [];

    // Most-specific first: Scryfall ID
    if (entry.scryfallId) {
      endpoints.push(`https://api.scryfall.com/cards/${encodeURIComponent(entry.scryfallId)}`);
    }

    // Set + collector number → exact printing (e.g. /cards/m10/15)
    if (entry.setCode && entry.collectorNumber) {
      endpoints.push(
        `https://api.scryfall.com/cards/${encodeURIComponent(entry.setCode.toLowerCase())}/${encodeURIComponent(entry.collectorNumber)}`
      );
    }

    // Name within a set
    const encoded = encodeURIComponent(cardName);
    if (entry.setCode) {
      endpoints.push(
        `https://api.scryfall.com/cards/named?exact=${encoded}&set=${encodeURIComponent(entry.setCode.toLowerCase())}`
      );
    }

    // Fallback: name-only lookups
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
          tcgLowFoil: data.prices?.usd_foil ? `$${data.prices.usd_foil}` : null,
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
    const result = [];

    for (const line of lines) {
      let quantity = 1;
      let name = line;

      // Strip foil / condition markers: *F*, *E*, *M*, etc.
      name = name.replace(/\*[A-Za-z]+\*/g, '').trim();

      // Quantity patterns:
      const leading = name.match(/^(\d+)\s*x?\s+(.+)$/i);
      const trailingX = name.match(/^(.+?)\s+x\s*(\d+)$/i);
      const trailingParen = name.match(/^(.+?)\s*\(\s*(\d+)\s*\)\s*$/);

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

      // ── Version extraction ────────────────────────────────────────────
      let setCode = null;
      let collectorNumber = null;

      const bracketMatch = name.match(/^(.*?)\s*\[([A-Za-z0-9]{2,6})\]\s*(.*)$/);
      if (bracketMatch) {
        setCode = bracketMatch[2].toUpperCase();
        name = (bracketMatch[1] + ' ' + bracketMatch[3]).trim();
      }

      if (!setCode) {
        const parenMatch = name.match(/^(.*?)\s*\(([A-Za-z][A-Za-z0-9]{1,5})\)\s*(.*)$/);
        if (parenMatch) {
          setCode = parenMatch[2].toUpperCase();
          name = (parenMatch[1] + ' ' + parenMatch[3]).trim();
        }
      }

      const hashMatch = name.match(/^(.*?)\s*#(\d+[a-z]?)\s*(.*)$/i);
      if (hashMatch) {
        collectorNumber = hashMatch[2];
        name = (hashMatch[1] + ' ' + hashMatch[3]).trim();
      } else if (setCode) {
        const trailingNum = name.match(/^(.*\S)\s+(\d+[a-z]?)$/i);
        if (trailingNum) {
          collectorNumber = trailingNum[2];
          name = trailingNum[1].trim();
        }
      }
      // ── End version extraction ─────────────────────────────────────────

      name = name.trim();
      if (!name) {
        continue;
      }

      if (!Number.isFinite(quantity) || quantity <= 0) {
        quantity = 1;
      }

      // Each copy is its own individual card entry (no grouping by name)
      for (let i = 0; i < quantity; i++) {
        result.push({ cardName: name, quantity: 1, setCode, collectorNumber });
      }
    }

    return result;
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

  function normalizeMarketStatus(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'have' || normalized === 'requesting' || normalized === 'offering') {
      return normalized;
    }
    return 'have';
  }

  function marketStatusFromLegacyRequesting(value) {
    return value ? 'requesting' : 'have';
  }

  function recomputeCostTotal(pricedEntries) {
    return pricedEntries.reduce((sum, entry) => {
      if (entry.lineTotalUsd === null) {
        return sum;
      }
      return sum + entry.lineTotalUsd;
    }, 0);
  }

  function buildCardEntriesForSave(cards) {
    return cards
      .map((card) => {
        // Do not save unresolved lookups.
        if (card.error || !card.scryfallId) {
          return null;
        }

        const cardName = String(card.resolvedName || card.inputName || '').trim();
        if (!cardName) {
          return null;
        }

        const askingPriceCents =
          card.askingPriceCents === null || card.askingPriceCents === undefined
            ? null
            : Number(card.askingPriceCents);
        const offerPriceCents =
          card.offerPriceCents === null || card.offerPriceCents === undefined
            ? null
            : Number(card.offerPriceCents);
        const marketPriceCents =
          card.unitUsd != null ? Math.round(card.unitUsd * 100) : null;
        const quantity = 1; // Each row represents one individual card
        const marketStatus = normalizeMarketStatus(
          card.marketStatus ?? marketStatusFromLegacyRequesting(Boolean(card.requesting))
        );

        return {
          cardName,
          quantity,
          marketStatus,
          requesting: marketStatus === 'requesting',
          askingQuantity: null,
          askingPriceCents,
          offerPriceCents,
          marketPriceCents,
          condition: card.condition || null,
          foil: Boolean(card.foil),
          scryfallId: card.scryfallId || null,
          setCode: card.setCode || null,
          setName: card.setName || null,
          collectorNumber: card.collectorNumber || null,
          imageSmall: card.imageSmall || null,
          imageNormal: card.imageNormal || null,
          imageSmallBack: card.imageSmallBack || null,
          imageNormalBack: card.imageNormalBack || null
        };
      })
      .filter(Boolean);
  }

  async function priceCards(entries) {
    const pricedUnique = await Promise.all(entries.map((entry) => fetchCardFromScryfall(entry)));
    const pricedEntries = pricedUnique.map((priced, index) => {
      const rawQuantity = Number(entries[index]?.quantity);
      const quantity = Number.isFinite(rawQuantity) && rawQuantity >= 0 ? Math.floor(rawQuantity) : 1;
      const incomingAskingQuantity = Number(entries[index]?.askingQuantity);
      const askingQuantity =
        Number.isFinite(incomingAskingQuantity) && incomingAskingQuantity >= 0
          ? Math.max(0, Math.floor(incomingAskingQuantity))
          : quantity;
      const foil = Boolean(entries[index]?.foil);
      const nmUsdRegular = parseUsdPrice(priced.tcgLow);
      const nmUsdFoil = parseUsdPrice(priced.tcgLowFoil ?? null);
      const nmUsd = foil && nmUsdFoil !== null ? nmUsdFoil : nmUsdRegular;
      const nmPriceDisplay = nmUsd !== null ? `$${nmUsd.toFixed(2)}` : 'N/A';
      const condMult = getConditionMultiplier(entries[index]?.condition);
      const unitUsd = nmUsd !== null ? nmUsd * condMult : null;
      const tcgLow = unitUsd !== null ? `$${unitUsd.toFixed(2)}` : nmPriceDisplay;
      const scryfallId = priced.scryfallId ?? entries[index]?.scryfallId ?? null;
      const askingPriceCents = entries[index]?.askingPriceCents ?? null;
      const offerPriceCents = entries[index]?.offerPriceCents ?? null;
      const setCode = priced.setCode ?? entries[index]?.setCode ?? null;
      const setName = priced.setName ?? entries[index]?.setName ?? null;
      const collectorNumber = priced.collectorNumber ?? entries[index]?.collectorNumber ?? null;
      const imageSmall = priced.imageSmall ?? entries[index]?.imageSmall ?? null;
      const imageNormal = priced.imageNormal ?? entries[index]?.imageNormal ?? null;
      const imageSmallBack = priced.imageSmallBack ?? entries[index]?.imageSmallBack ?? null;
      const imageNormalBack = priced.imageNormalBack ?? entries[index]?.imageNormalBack ?? null;
      const marketStatus = normalizeMarketStatus(
        entries[index]?.marketStatus ??
          marketStatusFromLegacyRequesting(Boolean(entries[index]?.requesting))
      );
      const requesting = marketStatus === 'requesting';

      return {
        ...priced,
        id: entries[index]?.id ?? null, // DB row id — required for delete-by-id
        tcgLow,           // condition-adjusted price display (overrides NM from Scryfall)
        nmUsd,            // effective NM price (foil or regular), for live recalc on condition change
        nmUsdRegular,     // raw non-foil NM price, for switching between foil/regular
        nmUsdFoil,        // raw foil NM price (may be null), for switching between foil/regular
        nmPriceDisplay,   // formatted active NM price string, e.g. "$3.26", for reference display
        foil,
        quantity,
        requesting,
        marketStatus,
        askingQuantity,
        askingPriceCents,
        askingInput: formatCents(askingPriceCents),
        offerPriceCents,
        offerInput: formatCents(offerPriceCents),
        condition: entries[index]?.condition ?? null,
        unitUsd,
        lineTotalUsd: unitUsd !== null ? unitUsd * quantity : null,
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
  }

  async function loadAdminAccountsFromApi(authHeader) {
    const headers = {
      Authorization: authHeader
    };

    const [accountsResponse, resetEventsResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/api/admin/accounts`, { headers }),
      fetch(`${apiBaseUrl}/api/admin/password-reset-events`, { headers })
    ]);

    if (!accountsResponse.ok) {
      setAdminAccounts([]);
      setAdminAccountCount(null);
      setAdminPasswordResetEvents([]);
      return;
    }

    const accountsPayload = await accountsResponse.json();
    const accounts = Array.isArray(accountsPayload.accounts) ? accountsPayload.accounts : [];
    setAdminAccounts(accounts);
    setAdminAccountCount(accounts.length);

    if (!resetEventsResponse.ok) {
      setAdminPasswordResetEvents([]);
      return;
    }

    const resetEventsPayload = await resetEventsResponse.json();
    const events = Array.isArray(resetEventsPayload.events) ? resetEventsPayload.events : [];
    setAdminPasswordResetEvents(events);
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
            id: entry.id != null ? Number(entry.id) : null,
            cardName: String(entry.cardName || entry.card_name || '').trim(),
            quantity:
              Number.isFinite(Number(entry.quantity)) && Number(entry.quantity) >= 0
                ? Math.floor(Number(entry.quantity))
                : 1,
            marketStatus: normalizeMarketStatus(
              entry.marketStatus ?? marketStatusFromLegacyRequesting(Boolean(entry.requesting))
            ),
            requesting: normalizeMarketStatus(
              entry.marketStatus ?? marketStatusFromLegacyRequesting(Boolean(entry.requesting))
            ) === 'requesting',
            askingQuantity:
              entry.askingQuantity === null || entry.askingQuantity === undefined
                ? null
                : Number(entry.askingQuantity),
            askingPriceCents:
              entry.askingPriceCents === null || entry.askingPriceCents === undefined
                ? null
                : Number(entry.askingPriceCents),
            offerPriceCents:
              entry.offerPriceCents === null || entry.offerPriceCents === undefined
                ? null
                : Number(entry.offerPriceCents),
            condition: entry.condition || null,
            foil: Boolean(entry.foil),
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

  // ── Messaging helpers ────────────────────────────────────────────────────

  function buildThreads(msgList, myId) {
    const threadMap = new Map();
    for (const msg of msgList) {
      const isFromMe = Number(msg.senderId) === Number(myId);
      const otherUsername = isFromMe ? msg.recipientUsername : msg.senderUsername;
      const otherFullName = isFromMe ? msg.recipientFullName : msg.senderFullName;
      if (!threadMap.has(otherUsername)) {
        threadMap.set(otherUsername, {
          otherUsername,
          otherFullName,
          messages: [],
          unreadCount: 0
        });
      }
      const thread = threadMap.get(otherUsername);
      thread.messages.push(msg);
      if (!isFromMe && !msg.readAt) {
        thread.unreadCount += 1;
      }
    }
    const threads = Array.from(threadMap.values());
    threads.sort((a, b) => {
      const aTime = a.messages[a.messages.length - 1]?.createdAt || '';
      const bTime = b.messages[b.messages.length - 1]?.createdAt || '';
      return bTime > aTime ? 1 : bTime < aTime ? -1 : 0;
    });
    return threads;
  }

  function formatMessageDate(dateStr) {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
    } catch (_e) {
      return String(dateStr);
    }
  }

  async function loadMessagesFromApi(authHeader = loginAuthHeader) {
    if (!authHeader) return;
    setMessagesLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/messages`, {
        headers: { Authorization: authHeader }
      });
      if (!response.ok) {
        setMessages([]);
        return;
      }
      const payload = await response.json();
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
    } catch (_err) {
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }

  async function loadMatchesFromApi() {
    if (!loginAuthHeader) return;
    setMatchesLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/matches`, {
        headers: { Authorization: loginAuthHeader }
      });
      if (!response.ok) {
        setCardMatches([]);
        return;
      }
      const payload = await response.json();
      setCardMatches(Array.isArray(payload.matches) ? payload.matches : []);
    } catch (_err) {
      setCardMatches([]);
    } finally {
      setMatchesLoading(false);
    }
  }

  async function handleSendMessage(recipientOverride) {
    const to = (recipientOverride || composeRecipient).trim();
    const body = (recipientOverride ? replyBody : composeBody).trim();
    if (!to || !body) {
      setMessagesFeedback('Please fill in both recipient and message.');
      return;
    }
    setIsSendingMessage(true);
    setMessagesFeedback('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: loginAuthHeader
        },
        body: JSON.stringify({ to, body })
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessagesFeedback(payload.error || 'Failed to send message.');
        return;
      }
      if (recipientOverride) {
        setReplyBody('');
        setActiveConversationUsername(to);
      } else {
        setComposeBody('');
        setComposeRecipient('');
        setUserSearchResults([]);
        setActiveConversationUsername(to);
      }
      await loadMessagesFromApi(loginAuthHeader);
    } catch (_err) {
      setMessagesFeedback('Could not send message. Please try again.');
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function handleDeleteMessage(messageId) {
    try {
      await fetch(`${apiBaseUrl}/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: { Authorization: loginAuthHeader }
      });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (_err) {
      // ignore
    }
  }

  async function handleMarkThreadRead(thread) {
    const unread = thread.messages.filter((m) => !m.fromMe && !m.readAt);
    if (unread.length === 0) return;
    await Promise.all(
      unread.map((m) =>
        fetch(`${apiBaseUrl}/api/messages/${m.id}/read`, {
          method: 'PATCH',
          headers: { Authorization: loginAuthHeader }
        }).catch(() => null)
      )
    );
    setMessages((prev) =>
      prev.map((m) =>
        unread.some((u) => u.id === m.id) ? { ...m, readAt: new Date().toISOString() } : m
      )
    );
  }

  async function handleUserSearch(query) {
    const q = query.trim();
    if (q.length < 2) {
      setUserSearchResults([]);
      return;
    }
    setUserSearchLoading(true);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/users/search?q=${encodeURIComponent(q)}`,
        { headers: { Authorization: loginAuthHeader } }
      );
      if (response.ok) {
        const payload = await response.json();
        setUserSearchResults(Array.isArray(payload.users) ? payload.users : []);
      }
    } catch (_err) {
      // ignore
    } finally {
      setUserSearchLoading(false);
    }
  }

  // ── End messaging helpers ────────────────────────────────────────────────

  async function handleCardListUpload(event) {
    event.preventDefault();
    // Every upload action starts fresh so stale "Just Saved" rows do not linger.
    setShowingJustSavedCards(false);
    setDashboardMobileSelectedCardKey('');
    setUploadedCards([]);
    setCardCostTotal(0);
    const entries = parseCardEntries(cardInputText);

    if (entries.length === 0) {
      setCardUploadFeedback('Please add at least one card name.');
      return;
    }

    setIsCardPriceLoading(true);
    try {
      await priceCards(entries);
      setShowingJustSavedCards(false);
      setCardUploadFeedback(
        "Pricing loaded. Not saved yet — click 'Add to My Cards' to add these to your list."
      );
    } catch (_error) {
      setCardUploadFeedback('Could not save card list right now.');
    } finally {
      setIsCardPriceLoading(false);
    }
  }

  function handleQuantityChange(index, nextValue) {
    setUploadedCards((previous) => {
      const next = applyQuantityChange(previous, index, nextValue);
      setCardCostTotal(recomputeCostTotal(next));
      return next;
    });
  }

  function handleMarketStatusChange(index, nextStatus) {
    const normalized = normalizeMarketStatus(nextStatus);
    setUploadedCards((previous) =>
      previous.map((card, i) =>
        i === index
          ? {
              ...card,
              marketStatus: normalized,
              requesting: normalized === 'requesting'
            }
          : card
      )
    );
  }

  function handleRequestingAskingPriceChange(index, nextValue) {
    const askingPriceCents = parseDollarsToCents(nextValue);
    setUploadedCards((previous) =>
      previous.map((card, i) =>
        i === index
          ? {
              ...card,
              askingInput: nextValue,
              askingPriceCents
            }
          : card
      )
    );
  }

  function handleRequestingAskingPriceBlur(index) {
    setUploadedCards((previous) =>
      previous.map((card, i) => {
        if (i !== index) {
          return card;
        }
        return {
          ...card,
          askingInput: formatCents(card.askingPriceCents)
        };
      })
    );
  }

  function handleOfferPriceChange(index, nextValue) {
    const offerPriceCents = parseDollarsToCents(nextValue);
    setUploadedCards((previous) =>
      previous.map((card, i) =>
        i === index
          ? {
              ...card,
              offerInput: nextValue,
              offerPriceCents
            }
          : card
      )
    );
  }

  function handleOfferPriceBlur(index) {
    setUploadedCards((previous) =>
      previous.map((card, i) => {
        if (i !== index) {
          return card;
        }
        return {
          ...card,
          offerInput: formatCents(card.offerPriceCents)
        };
      })
    );
  }

  function handleConditionChange(index, nextValue) {
    setUploadedCards((previous) =>
      previous.map((card, i) => {
        if (i !== index) return card;
        const mult = getConditionMultiplier(nextValue);
        const nmUsd = card.nmUsd ?? null;
        const unitUsd = nmUsd !== null ? nmUsd * mult : null;
        const tcgLow = unitUsd !== null ? `$${unitUsd.toFixed(2)}` : (card.nmPriceDisplay || 'N/A');
        return {
          ...card,
          condition: nextValue || null,
          unitUsd,
          tcgLow,
          lineTotalUsd: unitUsd !== null ? unitUsd * card.quantity : null
        };
      })
    );
  }

  function handleFoilChange(index, isFoil) {
    setUploadedCards((previous) =>
      previous.map((card, i) => {
        if (i !== index) return card;
        const nmUsd = isFoil && card.nmUsdFoil !== null ? card.nmUsdFoil : card.nmUsdRegular;
        const nmPriceDisplay = nmUsd !== null ? `$${nmUsd.toFixed(2)}` : 'N/A';
        const mult = getConditionMultiplier(card.condition);
        const unitUsd = nmUsd !== null ? nmUsd * mult : null;
        const tcgLow = unitUsd !== null ? `$${unitUsd.toFixed(2)}` : nmPriceDisplay;
        return {
          ...card,
          foil: isFoil,
          nmUsd,
          nmPriceDisplay,
          unitUsd,
          tcgLow,
          lineTotalUsd: unitUsd !== null ? unitUsd * card.quantity : null
        };
      })
    );
  }

  function handleRequestingAskingQuantityChange(index, nextValue) {
    setUploadedCards((previous) => applyAskingQuantityChange(previous, index, nextValue));
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
        const nmUsdRegular = parseUsdPrice(refreshed.tcgLow);
        const nmUsdFoil = parseUsdPrice(refreshed.tcgLowFoil ?? null);
        const nmUsd = row.foil && nmUsdFoil !== null ? nmUsdFoil : nmUsdRegular;
        const nmPriceDisplay = nmUsd !== null ? `$${nmUsd.toFixed(2)}` : 'N/A';
        const mult = getConditionMultiplier(row.condition);
        const unitUsd = nmUsd !== null ? nmUsd * mult : null;
        const tcgLow = unitUsd !== null ? `$${unitUsd.toFixed(2)}` : nmPriceDisplay;
        const lineTotalUsd = unitUsd !== null ? unitUsd * row.quantity : null;
        return {
          ...row,
          ...refreshed,
          tcgLow,
          nmUsd,
          nmUsdRegular,
          nmUsdFoil,
          nmPriceDisplay,
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

  async function handleSaveList(options = {}) {
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

    const entries = buildCardEntriesForSave(uploadedCards);
    const skippedCount = uploadedCards.length - entries.length;

    if (entries.length === 0) {
      setCardUploadFeedback('No valid cards to save. Cards not found were skipped.');
      return;
    }

    const mode = String(options.mode || '').trim().toLowerCase() === 'add' ? 'add' : 'replace';
    setIsCardsSaving(true);
    try {
      const saveResponse = await fetch(`${apiBaseUrl}/api/cards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader
        },
        body: JSON.stringify({ cards: entries, mode })
      });

      const payload = await saveResponse.json();
      if (!saveResponse.ok) {
        setCardUploadFeedback(payload.error || 'Could not save your card list.');
        return;
      }

      setCardUploadFeedback(
        `${
          mode === 'add' ? 'Added' : 'Saved'
        } ${entries.length} unique card${entries.length === 1 ? '' : 's'} to My Cards.${
          skippedCount > 0 ? ` Skipped ${skippedCount} card${skippedCount === 1 ? '' : 's'} not found.` : ''
        }`
      );
      setCardInputText('');
      setUploadedCards([]);
      setCardCostTotal(0);
      setShowingJustSavedCards(false);
      if (route === 'my-cards') {
        await loadUserCardsFromApi(authHeader);
      }
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

  async function handleDeleteSavedCard(card) {
    if (!loggedInUser || loggedInUser.role !== 'user') {
      setCardUploadFeedback('Log in with a user account to delete saved cards.');
      return;
    }
    if (!loginAuthHeader) {
      setCardUploadFeedback('Please log in again.');
      return;
    }

    const cardName = String(card?.resolvedName || card?.inputName || '').trim();
    const cardId = card?.id;
    if (cardId == null) {
      setCardUploadFeedback('Cannot delete: card has no id. Try reloading your card list.');
      return;
    }
    const key = String(cardId);
    if (deletingCardKey === key) {
      return;
    }

    const ok = window.confirm(`Delete "${cardName}" from My Cards?`);
    if (!ok) {
      return;
    }

    setDeletingCardKey(key);
    try {
      const response = await fetch(`${apiBaseUrl}/api/cards`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: loginAuthHeader
        },
        body: JSON.stringify({ id: cardId })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCardUploadFeedback(payload.error || 'Could not delete saved card.');
        return;
      }

      setUploadedCards((previous) => {
        const next = previous.filter((entry) => entry.id !== cardId);
        setCardCostTotal(recomputeCostTotal(next));
        return next;
      });

      setCardUploadFeedback(`Deleted "${cardName}".`);
    } catch (_error) {
      setCardUploadFeedback('Could not delete saved card right now.');
    } finally {
      setDeletingCardKey(null);
    }
  }

  const headerLogin = (
    <div className="topbar-right">
      {loggedInUser ? (
        <p className="top-login-feedback">
          Signed in as {loggedInUser.username}
        </p>
      ) : (
        <>
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
          <a className="topbar-link" href="#/forgot-password">
            Forgot password?
          </a>
          {loginFeedback ? <p className="top-login-feedback">{loginFeedback}</p> : null}
        </>
      )}
      {loggedInUser ? (
        <button type="button" onClick={handleLogout}>
          Logoff
        </button>
      ) : null}
      {loggedInUser?.role === 'admin' && adminAccountCount !== null ? (
        <p className="top-login-feedback">
          Admin access: {adminAccountCount} accounts in database.
        </p>
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
      {loggedInUser ? (
        <a className="topbar-link topbar-link--with-badge" href="#/messages">
          Messages
          {(() => {
            const unread = messages.filter((m) => !m.fromMe && !m.readAt).length;
            return unread > 0 ? (
              <span className="topbar-unread-badge" aria-label={`${unread} unread`}>
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null;
          })()}
        </a>
      ) : null}
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

  const myCardsTableModel = useMemo(
    () => buildMyCardsTableModel(uploadedCards, cardSortMode),
    [uploadedCards, cardSortMode]
  );
  const dashboardSortedPairs = useMemo(
    () => sortCardsWithIndex(uploadedCards, cardSortMode),
    [uploadedCards, cardSortMode]
  );

  function renderMobileImageOnlyCards(pairs, selectedKey, setSelectedKey, detailLabel, detailValueFn) {
    return (
      <div className="mobile-image-only-grid" role="list">
        {pairs.map(({ card, index }) => {
          const mobileKey = `${card.scryfallId || card.resolvedName || card.inputName || 'card'}-${index}`;
          const isSelected = selectedKey === mobileKey;
          return (
            <div className="mobile-image-only-item" role="listitem" key={mobileKey}>
              <button
                type="button"
                className={`mobile-image-only-button ${isSelected ? 'selected' : ''}`}
                onClick={() => setSelectedKey(isSelected ? '' : mobileKey)}
                aria-label={`${card.resolvedName || card.inputName || 'Card'} TCGPlayer price`}
              >
                {card.imageSmall ? (
                  <img
                    className="mobile-image-only-thumb"
                    src={card.imageSmall}
                    alt={card.resolvedName || card.inputName || 'Card'}
                    loading="lazy"
                  />
                ) : (
                  <span className="mobile-image-only-empty">No Image</span>
                )}
              </button>
              {isSelected ? (
                <p className="mobile-image-only-price">
                  {detailLabel}: {detailValueFn(card)}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

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
                  <h2>Password Reset</h2>
                  <p>
                    Send a reset link to your account email if you want to reset your password via email.
                  </p>
                  <button
                    type="button"
                    onClick={handleSettingsPasswordResetRequest}
                    disabled={isSettingsResetSubmitting}
                  >
                    {isSettingsResetSubmitting ? 'Sending...' : 'Send Password Reset Email'}
                  </button>
                  {settingsResetFeedback ? <p>{settingsResetFeedback}</p> : null}
                </div>

                <div className="settings-panel">
                  <h2>Your City</h2>
                  <p className="notice subtle">Used to find nearby trade matches. Only your city is shared — no exact address.</p>

                  {preferredStore ? (
                    <div className="settings-city-current">
                      <span className="settings-city-name">📍 {preferredStore.name}</span>
                      <button
                        type="button"
                        className="action-button secondary"
                        onClick={() => savePreferredStore(null)}
                        disabled={isPreferredStoreSaving}
                      >
                        {isPreferredStoreSaving ? 'Clearing…' : 'Clear'}
                      </button>
                    </div>
                  ) : (
                    <p className="notice subtle">No city set yet.</p>
                  )}

                  <form className="join-form" onSubmit={handleCitySearch}>
                    <label htmlFor="city-search" className="sr-only">Search for a city</label>
                    <input
                      id="city-search"
                      type="text"
                      placeholder="e.g. Chicago, London, Tokyo…"
                      value={citySearchQuery}
                      onChange={(e) => setCitySearchQuery(e.target.value)}
                    />
                    <button type="submit" disabled={isCitySearching}>
                      {isCitySearching ? 'Searching…' : 'Search'}
                    </button>
                  </form>

                  {citySearchFeedback ? <p className="notice subtle">{citySearchFeedback}</p> : null}

                  {citySearchResults.length > 0 ? (
                    <div className="city-results">
                      {citySearchResults.map((city) => (
                        <div key={city.placeId} className="city-result">
                          <span className="city-result-name">{city.name}</span>
                          <button
                            type="button"
                            className={preferredStore?.name === city.name ? 'action-button secondary' : 'action-button primary'}
                            onClick={() => savePreferredStore(city)}
                            disabled={isPreferredStoreSaving}
                          >
                            {isPreferredStoreSaving
                              ? 'Saving…'
                              : preferredStore?.name === city.name
                                ? '✓ Selected'
                                : 'Select'}
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
    // ── Price Matches data ───────────────────────────────────────────────────
    const pmAllRows = uploadedCards.map((card) => {
      const market = card.unitUsd ?? null;
      const setPriceCents =
        card.marketStatus === 'offering'
          ? card.offerPriceCents
          : card.marketStatus === 'requesting'
          ? card.askingPriceCents
          : null;
      const setPrice = setPriceCents != null ? setPriceCents / 100 : null;
      const delta = market != null && setPrice != null ? setPrice - market : null;
      const pct = market != null && market > 0 && delta != null ? delta / market : null;
      return { card, market, setPrice, delta, pct };
    });

    pmAllRows.sort((a, b) => {
      const aPct = a.pct != null ? Math.abs(a.pct) : -Infinity;
      const bPct = b.pct != null ? Math.abs(b.pct) : -Infinity;
      if (bPct !== aPct) return bPct - aPct;
      return (b.market ?? 0) - (a.market ?? 0);
    });

    const pmRows =
      priceMatchFilter === 'all'
        ? pmAllRows
        : pmAllRows.filter((r) => r.card.marketStatus === priceMatchFilter);

    const totalMarket = uploadedCards.reduce((sum, c) => sum + (c.unitUsd ?? 0), 0);
    const flagged = pmAllRows.filter((r) => r.pct != null && Math.abs(r.pct) >= 0.15).length;

    const PM_FILTERS = [
      { key: 'all', label: 'All' },
      { key: 'have', label: 'Own' },
      { key: 'requesting', label: 'Want' },
      { key: 'offering', label: 'Offer' },
    ];

    return (
      <div className="page">
        <header className="topbar">
          {headerBrand}
          {headerLogin}
        </header>

        <main>
          {loggedInUser?.role === 'admin' ? (
            <section className="join">
              <p className="kicker">Dashboard</p>
              <h1>Admin</h1>
              <p>Account credentials and users.</p>
              <div className="card-upload-results">
                <h2>Account Credentials</h2>
                <table className="price-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Passkey</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminAccounts.map((account) => (
                      <tr key={account.id}>
                        <td>{account.id}</td>
                        <td>{account.username}</td>
                        <td>{account.email}</td>
                        <td>{account.passkey || '(unavailable)'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h2>Password Reset Activity</h2>
                <table className="price-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Event</th>
                      <th>User</th>
                      <th>Identifier</th>
                      <th>IP</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminPasswordResetEvents.length === 0 ? (
                      <tr>
                        <td colSpan={6}>No password reset attempts logged yet.</td>
                      </tr>
                    ) : (
                      adminPasswordResetEvents.map((event) => (
                        <tr key={event.id}>
                          <td>{new Date(event.createdAt).toLocaleString()}</td>
                          <td>{event.eventType}</td>
                          <td>{event.username || event.email || '-'}</td>
                          <td>{event.identifier || '-'}</td>
                          <td>{event.requestIp || '-'}</td>
                          <td>{event.detail || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <h2>Future Is Now material</h2>
                <p className="notice subtle">
                  This section is visible to admin users only.
                </p>
                <div className="dashboard-tool">
                  {futureIsNowMaterial.map((value, index) => (
                    <input
                      key={`future-is-now-${index + 1}`}
                      type="text"
                      placeholder={`Future Is Now material ${index + 1}`}
                      value={value}
                      onChange={(event) => {
                        const next = [...futureIsNowMaterial];
                        next[index] = event.target.value;
                        setFutureIsNowMaterial(next);
                      }}
                    />
                  ))}
                </div>
              </div>
            </section>
          ) : loggedInUser?.role === 'user' ? (
            <div className="pm-page">
              {/* ── Hero header ── */}
              <div className="pm-hero">
                <div className="pm-hero-title">
                  <p className="kicker">Dashboard</p>
                  <h1>Price Matches</h1>
                </div>
                {uploadedCards.length > 0 && !isCardPriceLoading ? (
                  <div className="pm-stats-strip">
                    <div className="pm-stat">
                      <span className="pm-stat-value">{uploadedCards.length}</span>
                      <span className="pm-stat-label">card{uploadedCards.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="pm-stat-divider" />
                    <div className="pm-stat">
                      <span className="pm-stat-value">${totalMarket.toFixed(2)}</span>
                      <span className="pm-stat-label">collection value</span>
                    </div>
                    {flagged > 0 ? (
                      <>
                        <div className="pm-stat-divider" />
                        <div className="pm-stat pm-stat--alert">
                          <span className="pm-stat-value">{flagged}</span>
                          <span className="pm-stat-label">need attention</span>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* ── City nudge ── */}
              {!preferredStore ? (
                <p className="notice subtle pm-city-nudge">
                  📍 <a href="#/settings">Set your city in Settings</a> to get nearby trade matches first.
                </p>
              ) : null}

              {/* ── Loading ── */}
              {isCardPriceLoading ? (
                <p className="notice subtle pm-loading">Loading card prices from Scryfall…</p>
              ) : uploadedCards.length === 0 ? (
                /* ── Empty state ── */
                <div className="pm-empty">
                  <p>You haven't added any cards yet.</p>
                  <a href="#/my-cards" className="action-button primary">Add Cards on My Cards →</a>
                </div>
              ) : (
                <>
                  {/* ── Filter tabs ── */}
                  <div className="pm-filters">
                    {PM_FILTERS.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        className={`pm-filter-btn${priceMatchFilter === f.key ? ' active' : ''}`}
                        onClick={() => setPriceMatchFilter(f.key)}
                      >
                        {f.label}
                        <span className="pm-filter-count">
                          {f.key === 'all'
                            ? pmAllRows.length
                            : pmAllRows.filter((r) => r.card.marketStatus === f.key).length}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* ── Price Matches table ── */}
                  <div className="pm-hint">
                    Your listed price vs. current Scryfall market ·{' '}
                    <span className="pm-hint--high">green</span> = priced above ·{' '}
                    <span className="pm-hint--low">red</span> = 15%+ below
                  </div>

                  {pmRows.length === 0 ? (
                    <p className="notice subtle">No cards in this category.</p>
                  ) : (
                    <table className="price-table pm-table">
                      <thead>
                        <tr>
                          <th className="pm-col-pic">Pic</th>
                          <th className="pm-col-card">Card</th>
                          <th className="pm-col-status">Status</th>
                          <th className="pm-col-market">Market</th>
                          <th className="pm-col-price">Your Price</th>
                          <th className="pm-col-delta">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pmRows.map(({ card, market, setPrice, pct }) => {
                          const marketDisplay = market != null ? `$${market.toFixed(2)}` : '—';
                          const setPriceDisplay = setPrice != null ? `$${setPrice.toFixed(2)}` : null;
                          const pctDisplay =
                            pct != null
                              ? `${pct >= 0 ? '+' : ''}${(pct * 100).toFixed(0)}%`
                              : '—';
                          const rowClass =
                            pct != null && pct <= -0.15
                              ? 'patch-row--low'
                              : pct != null && pct >= 0.15
                              ? 'patch-row--high'
                              : '';
                          const deltaClass =
                            pct == null
                              ? 'patch-delta--neutral'
                              : pct <= -0.15
                              ? 'patch-delta--low'
                              : pct >= 0.15
                              ? 'patch-delta--high'
                              : 'patch-delta--ok';
                          const statusLabel =
                            card.marketStatus === 'offering'
                              ? 'Offer'
                              : card.marketStatus === 'requesting'
                              ? 'Want'
                              : 'Own';
                          const statusMod =
                            card.marketStatus === 'offering'
                              ? 'offer'
                              : card.marketStatus === 'requesting'
                              ? 'want'
                              : 'have';
                          return (
                            <tr key={card.id ?? card.resolvedName ?? card.inputName} className={rowClass}>
                              <td className="pm-col-pic">
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
                                  </div>
                                ) : (
                                  <div className="pm-no-thumb" />
                                )}
                              </td>
                              <td className="patch-card-name">
                                <span className="pm-card-name-text">{card.resolvedName || card.inputName}</span>
                                {card.foil ? <span className="foil-label"> ✦</span> : null}
                                {card.condition ? (
                                  <span className="patch-condition"> {card.condition.toUpperCase()}</span>
                                ) : null}
                              </td>
                              <td>
                                <span className={`pm-status-pill pm-status-pill--${statusMod}`}>
                                  {statusLabel}
                                </span>
                              </td>
                              <td className="patch-market">{marketDisplay}</td>
                              <td className="patch-set-price">
                                {setPriceDisplay ?? <span className="patch-no-price">—</span>}
                              </td>
                              <td className={`patch-delta ${deltaClass}`}>{pctDisplay}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  <p className="price-matches-footer">
                    <a href="#/my-cards">Update prices on My Cards →</a>
                  </p>
                </>
              )}
            </div>
          ) : (
            <section className="join">
              <p className="kicker">Dashboard</p>
              <h1>Price Matches</h1>
              <p>
                <a href="#/login">Log in</a> to see your card price matches.
              </p>
            </section>
          )}
        </main>
        {loginServiceIndicator}
      </div>
    );
  }

  if (route === 'my-cards') {
    const {
      savedPairs,
      requestingPairs,
      offeringPairs,
      savedTotal,
      requestingTotal,
      offeringTotal,
      requestingTotalValue,
      offeringTotalValue,
      savedQtyTotal,
      requestingQtyTotal,
      offeringQtyTotal,
      haveQtyTotal
    } = myCardsTableModel;

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
                {/* ── Add Cards collapsible panel ── */}
                <div className="add-cards-panel">
                  <button
                    type="button"
                    className="add-cards-toggle"
                    onClick={() => setShowAddForm((v) => !v)}
                  >
                    {showAddForm ? '✕ Cancel' : '+ Add Cards'}
                  </button>
                  {showAddForm && (
                    <form className="dashboard-tool add-cards-form" onSubmit={(e) => {
                      handleCardListUpload(e);
                    }}>
                      <label htmlFor="card-list-input" className="add-cards-label">
                        Paste card names, one per line. Include set + number for a specific version, e.g. <code>Lightning Bolt (M10) 15</code>
                      </label>
                      <textarea
                        id="card-list-input"
                        placeholder="Black Lotus&#10;Lightning Bolt&#10;Sol Ring (5ED) 307"
                        value={cardInputText}
                        onChange={(event) => {
                          setCardInputText(event.target.value);
                          setShowingJustSavedCards(false);
                        }}
                        rows={6}
                      />
                      <button type="submit" className="action-button primary" disabled={isCardPriceLoading}>
                        {isCardPriceLoading ? 'Looking up prices…' : 'Preview Cards'}
                      </button>
                      {cardUploadFeedback ? <p className="notice">{cardUploadFeedback}</p> : null}
                      {isCardPriceLoading ? <p className="notice subtle">Loading prices from Scryfall…</p> : null}
                    </form>
                  )}
                </div>

                {/* ── Preview of pasted cards before saving ── */}
                {cardInputText && uploadedCards.length > 0 ? (
                  <div className="card-upload-results">
                    <div className="section-header-row">
                      <h2>Preview — {uploadedCards.length} {uploadedCards.length === 1 ? 'card' : 'cards'}</h2>
                      <button
                        type="button"
                        className="action-button primary"
                        onClick={() => {
                          handleSaveList({ mode: 'add' });
                          setShowAddForm(false);
                          setCardInputText('');
                        }}
                        disabled={isCardPriceLoading || isCardsSaving}
                      >
                        {isCardsSaving ? 'Saving…' : 'Add to My Cards'}
                      </button>
                    </div>
                    {renderMobileImageOnlyCards(
                      dashboardSortedPairs,
                      dashboardMobileSelectedCardKey,
                      setDashboardMobileSelectedCardKey,
                      'TCGPlayer Low',
                      (card) => card.tcgLow || 'N/A'
                    )}
                    <table className="price-table my-cards-saved-table desktop-table-only">
                      <thead>
                        <tr>
                          <th>Pic</th>
                          <th className="mobile-hide-saved">Card</th>
                          <th className="mobile-hide-saved">Version</th>
                          <th>TCGPlayer Low</th>
                          <th>Condition</th>
                          <th>Foil</th>
                          <th>Status</th>
                          <th className="mobile-hide-saved">Links</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboardSortedPairs.map(({ card, index }) => (
                          <tr key={`${card.scryfallId || card.inputName || card.resolvedName}-${index}`}>
                            <td>
                              {card.imageSmall ? (
                                <div className="thumb-wrap">
                                  <img className="card-thumb" src={card.imageSmall} alt={card.resolvedName} loading="lazy" />
                                  {card.imageNormal || card.imageSmall ? (
                                    <img className="card-thumb-preview front" src={card.imageNormal || card.imageSmall} alt="" loading="lazy" />
                                  ) : null}
                                  {card.imageNormalBack || card.imageSmallBack ? (
                                    <img className="card-thumb-preview back" src={card.imageNormalBack || card.imageSmallBack} alt="" loading="lazy" />
                                  ) : null}
                                </div>
                              ) : null}
                            </td>
                            <td className="mobile-hide-saved">{card.resolvedName}</td>
                            <td className="mobile-hide-saved">
                              <button type="button" className="version-button" onClick={() => loadVersionOptionsFor(card.scryfallId || card.resolvedName || card.inputName, card.resolvedName || card.inputName)}>
                                {card.setCode && card.collectorNumber ? `${card.setCode.toUpperCase()} #${card.collectorNumber}` : 'Choose'}
                              </button>
                              {versionLoadingKey === (card.scryfallId || card.resolvedName || card.inputName) ? <div className="version-picker">Loading...</div> : null}
                              {versionOptionsByKey[card.scryfallId || card.resolvedName || card.inputName]?.length ? (
                                <div className="version-picker">
                                  <select value={card.scryfallId || ''} onChange={(event) => handleVersionChange(index, event.target.value)}>
                                    {versionOptionsByKey[card.scryfallId || card.resolvedName || card.inputName].map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {option.set.toUpperCase()} #{option.collectorNumber} · {option.setName} · {option.releasedAt}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : null}
                            </td>
                            <td>
                              {card.tcgLow}
                              {card.condition && card.condition !== 'nm' && card.nmPriceDisplay && card.nmPriceDisplay !== 'N/A' ? (
                                <div className="nm-price-ref" title="Near Mint reference price">NM {card.nmPriceDisplay}</div>
                              ) : null}
                            </td>
                            <td>
                              <select
                                className="condition-select"
                                value={card.condition || ''}
                                onChange={(e) => handleConditionChange(index, e.target.value || null)}
                                aria-label={`Condition for ${card.resolvedName || card.inputName}`}
                              >
                                <option value="">— (NM)</option>
                                <option value="nm">NM</option>
                                <option value="lp">LP</option>
                                <option value="mp">MP</option>
                                <option value="hp">HP</option>
                                <option value="dmg">DMG</option>
                              </select>
                            </td>
                            <td className="foil-cell">
                              <label className="foil-label" title={card.nmUsdFoil !== null ? `Foil price: $${card.nmUsdFoil?.toFixed(2)}` : 'No foil price available'}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(card.foil)}
                                  onChange={(e) => handleFoilChange(index, e.target.checked)}
                                  aria-label={`Foil for ${card.resolvedName || card.inputName}`}
                                />
                                {card.nmUsdFoil === null ? <span className="foil-unavailable" title="No foil price on Scryfall">✦</span> : null}
                              </label>
                            </td>
                            <td className="requesting-cell">
                              <StatusToggle
                                value={card.marketStatus || 'have'}
                                onChange={(v) => handleMarketStatusChange(index, v)}
                                ariaLabel={`Status for ${card.resolvedName || card.inputName}`}
                              />
                            </td>
                            <td>{card.tcgUrl ? <a href={card.tcgUrl} target="_blank" rel="noreferrer">TCGPlayer</a> : card.error ? card.error : 'No link'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th colSpan={4}>Total</th>
                          <th>${cardCostTotal.toFixed(2)}</th>
                          <th /><th /><th />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : null}

                {/* ── My Cards section — hidden while add-form is open so preview doesn't pollute it ── */}
                {!showAddForm && uploadedCards.length > 0 ? (
                  <div className="card-upload-results">
                    <div className="section-header-row">
                      <div>
                        <h2>My Cards</h2>
                        <div className="stats-chips">
                          <span className="stat-chip">{haveQtyTotal} owned</span>
                          <span className="stat-chip stat-chip--want">{requestingQtyTotal} wanted</span>
                          <span className="stat-chip stat-chip--offer">{offeringQtyTotal} offering</span>
                        </div>
                      </div>
                      <div className="section-actions">
                        <label className="sort-control">
                          <span className="sort-label sr-only">Sort by</span>
                          <select
                            className="sort-select"
                            value={cardSortMode}
                            onChange={(event) => setCardSortMode(event.target.value)}
                          >
                            <option value="upload">Current order</option>
                            <option value="alpha">Name (A-Z)</option>
                            <option value="tcgLowDesc">TCG low (High-Low)</option>
                            <option value="tcgLowAsc">TCG low (Low-High)</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className="action-button secondary"
                          onClick={() => loadUserCardsFromApi(loginAuthHeader)}
                          disabled={isCardPriceLoading || isCardsSaving}
                          title="Reload from server"
                        >
                          ↺ Refresh
                        </button>
                        <button
                          type="button"
                          className="action-button primary"
                          onClick={() => handleSaveList({ mode: 'replace' })}
                          disabled={isCardPriceLoading || isCardsSaving || uploadedCards.length === 0}
                        >
                          {isCardsSaving ? 'Saving…' : 'Save Changes'}
                        </button>
                      </div>
                    </div>

                    {/* Mobile card list — shows names + prices */}
                    <div className="mobile-card-list desktop-hide">
                      {savedPairs.map(({ card, index }) => {
                        const cardKey = String(card.scryfallId || card.resolvedName || card.inputName || index);
                        return (
                          <div className="mobile-card-row" key={`${cardKey}-${index}`}>
                            {card.imageSmall ? (
                              <img className="mobile-card-thumb" src={card.imageSmall} alt={card.resolvedName || card.inputName} loading="lazy" />
                            ) : (
                              <div className="mobile-card-thumb mobile-card-thumb--empty" />
                            )}
                            <div className="mobile-card-info">
                              <span className="mobile-card-name">{card.resolvedName || card.inputName}</span>
                              <span className="mobile-card-meta">
                                {card.tcgLow ? (
                                  <span>
                                    TCG {card.tcgLow}
                                    {card.condition && card.condition !== 'nm' && card.nmPriceDisplay && card.nmPriceDisplay !== 'N/A' ? (
                                      <span className="nm-price-ref-inline"> (NM {card.nmPriceDisplay})</span>
                                    ) : null}
                                  </span>
                                ) : null}
                                {card.condition ? <span className="mobile-price-tag mobile-price-tag--condition">{card.condition.toUpperCase()}</span> : null}
                                {card.foil ? <span className="mobile-price-tag mobile-price-tag--foil">Foil</span> : null}
                                {card.askingPriceCents != null ? <span className="mobile-price-tag mobile-price-tag--ask">Ask ${formatCents(card.askingPriceCents)}</span> : null}
                                {card.offerPriceCents != null ? <span className="mobile-price-tag mobile-price-tag--offer">Offer ${formatCents(card.offerPriceCents)}</span> : null}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {savedPairs.length === 0 ? (
                      <p className="notice subtle">No saved cards yet.</p>
                    ) : (
                      <table className="price-table my-cards-unified-table desktop-table-only">
                        <thead>
                          <tr>
                            <th>Pic</th>
                            <th>Card</th>
                            <th>TCG Price</th>
                            <th>Status</th>
                            <th>Condition</th>
                            <th>Foil</th>
                            <th>Ask Price</th>
                            <th>Offer Price</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {savedPairs.map(({ card, index }) => {
                            const cardKey = String(card.id != null ? card.id : (
                              card.scryfallId ||
                                String(card.resolvedName || card.inputName || '').trim()
                            ));
                            return (
                              <tr key={`${cardKey}-${index}`}>
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
                                <td className="card-name-cell">{card.resolvedName || card.inputName}</td>
                                <td className="tcg-price-cell">
                                  {card.tcgUrl ? (
                                    <a href={card.tcgUrl} target="_blank" rel="noreferrer" className="tcg-price-link">
                                      {card.tcgLow || 'N/A'}
                                    </a>
                                  ) : (
                                    card.tcgLow || 'N/A'
                                  )}
                                  {card.condition && card.condition !== 'nm' && card.nmPriceDisplay && card.nmPriceDisplay !== 'N/A' ? (
                                    <div className="nm-price-ref" title="Near Mint reference price">NM {card.nmPriceDisplay}</div>
                                  ) : null}
                                </td>
                                <td>
                                  <StatusToggle
                                    value={card.marketStatus || 'have'}
                                    onChange={(v) => handleMarketStatusChange(index, v)}
                                    ariaLabel={`Status for ${card.resolvedName || card.inputName}`}
                                  />
                                </td>
                                <td>
                                  <select
                                    className="condition-select"
                                    value={card.condition || ''}
                                    onChange={(e) => handleConditionChange(index, e.target.value)}
                                    aria-label={`Condition for ${card.resolvedName || card.inputName}`}
                                  >
                                    <option value="">—</option>
                                    <option value="nm">NM</option>
                                    <option value="lp">LP</option>
                                    <option value="mp">MP</option>
                                    <option value="hp">HP</option>
                                    <option value="dmg">DMG</option>
                                  </select>
                                </td>
                                <td className="foil-cell">
                                  <label className="foil-label" title={card.nmUsdFoil !== null ? `Foil price: $${card.nmUsdFoil?.toFixed(2)}` : 'No foil price available'}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(card.foil)}
                                      onChange={(e) => handleFoilChange(index, e.target.checked)}
                                      aria-label={`Foil for ${card.resolvedName || card.inputName}`}
                                    />
                                    {card.nmUsdFoil === null ? <span className="foil-unavailable" title="No foil price on Scryfall">✦</span> : null}
                                  </label>
                                </td>
                                <td>
                                  <input
                                    className="ask-input"
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    value={card.askingInput ?? formatCents(card.askingPriceCents)}
                                    onChange={(e) =>
                                      handleRequestingAskingPriceChange(index, e.target.value)
                                    }
                                    onBlur={() => handleRequestingAskingPriceBlur(index)}
                                  />
                                </td>
                                <td>
                                  <input
                                    className="ask-input"
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    value={card.offerInput ?? formatCents(card.offerPriceCents)}
                                    onChange={(e) =>
                                      handleOfferPriceChange(index, e.target.value)
                                    }
                                    onBlur={() => handleOfferPriceBlur(index)}
                                  />
                                </td>
                                <td>
                                  <div className="row-actions">
                                    {card.tcgUrl ? (
                                      <a href={card.tcgUrl} target="_blank" rel="noreferrer">
                                        TCGPlayer
                                      </a>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="row-button danger"
                                      onClick={() => handleDeleteSavedCard(card)}
                                      disabled={
                                        isCardPriceLoading ||
                                        isCardsSaving ||
                                        deletingCardKey === cardKey
                                      }
                                    >
                                      {deletingCardKey === cardKey ? 'Deleting…' : 'Delete'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : (
                  !showAddForm ? <p>No saved cards yet.</p> : null
                )}

                {/* ── Potential Matches ── */}
                <div className="card-upload-results matches-section">
                  <h2>Potential Matches</h2>
                  <p className="notice subtle">
                    Users whose Ask or Offer price overlaps yours within 20% on the same card.{' '}
                    {preferredStore
                      ? '📍 Matches within 50 miles of your store appear first.'
                      : <><a href="#/settings">Set a preferred store</a> to see distances and get nearby matches first.</>}
                  </p>
                  {matchesLoading ? (
                    <p className="notice subtle">Finding matches…</p>
                  ) : cardMatches.length === 0 ? (
                    <p className="notice subtle">
                      No matches yet — set an Ask Price (to sell) or Offer Price (to buy) on your cards to find trade partners.
                    </p>
                  ) : (
                    <>
                      {/* Mobile match list */}
                      <div className="desktop-hide mobile-match-list">
                        {cardMatches.map((match, i) => (
                          <div className={`mobile-match-row${match.nearStore ? ' mobile-match-row--near' : ''}`} key={`${match.username}-${match.cardName}-${i}`}>
                            <div className="mobile-match-info">
                              <span className="mobile-match-card">{match.cardName}</span>
                              <span className="mobile-match-meta">
                                @{match.username} · {match.myRole === 'buyer' ? 'You buying' : 'You selling'} ·{' '}
                                {match.myPriceCents != null ? `Your $${formatCents(match.myPriceCents)}` : ''}{' '}
                                {match.theirPriceCents != null ? `/ Their $${formatCents(match.theirPriceCents)}` : ''}
                              </span>
                              <span className="mobile-match-distance">
                                {match.distanceMiles != null ? (
                                  match.nearStore
                                    ? <span className="near-store-badge">📍 {match.distanceMiles} mi away</span>
                                    : <span className="far-store-label">📍 {match.distanceMiles} mi away</span>
                                ) : preferredStore ? (
                                  <span className="far-store-label">Distance unknown</span>
                                ) : null}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="action-button primary"
                              onClick={() => {
                                setComposeRecipient(match.username);
                                window.location.hash = '#/messages';
                              }}
                            >
                              Message
                            </button>
                          </div>
                        ))}
                      </div>
                      {/* Desktop match table */}
                      <table className="price-table matches-table desktop-table-only">
                        <thead>
                          <tr>
                            <th>Card</th>
                            <th>User</th>
                            <th>My Role</th>
                            <th>My Price</th>
                            <th>Their Price</th>
                            <th>Distance</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cardMatches.map((match, i) => (
                            <tr key={`${match.username}-${match.cardName}-${i}`} className={match.nearStore ? 'match-row--near' : ''}>
                              <td>{match.cardName}</td>
                              <td>@{match.username}</td>
                              <td>{match.myRole === 'buyer' ? 'Buying' : 'Selling'}</td>
                              <td>
                                {match.myPriceCents != null
                                  ? `$${formatCents(match.myPriceCents)}`
                                  : '—'}
                              </td>
                              <td>
                                {match.theirPriceCents != null
                                  ? `$${formatCents(match.theirPriceCents)}`
                                  : '—'}
                              </td>
                              <td className="match-distance-cell">
                                {match.distanceMiles != null ? (
                                  match.nearStore ? (
                                    <span className="near-store-badge">📍 {match.distanceMiles} mi</span>
                                  ) : (
                                    <span className="far-store-label">📍 {match.distanceMiles} mi</span>
                                  )
                                ) : preferredStore ? (
                                  <span className="far-store-label" title="This user hasn't set a store location yet">—</span>
                                ) : (
                                  <span className="no-store-hint" title="Set a preferred store in Settings to see distances">
                                    <a href="#/settings">Set store</a>
                                  </span>
                                )}
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="action-button primary"
                                  onClick={() => {
                                    setComposeRecipient(match.username);
                                    window.location.hash = '#/messages';
                                  }}
                                >
                                  Message
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </main>
        {loginServiceIndicator}
      </div>
    );
  }

  if (route === 'messages') {
    const myId = loggedInUser?.id;
    const threads = myId ? buildThreads(messages, myId) : [];
    const activeThread = threads.find((t) => t.otherUsername === activeConversationUsername) || null;
    const inboxCount = messages.filter((m) => !m.fromMe).length;
    const inboxLimit = 25;

    return (
      <div className="page">
        <header className="topbar">
          {headerBrand}
          {headerLogin}
        </header>
        <main>
          <section className="messages-section">
            <h1>Messages</h1>
            {!loggedInUser ? (
              <p>Please <a href="#/dashboard">log in</a> to use messages.</p>
            ) : (
              <div className="messages-layout">
                {/* Sidebar: compose + thread list */}
                <aside className="messages-sidebar">
                  <div className="compose-panel">
                    <h2 className="panel-heading">New Message</h2>
                    <div className="compose-recipient-wrap">
                      <input
                        className="compose-input"
                        type="text"
                        placeholder="Username or email"
                        value={composeRecipient}
                        onChange={(e) => {
                          setComposeRecipient(e.target.value);
                          handleUserSearch(e.target.value);
                        }}
                        autoComplete="off"
                      />
                      {userSearchResults.length > 0 && (
                        <ul className="user-search-dropdown">
                          {userSearchResults.map((u) => (
                            <li key={u.username}>
                              <button
                                type="button"
                                onClick={() => {
                                  setComposeRecipient(u.username);
                                  setUserSearchResults([]);
                                }}
                              >
                                <strong>{u.username}</strong>
                                {''}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <textarea
                      className="compose-textarea"
                      placeholder="Write your message…"
                      value={composeBody}
                      maxLength={1000}
                      onChange={(e) => setComposeBody(e.target.value)}
                    />
                    <div className="compose-actions">
                      <button
                        type="button"
                        className="action-button primary"
                        onClick={() => handleSendMessage(null)}
                        disabled={isSendingMessage || !composeRecipient.trim() || !composeBody.trim()}
                      >
                        {isSendingMessage ? 'Sending…' : 'Send'}
                      </button>
                      <span className="char-count">{composeBody.length}/1000</span>
                    </div>
                    {messagesFeedback ? (
                      <p className="messages-feedback">{messagesFeedback}</p>
                    ) : null}
                  </div>

                  <div className="inbox-status">
                    <span>Inbox: {inboxCount}/{inboxLimit}</span>
                  </div>

                  <div className="thread-list">
                    <h2 className="panel-heading">Conversations</h2>
                    {messagesLoading && <p className="subtle">Loading…</p>}
                    {!messagesLoading && threads.length === 0 && (
                      <p className="subtle">No conversations yet.</p>
                    )}
                    {threads.map((thread) => {
                      const lastMsg = thread.messages[thread.messages.length - 1];
                      const isActive = activeConversationUsername === thread.otherUsername;
                      return (
                        <button
                          key={thread.otherUsername}
                          type="button"
                          className={`thread-item${isActive ? ' thread-item--active' : ''}`}
                          onClick={() => {
                            setActiveConversationUsername(thread.otherUsername);
                            setReplyBody('');
                            setMessagesFeedback('');
                            handleMarkThreadRead(thread);
                          }}
                        >
                          <div className="thread-item-top">
                            <span className="thread-name">
                              {thread.otherUsername}
                            </span>
                            {thread.unreadCount > 0 && (
                              <span className="unread-badge">{thread.unreadCount}</span>
                            )}
                          </div>
                          <div className="thread-preview">
                            {lastMsg
                              ? `${lastMsg.fromMe ? 'You: ' : ''}${lastMsg.body.slice(0, 60)}${lastMsg.body.length > 60 ? '…' : ''}`
                              : ''}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                {/* Thread pane */}
                <div className="messages-thread-pane">
                  {activeThread ? (
                    <>
                      <div className="thread-header">
                        <strong>@{activeThread.otherUsername}</strong>
                      </div>
                      <div className="thread-messages">
                        {activeThread.messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`message-bubble${msg.fromMe ? ' message-bubble--me' : ' message-bubble--them'}`}
                          >
                            <div className="message-body">{msg.body}</div>
                            <div className="message-meta">
                              {formatMessageDate(msg.createdAt)}
                              {!msg.fromMe && msg.readAt ? ' · Read' : ''}
                            </div>
                            <button
                              type="button"
                              className="message-delete-btn"
                              title="Delete message"
                              onClick={() => handleDeleteMessage(msg.id)}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="thread-reply-area">
                        <textarea
                          className="compose-textarea"
                          placeholder={`Reply to @${activeThread.otherUsername}…`}
                          value={replyBody}
                          maxLength={1000}
                          onChange={(e) => setReplyBody(e.target.value)}
                        />
                        <div className="compose-actions">
                          <button
                            type="button"
                            className="action-button primary"
                            onClick={() => handleSendMessage(activeThread.otherUsername)}
                            disabled={isSendingMessage || !replyBody.trim()}
                          >
                            {isSendingMessage ? 'Sending…' : 'Reply'}
                          </button>
                          <span className="char-count">{replyBody.length}/1000</span>
                        </div>
                        {messagesFeedback ? (
                          <p className="messages-feedback">{messagesFeedback}</p>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div className="thread-empty">
                      <p>Select a conversation or send a new message.</p>
                    </div>
                  )}
                </div>
              </div>
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
                onChange={(event) => setAccountUsername(event.target.value)}
                required
                minLength={3}
                maxLength={24}
                pattern="[A-Za-z0-9_]+"
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
              <div className="create-password-row">
                <input
                  id="create-password"
                  type="password"
                  placeholder="Create password"
                  value={accountPassword}
                  onChange={(event) => setAccountPassword(event.target.value)}
                  required
                  minLength={6}
                />
                <label htmlFor="create-password-confirm" className="sr-only">
                  Confirm Password
                </label>
                <input
                  id="create-password-confirm"
                  type="password"
                  placeholder="Confirm password"
                  value={accountPasswordConfirm}
                  onChange={(event) => setAccountPasswordConfirm(event.target.value)}
                  required
                  minLength={6}
                />
              </div>
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

  if (route === 'forgot-password') {
    return (
      <div className="page">
        <header className="topbar">
          {headerBrand}
          {headerLogin}
        </header>

        <main>
          <section className="join">
            <p className="kicker">Account Recovery</p>
            <h1>Forgot password</h1>
            <p>Enter your username or email to receive a reset link.</p>
            <form className="join-form" onSubmit={handleForgotPasswordRequest}>
              <input
                id="forgot-identifier"
                type="text"
                placeholder="username or email"
                value={forgotIdentifier}
                onChange={(event) => setForgotIdentifier(event.target.value)}
                required
              />
              <button type="submit" disabled={isForgotSubmitting}>
                {isForgotSubmitting ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
            {forgotFeedback ? <p>{forgotFeedback}</p> : null}
          </section>
        </main>
        {loginServiceIndicator}
      </div>
    );
  }

  if (route === 'reset-password') {
    return (
      <div className="page">
        <header className="topbar">
          {headerBrand}
          {headerLogin}
        </header>

        <main>
          <section className="join">
            <p className="kicker">Account Recovery</p>
            <h1>Reset password</h1>
            <p>Enter the reset token and your new password.</p>
            <form className="join-form" onSubmit={handleResetPasswordConfirm}>
              <input
                id="reset-token"
                type="text"
                placeholder="Reset token"
                value={resetTokenInput}
                onChange={(event) => setResetTokenInput(event.target.value)}
                required
              />
              <div className="create-password-row">
                <input
                  id="reset-password"
                  type="password"
                  placeholder="New password"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  required
                  minLength={6}
                />
                <input
                  id="reset-password-confirm"
                  type="password"
                  placeholder="Confirm new password"
                  value={resetPasswordConfirm}
                  onChange={(event) => setResetPasswordConfirm(event.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <button type="submit" disabled={isResetSubmitting}>
                {isResetSubmitting ? 'Updating...' : 'Reset Password'}
              </button>
            </form>
            {resetFeedback ? <p>{resetFeedback}</p> : null}
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

        {/* ── Best Offers ── */}
        {(greatOffersLoading || greatOffers.length > 0) ? (
          <section className="great-offers-section">
            <div className="great-offers-header">
              <h2>Best Offers</h2>
              <span className="great-offers-subtitle">
                {preferredStore
                  ? <>Near <strong>{preferredStore.name}</strong> · offers 15%+ below market or wants 15%+ above</>
                  : 'Offers 15%+ below market · Wants 15%+ above market'}
              </span>
            </div>
            {!preferredStore && !greatOffersLoading ? (
              <p className="notice subtle great-offers-location-hint">
                📍 <a href="#/settings">Set your city in Settings</a> to see nearby offers first.
              </p>
            ) : null}
            {greatOffersLoading ? (
              <p className="notice subtle">Loading…</p>
            ) : (
              <div className="great-offers-grid">
                {greatOffers.map((offer) => {
                  const isOffer = offer.dealType === 'offer';
                  const priceDollars = (offer.priceCents / 100).toFixed(2);
                  const marketDollars = (offer.marketPriceCents / 100).toFixed(2);
                  const userLink = loggedInUser
                    ? `#/messages?compose=${offer.username}`
                    : '#/login';
                  const isNear = offer.distanceMiles != null && offer.distanceMiles <= 50;
                  return (
                    <div
                      key={`${offer.dealType}-${offer.id}`}
                      className={`great-offer-card great-offer-card--${offer.dealType}${isNear ? ' great-offer-card--near' : ''}`}
                    >
                      <div className="great-offer-img-wrap">
                        {offer.imageSmall ? (
                          <img
                            className="great-offer-img"
                            src={offer.imageSmall}
                            alt={offer.cardName}
                            loading="lazy"
                          />
                        ) : (
                          <div className="great-offer-img-placeholder" />
                        )}
                        <span className={`great-offer-badge great-offer-badge--${offer.dealType}`}>
                          {isOffer ? `−${offer.pct}%` : `+${offer.pct}%`}
                        </span>
                      </div>
                      <div className="great-offer-info">
                        <p className="great-offer-name">
                          {offer.cardName}
                          {offer.foil ? <span className="foil-label"> ✦</span> : null}
                          {offer.condition ? (
                            <span className="patch-condition"> {offer.condition.toUpperCase()}</span>
                          ) : null}
                        </p>
                        <p className="great-offer-prices">
                          <span className={`great-offer-price great-offer-price--${offer.dealType}`}>
                            ${priceDollars}
                          </span>
                          <span className="great-offer-market">mkt ${marketDollars}</span>
                        </p>
                        <p className="great-offer-meta">
                          <span className="great-offer-label">
                            {isOffer ? 'Offering' : 'Wants to pay'}
                          </span>
                          {offer.distanceMiles != null ? (
                            <span className={`great-offer-dist${isNear ? ' great-offer-dist--near' : ''}`}>
                              📍 {offer.distanceMiles} mi
                            </span>
                          ) : null}
                        </p>
                        <p className="great-offer-seller">
                          <a href={userLink} className="great-offer-user">
                            {offer.username}
                          </a>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

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
