export type Page = {
  title: string
  url: string
  shot: string
  full: string
  mobile: string
  fullHeight: number
}

export type Brief = {
  name: string
  oneLine: string
  forWho: string
  features: string[]
  hook: string
  handle: string
  website: string
  accent: string
  pages: Page[]
}

export type Shape = "square" | "portrait" | "story" | "wide"

export type Props = {
  brief: Brief
  // http://localhost:4545/files/projects/<slug>/ - the server hands the pictures over http
  assetBase: string
  shape: Shape
  kind?: "launch" | "feature" | "list"
  featureIndex?: number
  music?: string
  bpm?: number
  recording?: { url: string; seconds: number } | null
}

export const SIZES: Record<Shape, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  wide: { width: 1920, height: 1080 },
}

export const FPS = 30
