// Every file location in one place. The JF_* variables exist so tests can run against a temp folder
// and never touch your real data; normal use never sets them.
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const fromEnv = (name: string, fallback: string) => (process.env[name] ? resolve(process.env[name]!) : fallback);

export const DATA_DIR = fromEnv("JF_DATA_DIR", join(ROOT, "data"));
export const JOBS_PATH = join(DATA_DIR, "jobs.json");
export const CVS_DIR = join(DATA_DIR, "cvs");
export const ACCOUNT_PROFILE_DIR = join(DATA_DIR, "browser-profile");
export const LOG_DIR = fromEnv("JF_LOG_DIR", join(ROOT, "logs"));
export const PROFILE_PATH = fromEnv("JF_PROFILE_PATH", join(ROOT, "config", "profile.json"));
export const MASTER_CV_PATH = fromEnv("JF_CV_PATH", join(ROOT, "profile", "master-cv.md"));
export const PROMPTS_DIR = join(ROOT, "prompts");
