import React from "react"
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { loadFont } from "@remotion/google-fonts/Inter"

export const { fontFamily } = loadFont("normal", { weights: ["400", "600", "800"], subsets: ["latin"] })

export const INK = "#f4f5f8"
export const MUTED = "#a2a7b8"
export const BG = "#0a0b10"

export const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "")
  } catch {
    return url
  }
}

/** Dark background with two slow-moving glows in the project's colour. */
export const Background: React.FC<{ accent: string }> = ({ accent }) => {
  const frame = useCurrentFrame()
  const a = Math.sin(frame / 90) * 8
  const b = Math.cos(frame / 110) * 8
  return (
    <AbsoluteFill style={{ background: BG }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 50% at ${20 + a}% ${15 + b}%, ${accent}55 0%, transparent 70%),
                       radial-gradient(50% 45% at ${85 - b}% ${90 - a}%, ${accent}33 0%, transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(70% 70% at 50% 40%, black, transparent)",
        }}
      />
    </AbsoluteFill>
  )
}

export const Chip: React.FC<{ accent: string; children: React.ReactNode; size?: number }> = ({ accent, children, size = 26 }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: size * 0.45,
      padding: `${size * 0.35}px ${size * 0.8}px`,
      borderRadius: 999,
      background: `${accent}22`,
      border: `1px solid ${accent}88`,
      color: INK,
      fontSize: size,
      fontWeight: 600,
      letterSpacing: 0.3,
      alignSelf: "flex-start",
      width: "fit-content",
    }}
  >
    <span style={{ width: size * 0.4, height: size * 0.4, borderRadius: 99, background: accent, boxShadow: `0 0 ${size}px ${accent}` }} />
    {children}
  </div>
)

/**
 * A browser window around a screenshot. `scrollY` is in screenshot pixels, so the
 * long video can scroll a full-page picture inside it.
 */
export const BrowserFrame: React.FC<{
  src: string
  width: number
  height: number
  url: string
  accent: string
  scrollY?: number
  imageWidth?: number
  style?: React.CSSProperties
}> = ({ src, width, height, url, accent, scrollY = 0, imageWidth = 1440, style }) => {
  const bar = Math.round(width * 0.04)
  const scale = width / imageWidth
  return (
    <div
      style={{
        width,
        height: height + bar,
        borderRadius: bar * 0.45,
        overflow: "hidden",
        background: "#15171f",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: `0 ${bar}px ${bar * 3}px rgba(0,0,0,0.55), 0 0 ${bar * 2}px ${accent}33`,
        ...style,
      }}
    >
      <div style={{ height: bar, display: "flex", alignItems: "center", gap: bar * 0.22, padding: `0 ${bar * 0.4}px`, background: "#1c1f29" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <span key={c} style={{ width: bar * 0.26, height: bar * 0.26, borderRadius: 99, background: c }} />
        ))}
        <div
          style={{
            marginLeft: bar * 0.4,
            flex: 1,
            height: bar * 0.56,
            borderRadius: bar * 0.3,
            background: "#0f1117",
            color: MUTED,
            fontSize: bar * 0.32,
            display: "flex",
            alignItems: "center",
            paddingLeft: bar * 0.35,
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {hostOf(url)}
          {(() => {
            try {
              const p = new URL(url).pathname
              return p === "/" ? "" : p
            } catch {
              return ""
            }
          })()}
        </div>
      </div>
      <div style={{ width, height, overflow: "hidden", position: "relative", background: "#fff" }}>
        <Img src={src} style={{ position: "absolute", top: -scrollY * scale, left: 0, width }} />
      </div>
    </div>
  )
}

export const PhoneFrame: React.FC<{ src: string; height: number; accent: string; style?: React.CSSProperties }> = ({ src, height, accent, style }) => {
  const width = height * (390 / 844)
  const edge = height * 0.018
  return (
    <div
      style={{
        width: width + edge * 2,
        height: height + edge * 2,
        padding: edge,
        borderRadius: height * 0.075,
        background: "#05060a",
        border: "2px solid rgba(255,255,255,0.18)",
        boxShadow: `0 ${height * 0.04}px ${height * 0.1}px rgba(0,0,0,0.6), 0 0 ${height * 0.06}px ${accent}44`,
        ...style,
      }}
    >
      <div style={{ width, height, borderRadius: height * 0.06, overflow: "hidden", background: "#fff" }}>
        <Img src={src} style={{ width, height, objectFit: "cover", objectPosition: "top" }} />
      </div>
    </div>
  )
}

/** Words that pop in one after another. `every` is frames between words. */
export const WordsIn: React.FC<{ text: string; start?: number; every?: number; size: number; weight?: number; color?: string; align?: "left" | "center" }> = ({
  text,
  start = 0,
  every = 4,
  size,
  weight = 800,
  color = INK,
  align = "left",
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const words = text.split(/\s+/).filter(Boolean)
  return (
    <div style={{ fontSize: size, fontWeight: weight, color, lineHeight: 1.08, letterSpacing: -size * 0.025, textAlign: align }}>
      {words.map((w, i) => {
        const s = spring({ frame: frame - start - i * every, fps, config: { damping: 14, stiffness: 160 } })
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: size * 0.25,
              opacity: s,
              transform: `translateY(${(1 - s) * size * 0.5}px) scale(${0.9 + s * 0.1})`,
            }}
          >
            {w}
          </span>
        )
      })}
    </div>
  )
}

/** Fade a scene in and out at its edges. */
export const useEdges = (duration: number, inFrames = 8, outFrames = 8) => {
  const frame = useCurrentFrame()
  return interpolate(frame, [0, inFrames, duration - outFrames, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  })
}
