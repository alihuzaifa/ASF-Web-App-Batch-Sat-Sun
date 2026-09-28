import React from 'react';
import { COLORS, FONTS } from '../theme';
import { PROFILE, INITIALS } from '../brand';
import { u } from './_util';

/**
 * The name row. It is the only place his identity is drawn, so a still and a
 * video are stamped the same way: initials in a ring, name, and the title on
 * the right only if he has actually published one.
 */
export const Identity: React.FC<{
  width: number;
  height: number;
  compact?: boolean;
}> = ({ width, height, compact = false }) => {
  const size = u(width, height, compact ? 76 : 92);
  const name = u(width, height, compact ? 34 : 40);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: u(width, height, 26) }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: `${Math.max(2, size * 0.035)}px solid ${COLORS.accent}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: COLORS.accent,
          fontSize: size * 0.42,
          fontWeight: FONTS.heading,
          letterSpacing: '0.01em',
          boxShadow: `0 0 ${size * 0.5}px ${COLORS.accent}33`,
          flexShrink: 0,
        }}
      >
        {INITIALS}
      </div>
      <div
        style={{
          fontSize: name,
          fontWeight: FONTS.heading,
          color: COLORS.text,
          letterSpacing: FONTS.letterSpacingHeading,
          whiteSpace: 'nowrap',
        }}
      >
        {PROFILE.name}
      </div>
      {/* The right of the row: his title if he has published one, otherwise the
          handle people can actually search for. Never an invented title. */}
      <div
        style={{
          marginLeft: 'auto',
          fontSize: name * (PROFILE.designation ? 0.8 : 0.66),
          fontWeight: FONTS.medium,
          color: COLORS.dim,
          whiteSpace: 'nowrap',
        }}
      >
        {PROFILE.designation ?? `@${PROFILE.handle}`}
      </div>
    </div>
  );
};
