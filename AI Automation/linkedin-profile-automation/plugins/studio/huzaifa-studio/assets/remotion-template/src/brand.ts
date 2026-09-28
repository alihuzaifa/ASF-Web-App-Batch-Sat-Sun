/**
 * The facts. Copy is written from this file and nowhere else — if a claim is
 * not in brand.profile.json, it does not go on a card.
 */
import profile from './brand.profile.json';

export const PROFILE = profile;

/** Initials for the avatar mark, from the profile (never invented). */
export const INITIALS =
  profile.initials ??
  profile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
