import React from "react"
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion"
import { Background, BrowserFrame, Chip, INK, MUTED, PhoneFrame, WordsIn, fontFamily, hostOf, useEdges } from "./parts"
import { FPS, type Props } from "./types"

// The brag video: hook, name, what it does, a fast montage of the pages, then
// the link. Every scene length is a whole number of beats, so the cuts land on
// the music.

export const shortPlan = (p: Props) => {
  const beat = Math.round((FPS * 60) / (p.bpm ?? 100))
  const features = p.brief.features.filter(Boolean).slice(0, 3)
  const montage = Math.min(4, p.brief.pages.length)
  const scenes = [
    { id: "hook", len: beat * 4 },
    { id: "name", len: beat * 6 },
    ...features.map((_, i) => ({ id: `feature-${i}`, len: beat * 6 })),
    ...(montage > 1 ? [{ id: "montage", len: beat * 2 * montage }] : []),
    { id: "cta", len: beat * 8 },
  ]
  let at = 0
  const timed = scenes.map((s) => {
    const out = { ...s, from: at }
    at += s.len
    return out
  })
  return { beat, scenes: timed, total: at, features, montage }
}

const Hook: React.FC<Props & { len: number; beat: number }> = ({ brief, len, beat }) => {
  const { width } = useVideoConfig()
  const o = useEdges(len, 1, 4)
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: width * 0.08, opacity: o }}>
      <WordsIn text={brief.hook || "I built this."} size={width * 0.12} every={beat / 2} align="center" />
    </AbsoluteFill>
  )
}

const Name: React.FC<Props & { len: number }> = ({ brief, assetBase, len }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const o = useEdges(len, 1, 6)
  const s = spring({ frame, fps, config: { damping: 12, stiffness: 120 } })
  const sweep = interpolate(frame, [6, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })
  const tall = height > width
  const page = brief.pages[0]
  const rise = spring({ frame: frame - 10, fps, config: { damping: 16 } })
  return (
    <AbsoluteFill style={{ padding: width * 0.08, opacity: o, justifyContent: tall ? "flex-start" : "center", paddingTop: tall ? height * 0.12 : undefined }}>
      <div style={{ transform: `scale(${0.85 + s * 0.15})`, transformOrigin: "left center", opacity: s }}>
        <div style={{ fontSize: width * 0.13, fontWeight: 800, color: INK, letterSpacing: -5, lineHeight: 1 }}>{brief.name}</div>
        <div style={{ height: width * 0.012, width: `${sweep * 60}%`, background: brief.accent, borderRadius: 99, marginTop: width * 0.025, boxShadow: `0 0 30px ${brief.accent}` }} />
      </div>
      <div style={{ marginTop: width * 0.04, fontSize: width * 0.048, color: MUTED, lineHeight: 1.3, opacity: rise, transform: `translateY(${(1 - rise) * 30}px)` }}>
        {brief.oneLine}
      </div>
      {tall && page && (
        <div style={{ position: "absolute", left: width * 0.08, bottom: height * 0.08, transform: `translateY(${(1 - rise) * 200}px)`, opacity: rise }}>
          <BrowserFrame src={assetBase + page.shot} url={page.url} width={width * 0.84} height={width * 0.84 * 0.625} accent={brief.accent} />
        </div>
      )}
    </AbsoluteFill>
  )
}

const Feature: React.FC<Props & { len: number; i: number; total: number }> = ({ brief, assetBase, len, i, total }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const tall = height > width
  const o = useEdges(len, 1, 6)
  const pages = brief.pages
  const page = pages[(i + 1) % Math.max(1, pages.length)]
  const enter = spring({ frame: frame - 4, fps, config: { damping: 15 } })
  const zoom = interpolate(frame, [0, len], [1, 1.06])
  const frameW = width * (tall ? 0.84 : 0.8)
  return (
    <AbsoluteFill style={{ padding: width * 0.08, paddingTop: tall ? height * 0.1 : width * 0.08, opacity: o }}>
      <Chip accent={brief.accent} size={width * 0.03}>{`${i + 1} / ${total}`}</Chip>
      <div style={{ marginTop: width * 0.04 }}>
        <WordsIn text={brief.features[i]} size={width * (tall ? 0.085 : 0.07)} every={3} />
      </div>
      {page && (
        <div
          style={{
            position: "absolute",
            left: (width - frameW) / 2,
            bottom: tall ? height * 0.07 : -width * 0.12,
            transform: `translateY(${(1 - enter) * height * 0.4}px) scale(${zoom})`,
            transformOrigin: "center bottom",
          }}
        >
          <BrowserFrame src={assetBase + page.shot} url={page.url} width={frameW} height={frameW * 0.625} accent={brief.accent} />
          {tall && (
            <PhoneFrame src={assetBase + page.mobile} height={width * 0.55} accent={brief.accent} style={{ position: "absolute", right: -width * 0.04, bottom: -width * 0.05 }} />
          )}
        </div>
      )}
    </AbsoluteFill>
  )
}

// Quick cuts through the pages, one every two beats, each with a small push in.
const Montage: React.FC<Props & { len: number; beat: number; count: number }> = ({ brief, assetBase, beat, count }) => {
  const frame = useCurrentFrame()
  const { width, height } = useVideoConfig()
  const tall = height > width
  const i = Math.min(count - 1, Math.floor(frame / (beat * 2)))
  const local = frame - i * beat * 2
  const page = brief.pages[i]
  const push = interpolate(local, [0, beat * 2], [1.08, 1])
  const flash = interpolate(local, [0, 3], [0.5, 0], { extrapolateRight: "clamp" })
  const frameW = width * (tall ? 0.9 : 0.84)
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ transform: `scale(${push})` }}>
        {tall ? (
          <PhoneFrame src={assetBase + page.mobile} height={height * 0.72} accent={brief.accent} />
        ) : (
          <BrowserFrame src={assetBase + page.shot} url={page.url} width={frameW} height={frameW * 0.625} accent={brief.accent} />
        )}
      </div>
      <div style={{ position: "absolute", top: tall ? height * 0.05 : width * 0.03, left: width * 0.06 }}>
        <Chip accent={brief.accent} size={width * 0.03}>{page.title}</Chip>
      </div>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  )
}

const Cta: React.FC<Props & { len: number }> = ({ brief, len }) => {
  const frame = useCurrentFrame()
  const { fps, width } = useVideoConfig()
  const o = useEdges(len, 1, 14)
  const s = spring({ frame: frame - 8, fps, config: { damping: 14 } })
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: width * 0.08, opacity: o, textAlign: "center" }}>
      <WordsIn text="Try it" size={width * 0.09} align="center" />
      <div
        style={{
          marginTop: width * 0.04,
          padding: `${width * 0.025}px ${width * 0.05}px`,
          borderRadius: 999,
          background: brief.accent,
          color: "#fff",
          fontWeight: 800,
          fontSize: width * 0.055,
          transform: `scale(${s})`,
          boxShadow: `0 0 ${width * 0.06}px ${brief.accent}`,
        }}
      >
        {hostOf(brief.website)}
      </div>
      {brief.handle && <div style={{ marginTop: width * 0.05, color: MUTED, fontSize: width * 0.035, opacity: s }}>{brief.handle}</div>}
    </AbsoluteFill>
  )
}

export const Short: React.FC<Props> = (p) => {
  const plan = shortPlan(p)
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <Background accent={p.brief.accent} />
      {p.music && <Audio src={p.music} />}
      {plan.scenes.map((s) => (
        <Sequence key={s.id} from={s.from} durationInFrames={s.len}>
          {s.id === "hook" && <Hook {...p} len={s.len} beat={plan.beat} />}
          {s.id === "name" && <Name {...p} len={s.len} />}
          {s.id.startsWith("feature-") && <Feature {...p} len={s.len} i={Number(s.id.slice(8))} total={plan.features.length} />}
          {s.id === "montage" && <Montage {...p} len={s.len} beat={plan.beat} count={plan.montage} />}
          {s.id === "cta" && <Cta {...p} len={s.len} />}
        </Sequence>
      ))}
    </AbsoluteFill>
  )
}
