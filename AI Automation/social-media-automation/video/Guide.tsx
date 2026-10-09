import React from "react"
import { AbsoluteFill, Audio, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion"
import { Background, Chip, INK, MUTED, WordsIn, fontFamily, useEdges } from "./parts"
import { FPS } from "./types"

// The "where do the keys come from" video for students. Text and click paths
// only: no screenshots of Buffer or Cloudflare, so nothing goes stale when
// their dashboards change colour, and nothing pretends to be their screens.

const ACCENT = "#4f46e5"

type Step = { n?: string; title: string; path?: string[]; url?: string; note?: string }
type Scene =
  | { kind: "title"; title: string; sub: string; secs: number }
  | { kind: "section"; label: string; title: string; sub: string; secs: number }
  | { kind: "step"; step: Step; secs: number }

export const GUIDE: Scene[] = [
  { kind: "title", title: "Two keys. Five minutes.", sub: "Where to get what Social Media Automation asks for", secs: 4.5 },
  { kind: "section", label: "Key 1 of 2", title: "Buffer API key", sub: "Buffer is what posts to Instagram, Facebook, TikTok, YouTube, LinkedIn and X", secs: 4 },
  { kind: "step", step: { n: "1", title: "Make a free Buffer account", url: "buffer.com" }, secs: 4 },
  {
    kind: "step",
    step: { n: "2", title: "Connect the accounts you want to post to", path: ["Channels", "Connect a channel"], note: "Instagram must be a Business or Creator account. The free plan takes 3 accounts." },
    secs: 6,
  },
  { kind: "step", step: { n: "3", title: "Open the API page", url: "publish.buffer.com/settings/api" }, secs: 4.5 },
  { kind: "step", step: { n: "4", title: "Make a new key and copy it", path: ["New key", "any name", "Copy"] }, secs: 4.5 },
  { kind: "step", step: { n: "5", title: "Paste it in the app", path: ["Connect tab", "Buffer key"] }, secs: 4 },
  { kind: "section", label: "Key 2 of 2", title: "Cloudflare token", sub: "Cloudflare keeps your pictures and videos online so Buffer can fetch them. Free, no card.", secs: 4.5 },
  { kind: "step", step: { n: "1", title: "Make a free Cloudflare account", url: "dash.cloudflare.com/sign-up" }, secs: 4.5 },
  { kind: "step", step: { n: "2", title: "Open your API tokens", path: ["Your picture (top right)", "My Profile", "API Tokens"] }, secs: 5 },
  { kind: "step", step: { n: "3", title: "Start a custom token", path: ["Create Token", "Create Custom Token", "Get started"] }, secs: 5 },
  {
    kind: "step",
    step: { n: "4", title: "Give it one permission", path: ["Account", "Cloudflare Pages", "Edit"], note: "Name it anything. Add nothing else." },
    secs: 6,
  },
  {
    kind: "step",
    step: { n: "5", title: "Create it and copy it now", path: ["Continue to summary", "Create Token", "Copy"], note: "Cloudflare shows it only once. Lost it? Make a new one." },
    secs: 6,
  },
  { kind: "step", step: { n: "6", title: "Paste it in the app and press Check and save", path: ["Connect tab", "Cloudflare token", "Check and save"] }, secs: 5.5 },
  {
    kind: "section",
    label: "Keep them safe",
    title: "Your keys are passwords",
    sub: "They stay in .env.local on your computer. Never send that file to anyone, never put it on GitHub.",
    secs: 6,
  },
  { kind: "title", title: "That's it.", sub: "Next: Project tab, paste your website, then Make and schedule a week.", secs: 5 },
]

export const guideLength = () => GUIDE.reduce((n, s) => n + Math.round(s.secs * FPS), 0)

const PathChips: React.FC<{ path: string[]; start: number }> = ({ path, start }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18, marginTop: 44 }}>
      {path.map((p, i) => {
        const s = spring({ frame: frame - start - i * 9, fps, config: { damping: 15 } })
        return (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: MUTED, fontSize: 40, opacity: s }}>→</span>}
            <span
              style={{
                padding: "16px 28px",
                borderRadius: 14,
                background: i === path.length - 1 ? ACCENT : "rgba(255,255,255,0.08)",
                border: `1px solid ${i === path.length - 1 ? ACCENT : "rgba(255,255,255,0.18)"}`,
                color: INK,
                fontSize: 38,
                fontWeight: 600,
                opacity: s,
                transform: `translateY(${(1 - s) * 20}px)`,
              }}
            >
              {p}
            </span>
          </React.Fragment>
        )
      })}
    </div>
  )
}

const Url: React.FC<{ url: string; start: number }> = ({ url, start }) => {
  const frame = useCurrentFrame()
  const typed = Math.max(0, Math.min(url.length, Math.floor((frame - start) / 1.4)))
  return (
    <div
      style={{
        marginTop: 44,
        display: "inline-flex",
        alignItems: "center",
        gap: 18,
        padding: "20px 30px",
        borderRadius: 16,
        background: "#0f1117",
        border: "1px solid rgba(255,255,255,0.18)",
        color: INK,
        fontSize: 42,
        fontFamily: "ui-monospace, Consolas, monospace",
        minWidth: 900,
      }}
    >
      <span style={{ color: MUTED }}>https://</span>
      <span>
        {url.slice(0, typed)}
        <span style={{ opacity: frame % 30 < 15 ? 1 : 0, color: ACCENT }}>|</span>
      </span>
    </div>
  )
}

const SceneView: React.FC<{ scene: Scene; len: number }> = ({ scene, len }) => {
  const o = useEdges(len, 8, 8)
  if (scene.kind === "title")
    return (
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: 160, opacity: o }}>
        <WordsIn text={scene.title} size={120} align="center" every={5} />
        <div style={{ marginTop: 36, color: MUTED, fontSize: 44, lineHeight: 1.35 }}>{scene.sub}</div>
      </AbsoluteFill>
    )
  if (scene.kind === "section")
    return (
      <AbsoluteFill style={{ justifyContent: "center", padding: 160, opacity: o }}>
        <Chip accent={ACCENT} size={34}>{scene.label}</Chip>
        <div style={{ marginTop: 30 }}>
          <WordsIn text={scene.title} size={130} every={5} />
        </div>
        <div style={{ marginTop: 30, color: MUTED, fontSize: 44, lineHeight: 1.35, maxWidth: 1450 }}>{scene.sub}</div>
      </AbsoluteFill>
    )
  const { step } = scene
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: 160, opacity: o }}>
      <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
        <span
          style={{
            width: 110,
            height: 110,
            borderRadius: 99,
            background: ACCENT,
            color: "#fff",
            fontSize: 60,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
            boxShadow: `0 0 60px ${ACCENT}`,
          }}
        >
          {step.n}
        </span>
        <WordsIn text={step.title} size={80} every={3} />
      </div>
      <div style={{ paddingLeft: 146 }}>
        {step.url && <Url url={step.url} start={14} />}
        {step.path && <PathChips path={step.path} start={14} />}
        {step.note && <div style={{ marginTop: 40, color: "#fcd34d", fontSize: 38, lineHeight: 1.35, maxWidth: 1400 }}>{step.note}</div>}
      </div>
    </AbsoluteFill>
  )
}

// `music` is a file name inside the bundle's public folder (scripts/make-guide-video.mjs sets it)
export const Guide: React.FC<{ music?: string }> = ({ music }) => {
  let at = 0
  return (
    <AbsoluteFill style={{ fontFamily }}>
      <Background accent={ACCENT} />
      {music && <Audio src={staticFile(music)} volume={0.55} />}
      {GUIDE.map((scene, i) => {
        const len = Math.round(scene.secs * FPS)
        const from = at
        at += len
        return (
          <Sequence key={i} from={from} durationInFrames={len}>
            <SceneView scene={scene} len={len} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}
