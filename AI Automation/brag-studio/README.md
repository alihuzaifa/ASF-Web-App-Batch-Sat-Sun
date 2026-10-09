# Brag Studio

Give it your project's website. It takes pictures of the pages, asks you a few
questions, then makes:

- **pictures** for the feed: a launch card, one card per feature, a "what it does" list
- **a short brag video** (about 25 seconds, music included) for Reels, TikTok and Shorts
- **a long tour video** that scrolls through every page, plus your own screen recording if you add one

Then it posts them for you through **Buffer**, at the time you pick. The files
are kept online on **Cloudflare Pages** so Buffer can fetch them.

All you need are two things: a Buffer key and a Cloudflare token. No commands to type.

---

## How to use it

**1. Double-click `Start.cmd`.**
The first time it gets everything ready (a few minutes). If Node is missing it
installs it and asks you to double-click Start again. Then your browser opens
the app. Keep the black window open while you use it; close it to stop.

**2. Connect tab: paste your keys.** The page shows where to get each one:

| key | where |
|---|---|
| Buffer key | [publish.buffer.com/settings/api](https://publish.buffer.com/settings/api) → New key |
| Cloudflare account ID | [dash.cloudflare.com](https://dash.cloudflare.com) → three dots next to your account → Copy account ID |
| Cloudflare token | My Profile → API Tokens → Create Token → Custom token → **Account · Cloudflare Pages · Edit** |

Press **Check and save**. It tests each key, creates the media site on
Cloudflare, and lists the accounts connected in Buffer. Keys are saved in
`.env.local` on this computer only. Never send that file to anyone.

**3. Project tab: paste the website link** (and the GitHub link if you have one)
and press **Read my project**. It fills in the answers. Fix anything that is
wrong, untick pages you don't want, press **Save answers**.

**4. Make tab: pick what to make.** Pictures take a few seconds, videos a minute
or two. You see the result and the words to post with it.

**5. Post tab: click a file**, edit the words, tick where it should go, pick a
time, press **Schedule**. The table at the bottom shows what is waiting and what
went out (**Check status** asks Buffer).

---

## Good to know

- **Nothing is posted unless you press Schedule.** Making files never uploads anything.
- **Buffer's free plan** allows 3 accounts and 10 waiting posts per account.
- **One file can be at most 25 MB** (Cloudflare's limit). The app sets the
  video quality so every file fits. Long videos over ~100 seconds come out at 720p.
- **Facebook reels stop at 90 seconds**, so a longer video goes to Facebook as a normal video post.
  YouTube only takes video. Pinterest and Google Business are not supported.
- **The music is made by the app** from plain tones, so no platform can claim it
  or mute the post. Every video gets its own track at the video's length.
- **Files stay on Cloudflare until three days after their post was due**, then
  the next upload clears them. Your copies stay in the `output/` folder.
- If **Claude Code** is installed, the Project tab shows **Improve the words with Claude**.
  It only rewrites your answers; check them before saving.
- Reading a site uses Edge (built into Windows) or Chrome. Making videos
  downloads a small render browser the first time (about 100 MB).

## When something goes wrong

| you see | do this |
|---|---|
| "Buffer did not accept the key" | Copy the key again. Make a new one if needed. |
| "Cloudflare did not accept the token" | The token needs **Account · Cloudflare Pages · Edit**. Make a new one. |
| "The website did not open" | Check the link opens in your own browser. Sites behind a login can't be read. |
| a channel is missing | Connect it in Buffer, then Connect tab → **Check again**. |
| anything else in red | Read it, it says why. If it makes no sense, send a screenshot to Ali. |

---

## For developers

```
Start.cmd              double-click entry: checks Node, installs, starts the app
app/server.mjs         local server on http://localhost:4545 (no framework)
app/lib/reader.mjs     opens the site with Playwright (Edge/Chrome), screenshots, GitHub README
app/lib/render.mjs     Remotion bundle + renderStill/renderMedia, bitrate kept under 25 MB
app/lib/music.mjs      the music: sine waves and noise, Am F C G, written as WAV
app/lib/publish.mjs    stage files -> wrangler pages deploy --branch main -> check -> Buffer createPost
app/lib/buffer.mjs     Buffer GraphQL (api.buffer.com), per-service metadata and limits
app/lib/cloudflare.mjs Pages project create/lookup, deploy, content-type check
app/ui/                the page: four tabs, plain JS
video/                 Remotion compositions: Post (still), Short, Tour
plugin/, .claude-plugin/  Claude Code marketplace with a /brag command
data/                  (gitignored) projects, screenshots, music, posts.json
output/                (gitignored) the finished pictures and videos
```

```bash
npm test          # what goes where, file size budget, captions, music
npm run typecheck
npm run studio    # Remotion Studio, to work on the templates
```

As a Claude Code plugin:

```
/plugin marketplace add "<path to this folder>"
/plugin install brag-studio@brag-studio-marketplace
/brag https://your-site.com
```

The Cloudflare and Buffer handling follows `ghaznawi-marketing`: Pages answers
200 with HTML for a missing file (so the content type is checked), every deploy
is a full snapshot (so every file a waiting post needs is sent again), and
`--branch main` is passed so the deploy is production, not a preview.

Remotion is free for individuals and companies of up to three people; bigger
companies need a [Remotion license](https://www.remotion.dev/license).
