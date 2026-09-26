# Sursangram

> **Sursangram is an AI Antakshri.**

A voice-first multiplayer Antakshri built from a random late-night idea — with AI opponents, online rooms, lyric-based song search, Apple song previews, live scoring, and a Roast Host.

**Sing it. Beat it. Own the battle.**

[Live Demo](https://sursangram.vercel.app) · [GitHub](https://github.com/vishalmishraxr-mp/Sursangram)

---

## Features

- **Play Together** — two teams on one device.
- **Play with AI** — single-player Antakshri against an AI opponent.
- **Online Multiplayer** — create and join live rooms with Socket.IO.
- **Voice + Text Input** — speak a song or type it manually.
- **Lyric Fragment Search** — identify songs from lines instead of exact titles.
- **Classic Letter Chain** — the ending letter becomes the next required starting letter.
- **Apple Song Previews** — matched songs use iTunes preview audio.
- **30-Second Turns** — previews are not looped.
- **Roast Host** — changing roast lines after turns.
- **Chaos / Dare Mode** — challenge-based gameplay.
- **Victory Celebration** — confetti and result animations.
- **Responsive UI** — built for desktop and mobile.

---

## Tech Stack

### Frontend

<p>
  <img src="https://skillicons.dev/icons?i=react,vite,tailwind,js,html,css" alt="Frontend stack" />
</p>

**React · Vite · Tailwind CSS · JavaScript · Web Speech API · Web Audio API**

### Backend

<p>
  <img src="https://skillicons.dev/icons?i=nodejs,express,mongodb,js" alt="Backend stack" />
</p>

**Node.js · Express · Socket.IO · MongoDB · Mongoose · JWT · Zod · Helmet**

### Deployment & Tools

<p>
  <img src="https://skillicons.dev/icons?i=git,github,vercel,render" alt="Deployment and tooling stack" />
</p>

**Git · GitHub · Vercel · Render · MongoDB Atlas**

### External Services

- **Apple iTunes Search API** — song metadata and preview audio
- **Unison** — lyric-fragment identification
- **LRCLIB** — synced lyric timestamps

---

## How It Works

```text
Voice / Text Input
        ↓
Song or Lyric Search
        ↓
Local Catalog / MongoDB Cache
        ↓
Lyric Search + iTunes Search
        ↓
Song Metadata + Preview
        ↓
Antakshri Turn
        ↓
Letter Validation + Scoring
        ↓
Next Turn / Roast / Result
```

For lyric fragments, Sursangram searches lyric content to identify the song and then resolves that song through iTunes. Cached results are reused on later searches.

---

## Play Modes

### Play Together

Two teams play on the same device. No room code or second device is required.

### Play with AI

Play against an AI opponent that follows the current letter-chain and avoids duplicate songs within the match.

### Online Multiplayer

Create or join a room and play across devices with real-time Socket.IO synchronization.

---

## Project Structure

```text
Sursangram/
├── backend/
│   ├── config/
│   ├── data/
│   ├── middleware/
│   ├── models/
│   ├── repositories/
│   ├── routes/
│   ├── services/
│   ├── sockets/
│   ├── utils/
│   ├── validation/
│   └── server.js
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── pages/
│   │   └── services/
│   ├── index.html
│   └── vite.config.js
│
├── .gitignore
└── README.md
```

---

## Run Locally

### 1. Clone

```bash
git clone https://github.com/vishalmishraxr-mp/Sursangram.git
cd Sursangram
```

### 2. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Backend:

```text
http://localhost:5001
```

Health check:

```text
GET /api/v1/health
```

### 3. Frontend

Open another terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend:

```text
http://localhost:5173
```

---

## Environment Variables

### Backend

```env
PORT=5001
CLIENT_ORIGIN=http://localhost:5173

MONGO_URI=your-mongodb-connection-string
JWT_SECRET=your-secret

MUSIC_API_COUNTRY=IN
MUSIC_API_TIMEOUT_MS=3500

LYRICS_SEARCH_BASE_URL=https://unison.boidu.dev
LYRICS_SEARCH_TIMEOUT_MS=4500

SYNCED_LYRICS_BASE_URL=https://lrclib.net
SYNCED_LYRICS_TIMEOUT_MS=3500
```

### Frontend

```env
VITE_API_BASE_URL=http://localhost:5001
```

---

## Deployment

```text
                  MongoDB Atlas
                       ↑
                       │
               Render Backend
                Express + Socket.IO
                       ↑
                       │
                 Vercel Frontend
                       ↑
                       │
                    Players
```

Current deployment:

- Frontend: [sursangram.vercel.app](https://sursangram.vercel.app)
- Backend: Render
- Database: MongoDB Atlas

---

## About

Sursangram started with a simple late-night thought:

**“Can I actually build an Antakshri game with the skills I have?”**

So I built it.

It was never meant to be a huge production product. It was a personal experiment to take an idea from scratch to a working full-stack application — and see how far I could push my skills.

---

## Author

**Vishal Mishra**

CSE Student · Full Stack Developer

<p>
  <a href="mailto:vishalmishraxr@gmail.com">Email</a> ·
  <a href="https://github.com/vishalmishraxr-mp">GitHub</a> ·
  <a href="https://www.linkedin.com/in/vishal-mishra-a49638385/">LinkedIn</a> ·
  <a href="https://www.instagram.com/vishal_mishra6663/">Instagram</a>
</p>

---

<p align="center">
  Built with curiosity, late-night ideas, and a lot of debugging.
</p>
