---
description: Open Brag Studio for this project. Reads the website, fills the answers from the code here, and leaves the person in the app to make and schedule posts.
argument-hint: "[website link]"
---

# /brag

Brag Studio is a local app. The person uses it in the browser; this command only
gets them there with the answers already filled in.

The app lives in `${CLAUDE_PLUGIN_ROOT}/..` (the folder with `Start.cmd`).

1. **Start it** in the background if `http://localhost:4545/api/state` does not
   answer: `node app/server.mjs` from that folder (run `npm ci` there first if
   `node_modules` is missing). It opens the browser by itself.

2. **Find the website.** Use `$ARGUMENTS` if given. Otherwise look for the live
   link in this repo (README, `package.json` `homepage`, Vercel or Netlify
   config). If there is none, ask for it. Do not guess a domain.

3. **Read it**: `POST /api/read` with `{"website": "...", "github": "<remote url if public>"}`,
   then poll `GET /api/job/<id>` until `done`.

4. **Fill the answers from the code you can see**, not from memory: what it does,
   who it is for, and three short things it can do (each under 48 characters,
   starting with a verb). Only claims the code supports. No numbers, users or
   customers that are not written down somewhere in the repo.
   Save with `POST /api/project` `{"brief": {...}}`, keeping the `slug` and `pages`
   the read returned.

5. Tell the person the app is open on the Make tab and stop. **Do not schedule
   anything.** Posting is their click, in the app, every time.
