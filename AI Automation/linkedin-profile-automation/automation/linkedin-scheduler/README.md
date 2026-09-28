# Huzaifa Usman: LinkedIn daily auto-poster

One post a day at **09:00 Karachi** on Huzaifa Usman's personal LinkedIn profile,
from a queue in the Supabase project `huzaifa-linkedin`.

```
image + caption --npm run enqueue--> Supabase (post-images bucket + scheduled_posts)
                                        |
                        pg_cron 0 4 * * * (04:00 UTC = 09:00 PKT)
                                        v
                          Edge Function post-to-linkedin
                                        v
                 LinkedIn REST API: upload image, create post
```

The function posts the oldest due row per run, retries a failed row up to 3 times,
and never retries a post LinkedIn may already have published. Code comes from Ali's
and Adnan's schedulers; image is optional (text-only posts work).

## LinkedIn app (one time)

In the developer app, **Products**: "Sign In with LinkedIn using OpenID Connect" and
"Share on LinkedIn". **Auth** tab: redirect URL `http://localhost:5599/callback`.
Client ID and secret live in `.env` (gitignored, the only copy).

## Connect the account

```bash
npm run oauth      # open the printed URL, log in as Huzaifa, press Allow
```

If the browser shows the callback page but the script missed it:
`npm run oauth -- "<the callback URL from the address bar>"`.

There is no refresh token, so the access token dies after ~60 days. Run
`npm run oauth` again before then.

## Queue posts

```bash
npm run enqueue -- --caption=../../output/first-post.caption.md --image=../../output/first-post.png --date=2026-09-29
npm run enqueue -- --caption=test.md --now     # due now, posts on the next run
npm run queue
```

## Deploy (Ali runs these)

```bash
supabase functions deploy post-to-linkedin --no-verify-jwt --project-ref <ref>
supabase secrets set --project-ref <ref> CRON_SECRET=... LINKEDIN_CLIENT_ID=... LINKEDIN_CLIENT_SECRET=...
```

Then run `supabase/schema.sql` with `<SUPABASE_URL>` and `<CRON_SECRET>` filled in.

## Fire it by hand

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/post-to-linkedin" -H "x-cron-secret: <CRON_SECRET>"
```
