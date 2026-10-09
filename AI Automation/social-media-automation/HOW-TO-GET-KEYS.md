# How to get your two keys

The app needs two things from you. Both are free and take about five minutes.

Prefer to watch? **[docs/how-to-get-keys.mp4](docs/how-to-get-keys.mp4)** (2 minutes, real screens, every click highlighted). The same video plays on the app's Connect tab.

| | what it is | what the app uses it for |
|---|---|---|
| **Buffer API key** | a password for your Buffer account | to schedule your posts on Instagram, Facebook, TikTok, YouTube, LinkedIn and X |
| **Cloudflare token** | a password for one part of your Cloudflare account | to keep your pictures and videos online, so Buffer can fetch them when the post goes out |

---

## Key 1: Buffer API key

1. **Make a free account** at [buffer.com](https://buffer.com), then **open the email Buffer sends you and click the link**. The API page stays locked until your email is verified.
2. **Connect the accounts you want to post to:** Settings → **Channels** → **Connect Channel**, pick Instagram, Facebook, TikTok and so on, and log in there.
   - **Instagram: use a Business or Creator account** so posts go out by themselves. Switch it in the Instagram app: Settings and activity → Account type and tools → Switch to professional account.
   - The free plan takes **3 channels** and **10 waiting posts per channel**.
3. **Open the API page:** Settings → **API**, or go straight to [publish.buffer.com/settings/api](https://publish.buffer.com/settings/api).
4. Click **New Key**.
5. **Key Name:** anything, for example `social media automation`.
6. **Expiration: pick 1 year** (the longest). The key stops working when it expires; then make a new one and paste it in the app again.
7. Leave every **permission** ticked and click **Generate API Key**.
8. **Copy** the key (the button next to it), then **Done**.
9. **Paste it in the app:** Connect tab → **Buffer key**.

Added a new account in Buffer later? Connect tab → **Check again**, and it shows up.

---

## Key 2: Cloudflare token

1. **Make a free account** at [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up). No card needed. Confirm your email.
2. **Open your API tokens:** click your picture (top right) → **My Profile** → **API Tokens**.
   Or go straight to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens).
3. **Start a custom token:** **Create Token** → at the top, **Create Custom Token** → **Get started**.
4. **Fill it in:**
   - **Token name:** anything, for example `social media automation`
   - **Permissions:** pick **Account**, then **Cloudflare Pages**, then **Edit**. Add nothing else.
   - **Account Resources:** leave it as it is (Include → All accounts).
   - Leave the rest as it is.
5. **Create it and copy it now:** **Continue to summary** → **Create Token** → **Copy**.
   Cloudflare shows the token **only once**. If you lose it, delete it and make a new one.
6. **Paste it in the app:** Connect tab → **Cloudflare token** → **Check and save**.

You do not need the account ID. The app finds it from the token. Only if the app says it cannot find your
account, open the small **"Only if the app asks for it: account ID"** box and paste it there
(Cloudflare home page → the three dots next to your account name → **Copy account ID**).

---

## Keep them safe

- Both keys are passwords. Whoever has them can post on your accounts.
- The app keeps them in a file called **`.env.local`** on your computer only.
- **Never** send that file to anyone, paste the keys in a chat, or push them to GitHub. (`.env.local` is already in `.gitignore`.)
- Think a key leaked? Delete it (Buffer: the API page; Cloudflare: API Tokens → the three dots → Delete), make a new one, and paste the new one in the app.

---

## When the app says no

| the app says | what to do |
|---|---|
| "Buffer did not accept the key" | Copy it again. Still failing, or it is over a year old? Make a new key (it may have expired). |
| Buffer's API page says "verify your email" | Open the email from Buffer and click the link, then refresh the page. |
| Buffer works but shows **0 accounts** | Connect your accounts in Buffer first (step 2), then **Check again**. |
| "Cloudflare did not accept the token" | The permission is wrong. Make a new token with **Account · Cloudflare Pages · Edit**. |
| "The token works but cannot see any account" | Under **Account Resources** pick your account, or paste the account ID in the small box. |
