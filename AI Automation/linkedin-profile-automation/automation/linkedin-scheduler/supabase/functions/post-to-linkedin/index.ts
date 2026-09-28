// @ts-nocheck  Deno Edge Function (runs on Supabase's Deno runtime, not Node).
// VS Code's Node TS server flags Deno-style imports (jsr:) and the Deno.* globals,
// but they resolve fine at deploy/runtime. Install the Deno VS Code extension for
// real Deno type-checking (see ../../../.vscode/settings.json). This directive just
// silences the Node language server so the file shows no false errors.
// ============================================================================
// Edge Function: post-to-linkedin  (Huzaifa Usman's profile)
// Invoked daily by pg_cron (04:00 UTC = 09:00 Asia/Karachi). Posts the single
// oldest DUE item from scheduled_posts to LinkedIn. Text only, unless the row
// has an image_path in the post-images bucket.
//
// Production hardening:
//  • ATOMIC CLAIM  — flips the row to 'processing' with a conditional update, so
//    two overlapping runs can never post the same row twice (no double-posts).
//  • AUTO-RETRY    — picks up 'failed' rows too, up to MAX_ATTEMPTS; a transient
//    failure is retried on the next run instead of being lost.
//  • NO DOUBLE POST — a create call that gets no answer (or a 5xx) may still have
//    posted, so that row is parked with an alert instead of retried. A row left
//    in 'processing' by a dead run is parked the same way on the next run.
//  • ALERTS        — emails you (via Resend, if configured) on post failure, when
//    the access token is about to expire (checked every run, even with an empty
//    queue) and when the last queued post has gone out.
//
// Deploy:  supabase functions deploy post-to-linkedin --no-verify-jwt
// Secrets (required): CRON_SECRET, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
// Secrets (optional, for email alerts): RESEND_API_KEY, ALERT_EMAIL
// Secret  (optional): LINKEDIN_VERSION pins the API version; unset = derived from the date
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
// ============================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

// LinkedIn API version (YYYYMM). LinkedIn retires versions about a year after release,
// so a hardcoded value goes stale on its own. Unless the LINKEDIN_VERSION secret pins
// one, the version is derived from today's date (two months back, so it has surely
// been released) and each HTTP 426 steps one more month back.
const PINNED_VERSION = Deno.env.get("LINKEDIN_VERSION");
const VERSION_LAG_MONTHS = 2;
const VERSION_FALLBACKS = 4;
let workingVersion: string | null = null;

// How many times to try a single post before giving up (and alerting).
const MAX_ATTEMPTS = 3;
// Warn this many days before the access token expires (only matters when there is
// no refresh_token, i.e. you must re-run the OAuth script manually).
const TOKEN_WARN_DAYS = 5;
// A row still 'processing' this long after its claim means the run died mid-post.
const STUCK_AFTER_MS = 15 * 60 * 1000;

// Thrown when LinkedIn may or may not have created the post (network failure or 5xx
// on the create call). Retrying could double-post, so the row is parked instead.
class UncertainPostError extends Error {}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const LI_CLIENT_ID = Deno.env.get("LINKEDIN_CLIENT_ID")!;
const LI_CLIENT_SECRET = Deno.env.get("LINKEDIN_CLIENT_SECRET")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Best-effort alert: always logs; also emails via Resend when RESEND_API_KEY +
// ALERT_EMAIL are set. Never throws — alerting must not break the main flow.
async function sendAlert(subject: string, text: string): Promise<void> {
  console.error(`[ALERT] ${subject} — ${text}`);
  try {
    const key = Deno.env.get("RESEND_API_KEY");
    const to = Deno.env.get("ALERT_EMAIL");
    if (!key || !to) return;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Huzaifa LinkedIn <onboarding@resend.dev>",
        to: [to],
        subject: `[Huzaifa LinkedIn] ${subject}`,
        text,
      }),
    });
    if (!res.ok) console.error(`[ALERT] email send failed: ${res.status} ${await res.text()}`);
  } catch (e) {
    console.error("[ALERT] sendAlert error:", e instanceof Error ? e.message : String(e));
  }
}

Deno.serve(async (req) => {
  // Only the cron job (which knows the shared secret) may trigger a real post.
  if (req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "forbidden" }, 403);

  // Health checks run on every invocation, not only when a post is due — otherwise
  // an empty queue silences the token warning exactly when nobody is watching.
  await releaseStuckRows();
  await warnIfTokenExpiring();

  // 1) Next actionable post: DUE, not done, and still within the retry budget.
  //    Includes 'failed' rows so a transient failure is retried next run.
  const nowIso = new Date().toISOString();
  const { data: rows, error: qErr } = await admin
    .from("scheduled_posts")
    .select("*")
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_ATTEMPTS)
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(1);
  if (qErr) return json({ error: qErr.message }, 500);
  if (!rows || rows.length === 0) {
    await warnIfQueueJustEmptied();
    return json({ ok: true, message: "nothing due" });
  }
  const post = rows[0];
  const attempt = (post.attempts ?? 0) + 1;

  // 2) ATOMIC CLAIM: flip to 'processing' only if the row is still in the status we
  //    just read. If another concurrent run already claimed it, this updates 0 rows
  //    and we bail out — guaranteeing at most one post per row (no double-posting).
  const { data: claimed, error: claimErr } = await admin
    .from("scheduled_posts")
    .update({ status: "processing", attempts: attempt, claimed_at: new Date().toISOString() })
    .eq("id", post.id)
    .eq("status", post.status)
    .select("id")
    .maybeSingle();
  if (claimErr) return json({ error: `claim failed: ${claimErr.message}` }, 500);
  if (!claimed) return json({ ok: true, message: "already claimed by another run" });

  try {
    const { accessToken, memberUrn } = await getValidToken();

    // 3) Download the image bytes from Storage, if this post has one.
    let bytes: Uint8Array | null = null;
    if (post.image_path) {
      const { data: blob, error: dlErr } = await admin.storage.from("post-images").download(post.image_path);
      if (dlErr || !blob) throw new Error(`image download failed: ${dlErr?.message ?? "no blob"}`);
      bytes = new Uint8Array(await blob.arrayBuffer());
    }

    // 4) Upload to LinkedIn (if there is an image) + create the post.
    const postUrn = await publishPost(accessToken, memberUrn, bytes, post.caption);

    // 5) Mark posted. If this write fails the row stays 'processing' and the next
    //    run's releaseStuckRows() parks it with an alert — it is never re-posted.
    const { error: markErr } = await admin.from("scheduled_posts")
      .update({ status: "posted", linkedin_post_id: postUrn, posted_at: new Date().toISOString(), error: null })
      .eq("id", post.id);
    if (markErr) console.error(`[post] posted ${postUrn} but could not mark row ${post.id}: ${markErr.message}`);
    return json({ ok: true, id: post.id, day: post.day, attempt, postUrn });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const uncertain = e instanceof UncertainPostError;
    const willRetry = !uncertain && attempt < MAX_ATTEMPTS;
    // Back to 'failed' so it is retried next run (until attempts hits MAX_ATTEMPTS).
    // An uncertain failure burns the retry budget so it cannot go out twice.
    await admin.from("scheduled_posts")
      .update({ status: "failed", error: msg, ...(uncertain ? { attempts: MAX_ATTEMPTS } : {}) })
      .eq("id", post.id);
    await sendAlert(
      uncertain
        ? `Post MAY have gone out (day ${post.day}) — check LinkedIn`
        : willRetry
        ? `Post failed (day ${post.day}) — will retry`
        : `Post GAVE UP (day ${post.day}) after ${MAX_ATTEMPTS} tries`,
      `id=${post.id} day=${post.day} attempt=${attempt}/${MAX_ATTEMPTS}\nscheduled_for=${post.scheduled_for}\nerror: ${msg}` +
        (uncertain
          ? "\n\nLinkedIn did not confirm the post, but it may have been created. Look at your profile. If it is NOT there, reset status to 'pending' & attempts to 0."
          : willRetry
          ? "\n\nIt will be retried on the next run."
          : "\n\nIt will NOT be retried automatically — fix the cause and reset status to 'pending' & attempts to 0."),
    );
    return json({ ok: false, id: post.id, attempt, willRetry, error: msg }, 500);
  }
});

// --- Health checks -------------------------------------------------------------
// A run that dies between the claim and the final update (timeout, crash) leaves
// its row in 'processing' forever, where nothing picks it up. Park such rows as
// failed with the retry budget spent — the post may already be live — and alert.
async function releaseStuckRows(): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
  const { data: stuck, error } = await admin
    .from("scheduled_posts")
    .update({
      status: "failed",
      attempts: MAX_ATTEMPTS,
      error: "stuck in 'processing' — the run died mid-post; it may or may not be on LinkedIn",
    })
    .eq("status", "processing")
    .or(`claimed_at.is.null,claimed_at.lt.${cutoff}`)
    .select("id, day, scheduled_for");
  if (error) {
    console.error("[health] releaseStuckRows:", error.message);
    return;
  }
  for (const r of stuck ?? []) {
    await sendAlert(
      `Post stuck (day ${r.day}) — check LinkedIn`,
      `id=${r.id} day=${r.day} scheduled_for=${r.scheduled_for}\nThe run that claimed it never finished. Look at your profile. If the post is NOT there, reset status to 'pending' & attempts to 0.`,
    );
  }
}

async function warnIfTokenExpiring(): Promise<void> {
  const { data, error } = await admin.from("linkedin_auth").select("expires_at, refresh_token").eq("id", 1).maybeSingle();
  if (error || !data) {
    await sendAlert("No LinkedIn token stored", "The linkedin_auth row is missing. Run: cd huzaifa-marketplace/automation/linkedin-scheduler && npm run oauth");
    return;
  }
  if (data.refresh_token) return; // refreshes itself in getValidToken()
  const msLeft = new Date(data.expires_at).getTime() - Date.now();
  if (msLeft >= TOKEN_WARN_DAYS * 86_400_000) return;
  const days = Math.max(0, Math.round(msLeft / 86_400_000));
  await sendAlert(
    msLeft > 0 ? `LinkedIn token expires in ~${days} day(s)` : "LinkedIn token has EXPIRED",
    `No refresh_token is stored, so it will NOT auto-renew.\nExpires: ${data.expires_at}\nAction: cd huzaifa-marketplace/automation/linkedin-scheduler && npm run oauth`,
  );
}

// One alert when the last queued post has just gone out, so the feed does not go
// quiet unnoticed. Fires only on the run(s) right after that post (within ~a day).
async function warnIfQueueJustEmptied(): Promise<void> {
  const { count, error } = await admin
    .from("scheduled_posts")
    .select("id", { count: "exact", head: true })
    .in("status", ["pending", "processing"]);
  if (error || (count ?? 0) > 0) return;
  const since = new Date(Date.now() - 25 * 3_600_000).toISOString();
  const { data: recent } = await admin
    .from("scheduled_posts")
    .select("day, posted_at")
    .eq("status", "posted")
    .gte("posted_at", since)
    .order("posted_at", { ascending: false })
    .limit(1);
  if (!recent?.length) return;
  await sendAlert(
    "Queue is empty — nothing else is scheduled",
    `The last queued post (day ${recent[0].day}) went out at ${recent[0].posted_at}.\nQueue the next batch or the feed stops here.`,
  );
}

// --- LinkedIn token (with refresh) --------------------------------------------
async function getValidToken(): Promise<{ accessToken: string; memberUrn: string }> {
  const { data, error } = await admin.from("linkedin_auth").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("no linkedin_auth row — run scripts/linkedin-oauth.mjs first");

  const skewMs = 5 * 60 * 1000;
  const msLeft = new Date(data.expires_at).getTime() - Date.now();

  // Still valid. (The early-expiry warning runs on every invocation in warnIfTokenExpiring.)
  if (msLeft - skewMs > 0) return { accessToken: data.access_token, memberUrn: data.member_urn };
  if (!data.refresh_token) throw new Error("access token expired and no refresh_token — re-run the OAuth script (npm run oauth)");

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: data.refresh_token,
      client_id: LI_CLIENT_ID,
      client_secret: LI_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${await res.text()}`);
  const t = await res.json();
  const expiresAt = new Date(Date.now() + (t.expires_in ?? 5184000) * 1000).toISOString();
  await admin.from("linkedin_auth").update({
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? data.refresh_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
  return { accessToken: t.access_token, memberUrn: data.member_urn };
}

// --- LinkedIn posting ----------------------------------------------------------
/** Versions to try, newest first: the pinned secret alone, else date-derived months. */
function candidateVersions(): string[] {
  if (PINNED_VERSION) return [PINNED_VERSION];
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - VERSION_LAG_MONTHS);
  for (let i = 0; i <= VERSION_FALLBACKS; i++) {
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

/** POST a versioned LinkedIn REST call, stepping back a month on each HTTP 426. */
async function liPost(url: string, token: string, body: unknown): Promise<Response> {
  const versions = workingVersion ? [workingVersion] : candidateVersions();
  let res: Response | null = null;
  for (const v of versions) {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "LinkedIn-Version": v,
        "X-Restli-Protocol-Version": "2.0.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.status !== 426) {
      workingVersion = v;
      return res;
    }
    console.error(`[linkedin] version ${v} rejected (426), trying an older one`);
    await res.body?.cancel();
  }
  throw new Error(`every LinkedIn version was rejected (tried ${versions.join(", ")}) — set the LINKEDIN_VERSION secret`);
}

// LinkedIn commentary uses the "Little Text Format": these characters are reserved
// and must be backslash-escaped or the post is rejected / mangled. We intentionally
// do NOT escape '#' so hashtags stay clickable. If your first test post looks off,
// tune this set (see README → "Caption formatting").
function escapeCommentary(text: string): string {
  return text.replace(/[\\<>()\[\]{}@|*_~]/g, (m) => "\\" + m);
}

// LinkedIn shows this as the image's title. It used to be hardcoded to the first
// series ("Claude Code roadmap"), which would have been wrong on every later post.
// Derive it from the caption's first line instead — no schema change needed.
function mediaTitle(caption: string): string {
  const first = caption.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const clean = first.replace(/[*_`#]/g, "").trim();
  if (!clean) return "Huzaifa Usman";
  return clean.length > 80 ? clean.slice(0, 77).trimEnd() + "..." : clean;
}

async function publishPost(
  token: string,
  memberUrn: string,
  bytes: Uint8Array | null,
  caption: string,
): Promise<string> {
  const imageUrn = bytes ? await uploadImage(token, memberUrn, bytes) : null;

  // Create the post, with the uploaded image if there is one.
  const body = {
    author: memberUrn,
    commentary: escapeCommentary(caption),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    ...(imageUrn ? { content: { media: { title: mediaTitle(caption), id: imageUrn } } } : {}),
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  // Past this call LinkedIn may have created the post even if we never hear back,
  // so a dropped connection or a 5xx is "uncertain", not "failed" (no retry).
  let postRes: Response;
  try {
    postRes = await liPost("https://api.linkedin.com/rest/posts", token, body);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("every LinkedIn version")) throw e;
    throw new UncertainPostError(`create post: no response — ${e instanceof Error ? e.message : String(e)}`);
  }
  if (postRes.status >= 500) throw new UncertainPostError(`create post: ${postRes.status} ${await postRes.text()}`);
  if (!postRes.ok) throw new Error(`create post failed: ${postRes.status} ${await postRes.text()}`);
  return postRes.headers.get("x-restli-id") ?? postRes.headers.get("x-linkedin-id") ?? "posted";
}

async function uploadImage(token: string, memberUrn: string, bytes: Uint8Array): Promise<string> {
  // Init the image upload → get a one-time uploadUrl + the image URN.
  const initRes = await liPost("https://api.linkedin.com/rest/images?action=initializeUpload", token, {
    initializeUploadRequest: { owner: memberUrn },
  });
  if (!initRes.ok) throw new Error(`initializeUpload failed: ${initRes.status} ${await initRes.text()}`);
  const init = await initRes.json();
  const uploadUrl: string = init?.value?.uploadUrl;
  const imageUrn: string = init?.value?.image;
  if (!uploadUrl || !imageUrn) throw new Error(`initializeUpload: unexpected response ${JSON.stringify(init)}`);

  // Upload the raw image bytes.
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  if (!put.ok) throw new Error(`image upload failed: ${put.status} ${await put.text()}`);
  return imageUrn;
}
