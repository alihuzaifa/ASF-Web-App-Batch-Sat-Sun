import React from "react"
import { AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion"
import { Background, BrowserFrame, Chip, INK, MUTED, WordsIn, fontFamily, hostOf, useEdges } from "./parts"
import { FPS, SIZES, type Props } from "./types"

// The long video: an intro, the person's own screen recording if they added one,
// then every page scrolled from top to bottom inside a browser window, what it
// does, and the link. Long enough for YouTube, LinkedIn and Facebook.

const SCROLL_PX_PER_SEC = 320
const HOLD_TOP = 1.4
const HOLD_END = 1
const MAX_PAGE = 24

const frameBox = (p: Props) => {
  const { width, height } = SIZES[p.shape]
  const tall = height > width
  const w = tall ? width * 0.92 : width * 0.8
  const bar = Math.round(w * 0.04)
  const h = tall ? height * 0.72 : height * 0.8 - bar
  return { w, h, bar, tall }
}

export const tourPlan = (p: Props) => {
  const { w, h } = frameBox(p)
  const viewPx = h / (w / 1440)
  const scenes: { id: string; len: number; from: number; page?: number; scroll?: number }[] = []
  let at = 0
  const push = (id: string, secs: number, extra = {}) => {
    const len = Math.round(secs * FPS)
    scenes.push({ id, len, from: at, ...extra })
    at += len
  }
  push("intro", 4.5)
  if (p.recording) push("recording", p.recording.seconds + 1)
  p.brief.pages.forEach((pg, i) => {
    const travel = Math.max(0, pg.fullHeight - viewPx)
    const secs = Math.min(MAX_PAGE, HOLD_TOP + travel / SCROLL_PX_PER_SEC + HOLD_END)
    push(`page-${i}`, secs, { page: i, scroll: travel })
  })
  if (p.brief.features.filter(Boolean).length) push("features", 2 + p.brief.features.filter(Boolean).length * 1.6)
  push("outro", 5)
  return { scenes, total: at }
}

const Intro: React.FC<Props & { len: number }> = ({ brief, len }) => {
  const { width } = useVideoConfig()
  const o = useEdges(len, 10, 10)
  const big = Math.min(width, 1300)
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: width * 0.08, opacity: o }}>
      <Chip accent={brief.accent} size={big * 0.026}>A quick tour</Chip>
      <div style={{ marginTop: big * 0.03 }}>
        <WordsIn text={brief.name} size={big * 0.11} every={5} />
      </div>
      <div style={{ marginTop: big * 0.02, color: MUTED, fontSize: big * 0.04, lineHeight: 1.3, maxWidth: width * 0.8 }}>{brief.oneLine}</div>
    </AbsoluteFill>
  )
}

const PageScroll: React.FC<Props & { len: number; i: number; travel: number; count: number }> = (p) => {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const { w, h, bar, tall } = frameBox(p)
  const page = p.brief.pages[p.i]
  const o = useEdges(p.len, 10, 10)
  const start = HOLD_TOP * FPS
  const end = p.len - HOLD_END * FPS
  const y = interpolate(frame, [start, end], [0, p.travel], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  })
  const label = Math.min(width, 1300) * 0.024
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <div style={{ position: "absolute", left: (width - w) / 2, top: tall ? height * 0.14 : (height - h - bar) / 2 + label }}>
        <BrowserFrame src={p.assetBase + page.full} url={page.url} width={w} height={h} scrollY={y} accent={p.brief.accent} />
      </div>
      <div style={{ position: "absolute", left: (width - w) / 2, top: tall ? height * 0.06 : label * 0.6 }}>
        <Chip accent={p.brief.accent} size={label}>{`${p.i + 1} / ${p.count} · ${page.title}`}</Chip>
      </div>
    </AbsoluteFill>
  )
}

const Recording: React.FC<Props & { len: number }> = (p) => {
  const { width, height } = useVideoConfig()
  const { w, h, bar, tall } = frameBox(p)
  const o = useEdges(p.len, 10, 10)
  const label = Math.min(width, 1300) * 0.024
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <div
        style={{
          position: "absolute",
          left: (width - w) / 2,
          top: tall ? height * 0.14 : (height - h - bar) / 2 + label,
          width: w,
          height: h + bar,
          borderRadius: bar * 0.45,
          overflow: "hidden",
          background: "#000",
          border: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <OffthreadVideo src={p.recording!.url} volume={0} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
      <div style={{ position: "absolute", left: (width - w) / 2, top: tall ? height * 0.06 : label * 0.6 }}>
        <Chip accent={p.brief.accent} size={label}>See it in use</Chip>
      </div>
    </AbsoluteFill>
  )
}

const Features: React.FC<Props & { len: number }> = ({ brief, len }) => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()
  const o = useEdges(len, 10, 10)
  const big = Math.min(width, 1300)
  const list = brief.features.filter(Boolean)
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: width * 0.09, opacity: o }}>
      <div style={{ fontSize: big * 0.06, fontWeight: 800, color: INK, letterSpacing: -2, marginBottom: big * 0.035 }}>What it does</div>
      {list.map((f, i) => {
        const t = interpolate(frame, [30 + i * 48, 42 + i * 48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
        return (
          <div key={i} style={{ display: "flex", gap: big * 0.02, alignItems: "center", marginBottom: big * 0.025, opacity: t, transform: `translateX(${(1 - t) * 40}px)` }}>
            <span style={{ width: big * 0.035, height: big * 0.035, borderRadius: 99, background: brief.accent, color: "#fff", fontWeight: 800, fontSize: big * 0.022, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              ✓
            </span>
            <span style={{ color: INK, fontSize: big * 0.038, fontWeight: 600 }}>{f}</span>
          </div>
        )
      })}
    </AbsoluteFill>
  )
}

const Outro: React.FC<Props & { len: number }> = ({ brief, len }) => {
  const { width } = useVideoConfig()
  const o = useEdges(len, 10, 20)
  const big = Math.min(width, 1300)
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", opacity: o }}>
      <WordsIn text="Try it yourself" size={big * 0.075} align="center" />
      <div style={{ marginTop: big * 0.035, padding: `${big * 0.018}px ${big * 0.045}px`, borderRadius: 999, background: brief.accent, color: "#fff", fontWeight: 800, fontSize: big * 0.045, boxShadow: `0 0 ${big * 0.05}px ${brief.accent}` }}>
        {hostOf(brief.website)}
      </div>
      {brief.handle && <div style={{ marginTop: big * 0.035, color: MUTED, fontSize: big * 0.03 }}>{brief.handle}</div>}
    </AbsoluteFill>
  )
}

export const Tour: React.FC<Props> = (p) => {
  const plan = tourPlan(p)
  const count = p.brief.pages.length
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <Background accent={p.brief.accent} />
      {p.music && <Audio src={p.music} volume={0.7} />}
      {plan.scenes.map((s) => (
        <Sequence key={s.id} from={s.from} durationInFrames={s.len}>
          {s.id === "intro" && <Intro {...p} len={s.len} />}
          {s.id === "recording" && <Recording {...p} len={s.len} />}
          {s.id.startsWith("page-") && <PageScroll {...p} len={s.len} i={s.page!} travel={s.scroll!} count={count} />}
          {s.id === "features" && <Features {...p} len={s.len} />}
          {s.id === "outro" && <Outro {...p} len={s.len} />}
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}
