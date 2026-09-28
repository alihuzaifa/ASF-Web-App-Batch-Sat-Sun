// ============================================================================
// One-time LinkedIn OAuth. Run locally:  node scripts/linkedin-oauth.mjs
// Opens the consent URL, captures the redirect, exchanges the code for tokens,
// reads your member id, and upserts them into Supabase (linkedin_auth, id=1).
//
// If the browser lands on the callback but this script missed it, pass that URL:
//   npm run oauth -- "http://localhost:5599/callback?code=...&state=..."
//
// Requires .env with: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET,
//                     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// In the LinkedIn app, add redirect URL:  http://localhost:5599/callback
// Products needed: "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn".
// ============================================================================
import http from 'node:http';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const {
  LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:5599/callback';
const SCOPE = 'openid profile w_member_social';

for (const [k, v] of Object.entries({ LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(1); }
}

const pasted = process.argv.slice(2).find((a) => a.startsWith('http'));
const state = crypto.randomBytes(16).toString('hex');
const authUrl =
  'https://www.linkedin.com/oauth/v2/authorization?' +
  new URLSearchParams({
    response_type: 'code',
    client_id: LINKEDIN_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
  }).toString();

console.log('\n1) Open this URL in your browser and approve:\n');
console.log('   ' + authUrl + '\n');
console.log('2) After approving, LinkedIn redirects back here and this script finishes.\n');

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) { res.writeHead(404).end(); return; }
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const err = url.searchParams.get('error');

  // charset matters: without it the browser falls back to Windows-1252 and the
  // ✅ in the success message renders as mojibake.
  const done = (msg) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<meta charset="utf-8"><h2>${msg}</h2><p>You can close this tab.</p>`); };

  if (err) { done('LinkedIn returned an error: ' + err); console.error(err, url.searchParams.get('error_description')); process.exit(1); }
  if (!pasted && returnedState !== state) { done('State mismatch — aborting.'); console.error('state mismatch'); process.exit(1); }

  try {
    // Exchange code -> tokens
    const tokRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
    });
    const tok = await tokRes.json();
    if (!tokRes.ok) throw new Error('token exchange failed: ' + JSON.stringify(tok));

    // Who am I? (OpenID userinfo → sub = member id)
    const uiRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    const ui = await uiRes.json();
    if (!uiRes.ok || !ui.sub) throw new Error('userinfo failed: ' + JSON.stringify(ui));
    const memberUrn = `urn:li:person:${ui.sub}`;

    const expiresAt = new Date(Date.now() + (tok.expires_in ?? 5184000) * 1000).toISOString();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { error } = await supabase.from('linkedin_auth').upsert({
      id: 1,
      member_urn: memberUrn,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error('supabase upsert failed: ' + error.message);

    console.log('\n✅ Saved LinkedIn auth to Supabase.');
    console.log('   member_urn :', memberUrn, '(' + (ui.name ?? '') + ')');
    console.log('   access token expires:', expiresAt);
    console.log('   refresh token:', tok.refresh_token ? 'yes (auto-renews)' : 'NO — you will re-run this in ~60 days');
    done('LinkedIn connected ✅ Tokens saved.');
  } catch (e) {
    console.error('\n❌', e.message);
    done('Error: ' + e.message);
  } finally {
    setTimeout(() => { server.close(); process.exit(0); }, 500);
  }
});

if (pasted) {
  // Run the same handler against the pasted callback URL, no browser involved.
  const u = new URL(pasted);
  server.emit('request', { url: u.pathname + u.search }, { writeHead: () => ({ end: () => {} }) });
} else server.listen(5599, () => console.log('Waiting for the LinkedIn redirect on ' + REDIRECT_URI + ' ...\n'));
