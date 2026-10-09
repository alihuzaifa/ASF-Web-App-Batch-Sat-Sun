# Social Media Automation

For students: give it the website you built, and it makes your social media
posts and schedules them for you.

You only give it **two things**:

1. a **Buffer API key** (Buffer posts to Instagram, Facebook, TikTok, YouTube, LinkedIn, X)
2. a **Cloudflare Pages token** (Cloudflare keeps the pictures and videos online so Buffer can fetch them)

Everything else it does by itself: it opens your website, takes pictures of the
pages, works out what your project does, and makes

- **pictures** for the feed: a launch card, one card per feature, a "what it does" list
- **a short launch video** (about 25 seconds, music included) for Reels, TikTok and Shorts
- **a long tour video** that scrolls through every page, plus your own screen recording if you add one

Then **Do it all for me** schedules a week of them, one a day. No commands to type.

---

## How to use it

**1. Double-click `Start.cmd`.**
The first time it gets everything ready (a few minutes). If Node is missing it
installs it and asks you to double-click Start again. Then your browser opens
the app. Keep the black window open while you use it; close it to stop.

**2. Connect tab: paste your two keys.** Every click, step by step:
**[HOW-TO-GET-KEYS.md](HOW-TO-GET-KEYS.md)**, or watch the 79-second video
**[docs/how-to-get-keys.mp4](docs/how-to-get-keys.mp4)** (it also plays on the Connect tab). In short:

| key | where |
|---|---|
| Buffer API key | Connect your accounts in Buffer first, then [publish.buffer.com/settings/api](https://publish.buffer.com/settings/api) → New key |
| Cloudflare token | Free account at [dash.cloudflare.com](https://dash.cloudflare.com/sign-up) → My Profile → API Tokens → Create Custom Token → **Account · Cloudflare Pages · Edit** |

Press **Check and save**. It tests both keys, finds your Cloudflare account,
creates the media site, and lists the accounts connected in Buffer. Keys are
saved in `.env.local` on your computer only. Never send that file to anyone,
and never put it on GitHub.

**3. Project tab: paste your website link** (and your GitHub link if the repo is
public) and press **Read my project**. The answers fill in by themselves. Read
them, fix anything that is not true, press **Save answers**.

**4. Make tab → Do it all for me.** Tick where to post, pick the first day and
the time, press **Make and schedule a week**. It makes everything (about 5
minutes) and schedules one post a day. That's it.

Want just one file instead? Use the cards under it to make a single picture or
video, then schedule it from the **Post** tab. The Post tab also shows what is
waiting and what went out (**Check status** asks Buffer).

---

## Good to know

- **Nothing is posted unless you press Schedule or Make and schedule a week.** Making single files never uploads anything.
- **Buffer's free plan** allows 3 accounts and 10 waiting posts per account. A week from Do it all for me uses 6 or 7 of those.
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
app/lib/autopilot.mjs  "Do it all for me": the week plan, make each, one upload, schedule
app/lib/publish.mjs    stage files -> wrangler pages deploy --branch main -> check -> Buffer createPost
app/lib/buffer.mjs     Buffer GraphQL (api.buffer.com), per-service metadata and limits
app/lib/cloudflare.mjs Pages project create/lookup, deploy, content-type check
app/ui/                the page: four tabs, plain JS
video/                 Remotion compositions: Post (still), Short, Tour
plugin/, .claude-plugin/  Claude Code marketplace with a /social command
data/                  (gitignored) projects, screenshots, music, posts.json
output/                (gitignored) the finished pictures and videos
```

```bash
npm test          # what goes where, file size budget, captions, music
npm run typecheck
npm run studio    # Remotion Studio, to work on the templates
node scripts/make-guide-video.mjs   # re-render docs/how-to-get-keys.mp4 after changing video/Guide.tsx
```

As a Claude Code plugin:

```
/plugin marketplace add "<path to this folder>"
/plugin install social-media-automation@social-media-marketplace
/social https://your-site.com
```

The Cloudflare and Buffer handling follows `ghaznawi-marketing`: Pages answers
200 with HTML for a missing file (so the content type is checked), every deploy
is a full snapshot (so every file a waiting post needs is sent again), and
`--branch main` is passed so the deploy is production, not a preview.

Remotion is free for individuals and companies of up to three people; bigger
companies need a [Remotion license](https://www.remotion.dev/license).
