// "Do it all for me": make a week of posts for a project and schedule them, one
// a day at the same time. The student presses one button; this is everything
// the Make and Post tabs would have done by hand.

import { make } from "./render.mjs"
import { ready, scheduleMany } from "./publish.mjs"
import { loadEnv } from "./env.mjs"

/** What goes out on which day. Pictures and videos alternate so the feed is not all one kind. */
export const weekPlan = (brief) => {
  const features = brief.features.filter((f) => f && f.trim()).slice(0, 3)
  const plan = [
    { kind: "picture", post: "launch", shape: "square" },
    { kind: "short", shape: "story" },
    ...features.slice(0, 1).map((_, i) => ({ kind: "picture", post: "feature", featureIndex: i, shape: "portrait" })),
    { kind: "long", shape: "wide" },
    ...features.slice(1).map((_, i) => ({ kind: "picture", post: "feature", featureIndex: i + 1, shape: "portrait" })),
    { kind: "picture", post: "list", shape: "square" },
  ]
  return plan
}

/**
 * Day `i` at hh:mm on the student's clock. `offset` is the browser's
 * getTimezoneOffset(), so 10:00 means 10:00 where they are, not on the server.
 */
export const dueAtFor = ({ startDate, time, offset }, i) => {
  const [y, m, d] = startDate.split("-").map(Number)
  const [hh, mm] = time.split(":").map(Number)
  return new Date(Date.UTC(y, m - 1, d + i, hh, mm) + offset * 60000).toISOString()
}

export const autopilot = async ({ brief, channelIds, startDate, time, offset }, onStep, onProgress) => {
  // check the keys first, so nobody waits five minutes of rendering to hear they are missing
  ready(await loadEnv())
  if (!channelIds?.length) throw new Error("Pick at least one place to post.")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") || !/^\d{2}:\d{2}$/.test(time || "")) throw new Error("Pick the first day and the time.")
  if (Date.parse(dueAtFor({ startDate, time, offset }, 0)) < Date.now() + 5 * 60 * 1000) throw new Error("The first post must be at least a few minutes from now.")
  if (brief.features.filter(Boolean).length < 2) throw new Error("Answer question 5 on the Project tab first (at least two things it can do).")

  const plan = weekPlan(brief)
  const made = []
  for (const [i, item] of plan.entries()) {
    onStep(`Making ${i + 1} of ${plan.length}: ${item.kind === "picture" ? `${item.post} picture` : `${item.kind} video`}`)
    const info = await make({ brief, ...item, recording: item.kind === "long" ? brief.recording : null }, () => {}, (p) => onProgress((i + p) / plan.length))
    made.push({ slug: brief.slug, file: info.file, channelIds, caption: info.caption, dueAt: dueAtFor({ startDate, time, offset }, i) })
  }
  onProgress(null)
  onStep("Everything is made. Uploading and scheduling.")
  const out = await scheduleMany(made, onStep, { skipRefused: true })
  return { ...out, days: made.length }
}
