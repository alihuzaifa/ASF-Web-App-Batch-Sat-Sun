// The words that go under a post. Built from the person's own answers, so it
// only says what they said. Short lines, plain words, no hype.

const tags = (brief) => {
  const words = [brief.name.replace(/\s+/g, ""), "buildinpublic", "webdev"]
  return words.filter(Boolean).map((w) => `#${w.replace(/[^\w]/g, "")}`).join(" ")
}

export const captionsFor = (brief, { kind, post, featureIndex = 0 }) => {
  const features = brief.features.filter((f) => f && f.trim())
  const link = brief.website ? `Try it: ${brief.website}` : ""
  const forWho = brief.forWho ? `Made for ${brief.forWho}.` : ""
  const list = features.map((f) => `- ${f}`).join("\n")

  let body
  if (kind === "picture" && post === "feature") {
    body = [`${brief.name}: ${features[featureIndex] ?? ""}`, brief.oneLine, link]
  } else if (kind === "picture" && post === "list") {
    body = [`What ${brief.name} does:`, list, link]
  } else if (kind === "long") {
    body = [`A full walk through ${brief.name}, page by page.`, brief.oneLine, forWho, list, link]
  } else {
    body = [`${brief.hook || "I built this."} It's called ${brief.name}.`, brief.oneLine, forWho, list, link]
  }
  return [...body.filter(Boolean), tags(brief)].join("\n\n")
}

// X stops at 280 characters. Keep the first line and the link.
export const fitFor = (service, text, brief) => {
  if (service !== "twitter" || text.length <= 280) return text
  const first = text.split("\n")[0]
  const link = brief?.website ? `\n\n${brief.website}` : ""
  return (first.slice(0, 280 - link.length - 1) + link).trim()
}
