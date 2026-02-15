import React from 'react';
import { useState } from 'react';

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? '' : 'https://makingmagicmeetups-api.onrender.com');

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

  return (
    <div className="page">
      <header className="topbar">
        <p className="logo">Making Magic Meetups</p>
        <nav className="topnav">
          <a href="#events">Events</a>
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
      </main>
    </div>
  );
}
