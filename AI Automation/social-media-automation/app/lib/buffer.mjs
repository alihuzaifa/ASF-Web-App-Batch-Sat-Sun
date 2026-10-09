// Buffer's API. One GraphQL endpoint, everything is a POST, the key goes in
// `Authorization: Bearer ...`. Same shape as ghaznawi-marketing/buffer/api.mjs.
//
// Buffer takes no file uploads: a post carries a public URL, and the file has to
// still be there when the post goes out. That is what cloudflare.mjs is for.

const ENDPOINT = "https://api.buffer.com"

export const ask = async (key, query, variables) => {
  if (!key) throw new Error("The Buffer key is missing. Add it on the Connect tab.")
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  })
  const body = await res.json().catch(() => null)
  if (res.status === 401 || res.status === 403) throw new Error("Buffer did not accept the key. Copy it again from Buffer.")
  if (!res.ok) throw new Error(`Buffer answered ${res.status}: ${JSON.stringify(body)}`)
  // GraphQL sends errors with a 200, so they have to be looked for separately
  if (body?.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "))
  return body.data
}

export const organizations = async (key) =>
  (await ask(key, `query { account { organizations { id name } } }`)).account.organizations

export const channels = async (key, organizationId) =>
  (
    await ask(
      key,
      `query C($input: ChannelsInput!) { channels(input: $input) { id name displayName service isQueuePaused avatar } }`,
      { input: { organizationId } },
    )
  ).channels

/** Every channel on every organization the key can see. */
export const allChannels = async (key) => {
  const out = []
  for (const org of await organizations(key)) {
    for (const c of await channels(key, org.id)) out.push({ ...c, organizationId: org.id, organization: org.name })
  }
  return out
}

// Services this app can post to without extra setup. Pinterest needs a board and
// Google Business needs a post kind, so they are left out rather than half-done.
export const SUPPORTED = ["instagram", "facebook", "tiktok", "youtube", "linkedin", "twitter", "threads", "bluesky", "mastodon"]

/**
 * What each service needs to know about the post.
 *
 * Instagram and Facebook reject a post without a type. A vertical video goes out
 * as a reel because that is where new people see it. Facebook reels stop at 90
 * seconds, so a longer video is an ordinary video post there. YouTube needs a
 * title and only takes video.
 */
export const metadataFor = ({ service, isVideo, seconds = 0, vertical = false, title = "" }) => {
  const t = title.slice(0, 95)
  switch (service) {
    case "instagram":
      return { instagram: { type: isVideo ? "reel" : "post", shouldShareToFeed: true } }
    case "facebook":
      return { facebook: { type: isVideo && vertical && seconds <= 90 ? "reel" : "post" } }
    case "youtube":
      return { youtube: { title: t, privacy: "public", categoryId: "28", madeForKids: false, notifySubscribers: true } }
    case "tiktok":
      return { tiktok: { title: t } }
    default:
      return undefined
  }
}

/** Why this file cannot go to this channel, or null if it can. */
export const refuse = ({ service, isVideo, seconds = 0, vertical = false }) => {
  if (!SUPPORTED.includes(service)) return `${service} is not supported yet`
  if (service === "youtube" && !isVideo) return "YouTube only takes video"
  if (service === "tiktok" && isVideo && seconds > 600) return "TikTok takes up to 10 minutes"
  if (service === "instagram" && isVideo && seconds > 900) return "Instagram takes up to 15 minutes"
  if (service === "youtube" && isVideo && vertical && seconds > 180) return "a vertical video over 3 minutes is not a YouTube Short"
  if (service === "twitter" && isVideo && seconds > 140) return "X takes up to 2 minutes 20 seconds"
  return null
}

export const createPost = async (key, { channelId, text, dueAt, assets, metadata }) => {
  const input = {
    channelId,
    text,
    schedulingType: "automatic",
    mode: dueAt ? "customScheduled" : "addToQueue",
    ...(dueAt ? { dueAt } : {}),
    needsApproval: false,
    assets,
    ...(metadata ? { metadata } : {}),
  }
  const data = await ask(
    key,
    `mutation Create($input: CreatePostInput!) {
       createPost(input: $input) {
         ... on PostActionSuccess { post { id dueAt status } }
         ... on MutationError { message }
       }
     }`,
    { input },
  )
  const out = data.createPost
  if (out?.message) throw new Error(out.message)
  return out.post
}

export const postStatus = async (key, id) =>
  (await ask(key, `query P($input: PostInput!) { post(input: $input) { id status dueAt error { message } } }`, { input: { id } }))
    .post
