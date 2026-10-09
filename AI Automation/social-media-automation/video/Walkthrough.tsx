import React from "react"
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion"
import { Background, Chip, INK, MUTED, WordsIn, fontFamily, useEdges } from "./parts"
import { FPS } from "./types"

// The keys video built from real screenshots of Buffer and Cloudflare. Each step
// is one screenshot: it pushes in on the thing to click, the rest of the page
// dims, a cursor moves there and clicks, and the step is written underneath.
// Keys, tokens and personal details were blurred or covered before the
// screenshots were saved (scripts/capture-walkthrough.mjs).

const ACCENT = "#4f46e5"

export type Box = { x: number; y: number; w: number; h: number }
export type WalkScene =
  | { kind: "title"; title: string; sub: string; secs: number }
  | { kind: "section"; label: string; title: string; sub: string; secs: number }
  | { kind: "shot"; file: string; width: number; height: number; boxes: Box[]; n: string; title: string; note?: string; secs: number }

export type WalkProps = { scenes: WalkScene[]; music?: string }

export const walkLength = (p: WalkProps) => p.scenes.reduce((n, s) => n + Math.round(s.secs * FPS), 0)

const union = (boxes: Box[]) => {
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y }
}

const Cursor: React.FC<{ x: number; y: number; click: number }> = ({ x, y, click }) => (
  <div style={{ position: "absolute", left: x, top: y, width: 0, height: 0 }}>
    {click > 0 && click < 1 && (
      <div
        style={{
          position: "absolute",
          left: -40 * click,
          top: -40 * click,
          width: 80 * click,
          height: 80 * click,
          borderRadius: 99,
          border: `4px solid ${ACCENT}`,
          opacity: 1 - click,
        }}
      />
    )}
    <svg width="34" height="40" viewBox="0 0 17 20" style={{ position: "absolute", left: -3, top: -2, filter: "drop-shadow(0 2px 3px rgba(0,0,0,.45))" }}>
      <path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" fill="#fff" stroke="#111" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  </div>
)

const Shot: React.FC<{ scene: Extract<WalkScene, { kind: "shot" }>; len: number }> = ({ scene, len }) => {
  const frame = useCurrentFrame()
  const { width, height, fps } = useVideoConfig()
  const o = useEdges(len, 8, 8)
  const caption = 150
  const areaH = height - caption
  // the screenshot fills the width above the caption bar
  const fit = Math.min(width / scene.width, areaH / scene.height)
  const imgW = scene.width * fit
  const imgH = scene.height * fit
  const left = (width - imgW) / 2
  const top = (areaH - imgH) / 2

  const u = scene.boxes.length ? union(scene.boxes) : { x: scene.width / 2, y: scene.height / 2, w: 0, h: 0 }
  const cx = (u.x + u.w / 2) * fit
  const cy = (u.y + u.h / 2) * fit
  // push in on small targets, less on big ones
  const zoomTo = Math.max(1, Math.min(1.7, (scene.width * 0.45) / Math.max(u.w, 160)))
  const z = interpolate(frame, [10, 40], [1, zoomTo], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) })
  // keep the target on screen while zoomed: move the zoom origin toward it
  const ox = Math.max(0, Math.min(imgW, cx))
  const oy = Math.max(0, Math.min(imgH, cy))

  const dim = interpolate(frame, [18, 34], [0, 0.55], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  const ring = spring({ frame: frame - 24, fps, config: { damping: 12 } })
  const pulse = 1 + 0.04 * Math.sin(frame / 5)

  const last = scene.boxes[scene.boxes.length - 1]
  const tx = last ? (last.x + last.w / 2) * fit : imgW / 2
  const ty = last ? (last.y + last.h / 2) * fit : imgH / 2
  const move = interpolate(frame, [30, 58], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) })
  const curX = interpolate(move, [0, 1], [imgW * 0.82, tx])
  const curY = interpolate(move, [0, 1], [imgH * 0.9, ty])
  const click = interpolate(frame, [60, 78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })

  const cap = spring({ frame: frame - 4, fps, config: { damping: 16 } })
  return (
    <AbsoluteFill style={{ opacity: o, background: "#0a0b10" }}>
      <div style={{ position: "absolute", left, top, width: imgW, height: imgH, overflow: "hidden", borderRadius: 10 }}>
        <div style={{ position: "absolute", inset: 0, transform: `scale(${z})`, transformOrigin: `${ox}px ${oy}px` }}>
          <Img src={staticFile(scene.file)} style={{ width: imgW, height: imgH, display: "block" }} />
          {/* the dimming: the whole picture except a hole over every highlighted box */}
          <svg width={imgW} height={imgH} style={{ position: "absolute", left: 0, top: 0 }}>
            <mask id={`holes-${scene.file}`}>
              <rect width={imgW} height={imgH} fill="white" />
              {scene.boxes.map((b, i) => (
                <rect key={i} x={b.x * fit - 8} y={b.y * fit - 8} width={b.w * fit + 16} height={b.h * fit + 16} rx={10} fill="black" />
              ))}
            </mask>
            <rect width={imgW} height={imgH} fill={`rgba(10,11,16,${dim})`} mask={`url(#holes-${scene.file})`} />
          </svg>
          {scene.boxes.map((b, i) => {
            const pad = 8
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: b.x * fit - pad,
                  top: b.y * fit - pad,
                  width: b.w * fit + pad * 2,
                  height: b.h * fit + pad * 2,
                  borderRadius: 10,
                  border: `4px solid ${ACCENT}`,
                  boxShadow: `0 0 24px ${ACCENT}`,
                  opacity: ring,
                  transform: `scale(${ring * pulse})`,
                }}
              />
            )
          })}
          <Cursor x={curX} y={curY} click={click} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: caption,
          display: "flex",
          alignItems: "center",
          gap: 30,
          padding: "0 70px",
          background: "#0f1117",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          transform: `translateY(${(1 - cap) * caption}px)`,
        }}
      >
        <span style={{ flex: "none", width: 76, height: 76, borderRadius: 99, background: ACCENT, color: "#fff", fontSize: 40, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {scene.n}
        </span>
        <div>
          <div style={{ color: INK, fontSize: 46, fontWeight: 800, letterSpacing: -1 }}>{scene.title}</div>
          {scene.note && <div style={{ color: "#fcd34d", fontSize: 28, marginTop: 6 }}>{scene.note}</div>}
        </div>
      </div>
    </AbsoluteFill>
  )
}

const Card: React.FC<{ scene: Exclude<WalkScene, { kind: "shot" }>; len: number }> = ({ scene, len }) => {
  const o = useEdges(len, 8, 8)
  if (scene.kind === "title")
    return (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: 160, opacity: o }}>
        <WordsIn text={scene.title} size={120} align="center" every={5} />
        <div style={{ marginTop: 36, color: MUTED, fontSize: 44, lineHeight: 1.35 }}>{scene.sub}</div>
      </AbsoluteFill>
    )
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: 160, opacity: o }}>
      <Chip accent={ACCENT} size={34}>{scene.label}</Chip>
      <div style={{ marginTop: 30 }}>
        <WordsIn text={scene.title} size={130} every={5} />
      </div>
      <div style={{ marginTop: 30, color: MUTED, fontSize: 44, lineHeight: 1.35, maxWidth: 1450 }}>{scene.sub}</div>
    </AbsoluteFill>
  )
}

export const Walkthrough: React.FC<WalkProps> = ({ scenes, music }) => {
  let at = 0
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <Background accent={ACCENT} />
      {music && <Audio src={staticFile(music)} volume={0.5} />}
      {scenes.map((scene, i) => {
        const len = Math.round(scene.secs * FPS)
        const from = at
        at += len
        return (
          <Sequence key={i} from={from} durationInFrames={len}>
            {scene.kind === "shot" ? <Shot scene={scene} len={len} /> : <Card scene={scene} len={len} />}
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
