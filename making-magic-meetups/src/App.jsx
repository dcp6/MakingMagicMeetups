import React from 'react';
import { useState } from 'react';

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
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [adminName, setAdminName] = useState('admin');
  const [adminPass, setAdminPass] = useState('test123');
  const [adminError, setAdminError] = useState('');
  const [adminUsers, setAdminUsers] = useState([]);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [isAdminAuthed, setIsAdminAuthed] = useState(false);

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
      setAdminError('Could not reach admin API.');
    } finally {
      setIsAdminLoading(false);
    }
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
          <h1>Modern meetups for curious people.</h1>
          <p>
            Making Magic Meetups creates welcoming, high-energy gatherings that help strangers
            connect quickly through playful formats and intentional hosting.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#join">
              Get Invite Access
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
          <h2>Admin Access</h2>
          <p>Use admin credentials to view subscriber records.</p>
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
              {isAdminLoading ? 'Checking...' : 'Admin Login'}
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
