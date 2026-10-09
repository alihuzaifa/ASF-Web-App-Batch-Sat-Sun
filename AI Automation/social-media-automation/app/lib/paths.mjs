// Where everything lives. Kept in one place so the server, the renderer and the
// uploader never disagree about a folder.

import path from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
export const DATA = path.join(ROOT, "data")
export const PROJECTS = path.join(DATA, "projects")
export const MUSIC = path.join(DATA, "music")
export const STAGE = path.join(DATA, "publish")
export const POSTS = path.join(DATA, "posts.json")
export const OUTPUT = path.join(ROOT, "output")
export const ENV_FILE = path.join(ROOT, ".env.local")
export const UI = path.join(ROOT, "app", "ui")
export const VIDEO_ENTRY = path.join(ROOT, "video", "index.ts")

export const PORT = Number(process.env.PORT || 4545)
export const BASE = `http://localhost:${PORT}`
