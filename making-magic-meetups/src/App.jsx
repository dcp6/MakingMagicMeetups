import React from 'react';
import { useEffect, useState } from 'react';

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? '' : 'https://makingmagicmeetups-api.onrender.com');
const sessionStorageKey = 'making_magic_meetups_session_v1';

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
  const [cardUploadFeedback, setCardUploadFeedback] = useState('');
  const [isCardPriceLoading, setIsCardPriceLoading] = useState(false);

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
      setRoute('home');
    }

    syncRouteFromHash();
    window.addEventListener('hashchange', syncRouteFromHash);

    return () => {
      window.removeEventListener('hashchange', syncRouteFromHash);
    };
  }, []);

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
      const loginResponse = await fetch(`${apiBaseUrl}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          identifier: trimmedIdentifier,
          password: submittedPassword
        })
      });

      const loginPayload = await loginResponse.json();
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

  async function fetchCardPriceFromScryfall(cardName) {
    const encoded = encodeURIComponent(cardName);
    const endpoints = [
      `https://api.scryfall.com/cards/named?exact=${encoded}`,
      `https://api.scryfall.com/cards/named?fuzzy=${encoded}`
    ];

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
            error: 'Lookup failed'
          };
        }

        const data = await response.json();
        return {
          inputName: cardName,
          resolvedName: data.name || cardName,
          tcgLow: data.prices?.usd ? `$${data.prices.usd}` : 'N/A',
          tcgUrl: data.purchase_uris?.tcgplayer || null,
          error: null
        };
      } catch (_error) {
        return {
          inputName: cardName,
          resolvedName: cardName,
          tcgLow: 'N/A',
          tcgUrl: null,
          error: 'Network error'
        };
      }
    }

    return {
      inputName: cardName,
      resolvedName: cardName,
      tcgLow: 'N/A',
      tcgUrl: null,
      error: 'Card not found'
    };
  }

  function parseCardInput(text) {
    return text
      .split(/[\n,]/)
      .map((card) => card.trim())
      .filter(Boolean);
  }

  async function priceCards(cardNames) {
    const pricedCards = await Promise.all(cardNames.map((card) => fetchCardPriceFromScryfall(card)));
    setUploadedCards(pricedCards);
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
    const cards = Array.isArray(payload.cards) ? payload.cards : [];
    if (cards.length === 0) {
      setUploadedCards([]);
      return;
    }

    setCardInputText(cards.join('\n'));
    setIsCardPriceLoading(true);
    await priceCards(cards);
    setIsCardPriceLoading(false);
  }

  async function handleCardListUpload(event) {
    event.preventDefault();
    const cards = parseCardInput(cardInputText);

    if (cards.length === 0) {
      setUploadedCards([]);
      setCardUploadFeedback('Please add at least one card name.');
      return;
    }

    if (!loggedInUser || loggedInUser.role !== 'user') {
      setCardUploadFeedback('Log in with a user account to save a card list.');
      return;
    }

    const authHeader = loginAuthHeader;
    if (!authHeader) {
      setCardUploadFeedback('Please log in again to continue.');
      return;
    }

    setIsCardPriceLoading(true);
    try {
      const saveResponse = await fetch(`${apiBaseUrl}/api/cards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader
        },
        body: JSON.stringify({ cards })
      });

      const savePayload = await saveResponse.json();
      if (!saveResponse.ok) {
        setCardUploadFeedback(savePayload.error || 'Could not save your card list.');
        setIsCardPriceLoading(false);
        return;
      }

      await priceCards(cards);
      setCardUploadFeedback(
        `Saved ${cards.length} card${cards.length === 1 ? '' : 's'} to ${loggedInUser.username}'s list.`
      );
    } catch (_error) {
      setCardUploadFeedback('Could not save card list right now.');
    } finally {
      setIsCardPriceLoading(false);
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
      <p className="logo">Making Magic Meetups</p>
      <a className="topbar-link" href="#/dashboard">
        Dashboard
      </a>
    </div>
  );

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
                {cardUploadFeedback ? <p>{cardUploadFeedback}</p> : null}
                {isCardPriceLoading ? <p>Loading prices from Scryfall...</p> : null}
                {uploadedCards.length > 0 ? (
                  <div className="card-upload-results">
                    <h2>Uploaded Cards</h2>
                    <table className="price-table">
                      <thead>
                        <tr>
                          <th>Card</th>
                          <th>TCGPlayer Low</th>
                          <th>Links / Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadedCards.map((card, index) => (
                          <tr key={`${card.inputName}-${index}`}>
                            <td>{card.resolvedName}</td>
                            <td>{card.tcgLow}</td>
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
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        </main>
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
    </div>
  );
}
