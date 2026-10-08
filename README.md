# EduCare

An AI-native classroom for students and teachers: classes, assignments and grading, plus a grounded AI tutor, spaced-repetition flashcards, adaptive quizzes and teacher insights. All AI runs server-side on Google Gemini.

> v2 is a ground-up rebuild of the original DBIT hackathon project.

## Features

**For students**
- **AI Tutor** with three modes: Explain, Socratic (guides you rather than giving answers) and Exam prep. It streams its replies, renders LaTeX math, accepts a photo or PDF of a problem, and can ground its answers in a class's materials, citing them inline.
- **Study Studio** turns a topic, pasted notes, a class material or an uploaded file (PDF, DOCX, image, even handwriting) into a summary, key points, a glossary, discussion questions, a flashcard deck and a quiz. You can then chat with that source.
- **Flashcards** scheduled with **FSRS**, the algorithm modern Anki uses. A review session shows the next interval on each rating button and supports keyboard shortcuts.
- **Quizzes** can be generated from any source, are auto-graded (short answers are graded by AI), and come with explanations. Every answer updates per-concept **mastery**, and "Practice weak spots" builds a quiz on exactly what you keep missing.
- **Assignments**: submit text and files, resubmit before grading, and get **AI coaching on your draft** before submitting. The coaching never gives a grade.
- **Roadmaps**: week-by-week learning plans with progress tracking, plus "quiz me", flashcard and tutor shortcuts for each milestone.
- **Engagement**: XP, levels, streaks, a daily goal, class leaderboards, a Pomodoro focus timer that keeps running across pages, an activity heatmap, and the 3D **Space Explorer** game.

**For teachers**
- **Classes** with 7-letter join codes, a stream for announcements, materials (which are auto-transcribed for the AI, scans included), live sessions (a Jitsi room is created automatically) and member management.
- **Assignments** with rubrics (the AI can suggest one), late-work policy and attachments. **AI draft grading** gives per-criterion scores, feedback and a confidence level; you review, edit and return. "AI-draft all" drafts every pending submission in one go.
- **Gradebook** with CSV export, plus **class insights**: at-risk detection with reasons, score distribution, weakest concepts, hardest questions and an AI coaching briefing.
- **Lesson planner**, **question paper generator** (sections, marks, Bloom's levels, answer key, printable, convertible to a live quiz) and a **handwritten answer-sheet checker**. Everything is saved to a **Library**.

## Quick start (no database needed)

Requirements: Node.js 22.9 or newer.

```bash
# API: runs on an in-memory MongoDB, pre-seeded with demo data
cd backend
npm install
cp .env.example .env      # add GEMINI_API_KEY for the AI features
npm run demo              # http://localhost:5000/api

# Web app
cd ../frontend
npm install
npm run dev               # http://localhost:5173
```

Demo logins (password `educare123`): `teacher@educare.dev`, `aarav@educare.dev`, `meera@educare.dev`. You can also sign in with a SAP ID, for example `60001`.

Demo data lives in memory and is reset every time you restart.

## Running against a real database

1. Set `DATABASE_URL` in `backend/.env` to a MongoDB replica set. Atlas works; Prisma requires a replica set.
2. Run `npm run db:push` once to create the collections and indexes.
3. Optionally run `npm run seed` to add the demo accounts and class.
4. Start the API with `npm run dev`, which restarts on file changes.

The v2 collections have lowercase names (`users`, `classrooms`, `assignments`, ...), so they never collide with the original v1 collections. Existing v1 data is left untouched.

## Configuration (`backend/.env`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MongoDB connection string |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Session signing (tokens expire, `7d` by default) |
| `GEMINI_API_KEY` | Enables every AI feature. Without it the app still works and AI endpoints return a clear 503. |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS` | The primary model, then fallbacks tried in order |
| `CLOUDINARY_*` | File storage. If these are unset, files are stored in `backend/uploads`. |
| `CLIENT_ORIGIN` | Allowed browser origins (any localhost port is allowed in development) |

For the frontend, set `VITE_API_URL` only when the API is hosted on a different origin. In development, Vite proxies `/api` to port 5000.

## Architecture

```
backend/                 Express 5 · Prisma 6 · MongoDB
  prisma/schema.prisma   data model (embedded types for rubrics, quiz questions, files)
  src/config/env.js      validated environment
  src/lib/               gemini (AI client), storage, srs (FSRS), gamification, access control
  src/ai/                source resolution (topic/text/material/file) and quiz generation
  src/modules/           one router per domain: auth, classes, assignments, tutor, studio, ...
  scripts/               demo, seed, ai-smoke
  test/                  unit and end-to-end API tests
frontend/                React 19 · Vite 7 · Tailwind v4 · TanStack Query · Radix
  src/lib/               api client (JSON, uploads, SSE), auth, theme, focus timer, rewards
  src/components/        design system (ui/), app shell, Markdown + KaTeX, SourcePicker
  src/pages/             one folder per feature area, lazy-loaded
```

**AI layer** (`backend/src/lib/gemini.js`):
- Calls go through a **model fallback chain** with a per-model circuit breaker. A rate-limited model (429) is benched for Gemini's own `retryDelay`, a retired model (404) for 10 minutes, and an overloaded model (503) briefly, so later requests go straight to a healthy model.
- Structured outputs are defined with **Zod**, sent to Gemini as JSON Schema, and validated again on the way back.
- Answers are grounded in class materials, which are extracted locally (PDF, DOCX) or transcribed by Gemini (images and scanned PDFs) when they're uploaded.

**Security**: helmet, a CORS allow-list, rate limits (stricter on auth and AI endpoints), bcrypt password hashing, expiring JWTs, Zod validation on every input, and ownership and membership checks on every resource. Non-members get a 404 for classes they don't belong to, so class ids can't be probed. Secrets never reach the browser.

## Testing

```bash
cd backend
npm test           # unit tests and end-to-end API tests (in-memory MongoDB, AI disabled)
npm run smoke:ai   # live run of every AI feature through the API (needs GEMINI_API_KEY)
```

## Deploying as a single service

```bash
cd frontend && npm install && npm run build   # creates frontend/dist
cd ../backend && npm install && npm start     # serves the API and the built app on PORT
```

Set `NODE_ENV=production`, a strong `JWT_SECRET` and `CLIENT_ORIGIN`.
