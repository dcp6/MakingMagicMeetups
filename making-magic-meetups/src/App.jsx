import React from 'react';
import { useEffect, useState } from 'react';

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? '' : 'https://makingmagicmeetups.onrender.com');

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
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountFeedback, setAccountFeedback] = useState('');
  const [isAccountSubmitting, setIsAccountSubmitting] = useState(false);
  const [adminName, setAdminName] = useState('admin');
  const [adminPass, setAdminPass] = useState('test123');
  const [adminError, setAdminError] = useState('');
  const [adminUsers, setAdminUsers] = useState([]);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [isAdminAuthed, setIsAdminAuthed] = useState(false);

  useEffect(() => {
    function syncRouteFromHash() {
      setRoute(window.location.hash === '#/create-account' ? 'create-account' : 'home');
    }

    syncRouteFromHash();
    window.addEventListener('hashchange', syncRouteFromHash);

    return () => {
      window.removeEventListener('hashchange', syncRouteFromHash);
    };
  }, []);

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

  async function loadAdminUsers(username, password) {
    const auth = btoa(`${username}:${password}`);
    const response = await fetch(`${apiBaseUrl}/api/users`, {
      headers: {
        Authorization: `Basic ${auth}`
      }
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load users.');
    }

    setAdminUsers(payload.users || []);
  }

  async function handleAdminLogin(event) {
    event.preventDefault();
    setAdminError('');
    setIsAdminLoading(true);

    try {
      const loginResponse = await fetch(`${apiBaseUrl}/api/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: adminName,
          password: adminPass
        })
      });

      const loginPayload = await loginResponse.json();
      if (!loginResponse.ok) {
        setIsAdminAuthed(false);
        setAdminUsers([]);
        setAdminError(loginPayload.error || 'Login failed.');
        return;
      }

      setIsAdminAuthed(true);
      await loadAdminUsers(adminName, adminPass);
    } catch (_error) {
      setIsAdminAuthed(false);
      setAdminUsers([]);
      setAdminError('Could not reach login service.');
    } finally {
      setIsAdminLoading(false);
    }
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
      setAccountEmail('');
      setAccountPassword('');
      setAccountFeedback('Account created successfully. You can now log in.');
    } catch (_error) {
      setAccountFeedback('Network error. Please try again.');
    } finally {
      setIsAccountSubmitting(false);
    }
  }

  if (route === 'create-account') {
    return (
      <div className="page">
        <header className="topbar">
          <p className="logo">Making Magic Meetups</p>
          <nav className="topnav">
            <a href="#">Home</a>
            <a href="#admin">Login</a>
          </nav>
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
        <p className="logo">Making Magic Meetups</p>
        <nav className="topnav">
          <a href="#admin">Login</a>
          <a href="#join">Join</a>
        </nav>
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

        <section className="join" id="admin">
          <h2>User Login</h2>
          <p>Use your credentials to view subscriber records.</p>
          <form className="join-form" onSubmit={handleAdminLogin}>
            <label htmlFor="admin-username" className="sr-only">
              Username
            </label>
            <input
              id="admin-username"
              type="text"
              placeholder="username"
              value={adminName}
              onChange={(event) => setAdminName(event.target.value)}
              required
            />
            <label htmlFor="admin-password" className="sr-only">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              placeholder="password"
              value={adminPass}
              onChange={(event) => setAdminPass(event.target.value)}
              required
            />
            <button type="submit" disabled={isAdminLoading}>
              {isAdminLoading ? 'Checking...' : 'User Login'}
            </button>
          </form>
          {adminError ? <p>{adminError}</p> : null}
          {isAdminAuthed ? (
            <p>
              Logged in. Users in database: <strong>{adminUsers.length}</strong>
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
