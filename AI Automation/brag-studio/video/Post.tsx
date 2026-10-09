import React from "react"
import { AbsoluteFill, useVideoConfig } from "remotion"
import { Background, BrowserFrame, Chip, INK, MUTED, PhoneFrame, fontFamily, hostOf } from "./parts"
import type { Props } from "./types"

// One picture. Three kinds:
//   launch  - "just shipped": the name, the one line, the site in a browser window
//   feature - one thing it does, next to the page that shows it
//   list    - everything it does, as a checklist

export const Post: React.FC<Props> = ({ brief, assetBase, kind = "launch", featureIndex = 0 }) => {
  const { width, height } = useVideoConfig()
  const tall = height / width > 1.2
  const story = height / width > 1.5
  const pad = width * 0.075
  const pages = brief.pages.length ? brief.pages : []
  const features = brief.features.filter(Boolean)
  const page = pages[kind === "feature" ? (featureIndex + 1) % Math.max(1, pages.length) : 0]
  const frameW = width - pad * 2
  const frameH = frameW * (900 / 1440)

  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: MUTED, fontSize: width * 0.026, fontWeight: 600 }}>
      <span style={{ color: INK }}>{hostOf(brief.website)}</span>
      <span>{brief.handle}</span>
    </div>
  )

  let top: React.ReactNode
  if (kind === "feature") {
    top = (
      <>
        <Chip accent={brief.accent} size={width * 0.024}>
          {`What ${brief.name} does · ${featureIndex + 1}/${features.length}`}
        </Chip>
        <div style={{ fontSize: width * (tall ? 0.075 : 0.064), fontWeight: 800, color: INK, lineHeight: 1.08, letterSpacing: -2, marginTop: width * 0.035 }}>
          {features[featureIndex] ?? ""}
        </div>
      </>
    )
  } else if (kind === "list") {
    top = (
      <>
        <Chip accent={brief.accent} size={width * 0.024}>
          {brief.name}
        </Chip>
        <div style={{ fontSize: width * 0.085, fontWeight: 800, color: INK, letterSpacing: -3, margin: `${width * 0.04}px 0 ${width * 0.045}px` }}>
          What it does
        </div>
        {features.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: width * 0.03, alignItems: "flex-start", marginBottom: width * 0.04 }}>
            <span
              style={{
                flex: "none",
                width: width * 0.06,
                height: width * 0.06,
                marginTop: width * 0.004,
                borderRadius: 99,
                background: brief.accent,
                color: "#fff",
                fontSize: width * 0.03,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✓
            </span>
            <span style={{ color: INK, fontSize: width * 0.052, fontWeight: 600, lineHeight: 1.25 }}>{f}</span>
          </div>
        ))}
      </>
    )
  } else {
    top = (
      <>
        <Chip accent={brief.accent} size={width * 0.024}>
          {brief.hook || "Just shipped"}
        </Chip>
        <div style={{ fontSize: width * (tall ? 0.12 : 0.1), fontWeight: 800, color: INK, lineHeight: 1, letterSpacing: -4, marginTop: width * 0.035 }}>
          {brief.name}
        </div>
        <div style={{ fontSize: width * 0.04, color: MUTED, lineHeight: 1.3, marginTop: width * 0.025, maxWidth: frameW * 0.95 }}>{brief.oneLine}</div>
      </>
    )
  }

  const showPicture = kind !== "list" || story
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <Background accent={brief.accent} />
      <AbsoluteFill style={{ padding: pad, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div style={showPicture ? undefined : { flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start" }}>{top}</div>
        {showPicture && page && (
          // the picture takes whatever room the words leave, and is cut off at the bottom edge
          <div style={{ position: "relative", flex: 1, margin: `${width * 0.05}px 0 ${width * 0.04}px`, overflow: story ? "visible" : "hidden", display: "flex", alignItems: story ? "center" : "flex-start" }}>
            <BrowserFrame src={assetBase + page.shot} url={page.url} width={frameW} height={frameH} accent={brief.accent} />
            {story && (
              <PhoneFrame
                src={assetBase + page.mobile}
                height={width * 0.62}
                accent={brief.accent}
                style={{ position: "absolute", right: -width * 0.02, bottom: 0 }}
              />
            )}
          </div>
        )}
        {footer}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
