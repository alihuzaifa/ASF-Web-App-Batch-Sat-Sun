# Social Media Automation: rules for this folder

For students. A local app (Start.cmd → http://localhost:4545) that reads a project's website,
makes pictures, a short launch video and a long tour video with Remotion, and
schedules them with Buffer. Media is hosted on Cloudflare Pages. The student
gives only a Buffer API key and a Cloudflare token; the account ID is looked up
from the token.

## Who uses it

Someone who does not write code. Every message the app shows is plain English
and says what to do next. Nothing should need a terminal command.

## Facts

Copy only says what the person typed into the Project tab, or what the code in
the repo supports. No invented users, numbers, customers or awards. The Claude
"improve" button and the `/social` command follow the same rule.

## Posting

- **Nothing is scheduled without the person pressing Schedule or "Make and
  schedule a week".** Do not call `/api/schedule`, `/api/autopilot` or Buffer's
  `createPost` on their behalf, and do not run
  `wrangler pages deploy` outside the app's own flow.
- Every deploy is a full snapshot. `filesToKeep` decides what stays online. If
  you change it, a waiting post must never lose its file.
- `--branch main` on every deploy, and check the content type, not the status.
- 25 MB per file. `videoBitrate` budgets 20 MB; keep that margin.

## Keys

`.env.local` holds the Buffer key and the Cloudflare token. It is gitignored.
Never print a key, never send one to the browser (`masked()` exists for that).

## Checks

`npm test` and `npm run typecheck` before a PR. After changing a template,
render one of each kind and look at it.

## Git

Branch, one-line commit message, open a PR. Never commit to the default branch,
never merge.
