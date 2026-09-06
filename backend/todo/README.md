# Todo API + Todo App

A minimal Express REST API and a Next.js frontend that consumes it.

## Structure

| Path | What it is |
| --- | --- |
| `api/server.js` | The whole API: Express app, in-memory store, CRUD routes |
| `api/api/index.js` | Vercel entrypoint, re-exports the Express app |
| `api/vercel.json` | Rewrites every path to the serverless function |
| `app/` | Next.js 16 frontend (App Router, Tailwind) |
| `app/e2e.mjs` | Playwright end-to-end test against a live API |

## API

Live app: https://todo-app-xi-swart.vercel.app

API base URL: `https://todo-api-one-gules.vercel.app`

| Method | Route | Notes |
| --- | --- | --- |
| `POST` | `/todos` | Body `{ title, completed? }`. `title` must be a non-empty string |
| `GET` | `/todos` | Optional `?completed=true\|false` filter |
| `GET` | `/todos/:id` | |
| `PUT` | `/todos/:id` | Partial update of `title` and/or `completed` |
| `DELETE` | `/todos/:id` | Returns the deleted todo |

Errors come back as `{ "error": "..." }` with a 400 or 404.

## Running locally

```bash
cd api && npm install
node server.js            # API on :3000

cd ../app && npm install
cp .env.example .env.local
npm run dev               # UI on :3001
```

## Tests

With both servers running:

```bash
cd app && npm test
```

Drives real Chromium through the UI and verifies each mutation twice — once in the
DOM, once by re-querying the API.

## Known limitation

The API stores todos in a module-level array. On Vercel that means state resets on
cold start and is not shared between instances, so todos appear to vanish. Swapping
the array for Redis or Postgres is the fix.
