import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { COLORS, FONTS, GRADIENT, LAYOUT, RADIUS } from '../theme';
import { PROFILE } from '../brand';
import { IMAGE } from '../image.config';
import { MeshBackground } from './MeshBackground';
import { Identity } from './Identity';
import { u, headlineUnits, bodyUnits, pointUnits, blockHeight, splitPhrase } from './_util';

type Props = typeof IMAGE;

/** The headline, with one phrase painted in the brand gradient. */
const Headline: React.FC<{ text: string; phrase: string; size: number }> = ({
  text,
  phrase,
  size,
}) => {
  const { before, hit, after } = splitPhrase(text, phrase);
  return (
    <div
      style={{
        fontSize: size,
        lineHeight: 1.06,
        fontWeight: FONTS.heading,
        letterSpacing: FONTS.letterSpacingHeading,
        color: COLORS.text,
      }}
    >
      {before}
      <span
        style={{
          backgroundImage: GRADIENT.brand,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        }}
      >
        {hit}
      </span>
      {after}
    </div>
  );
};

export const StudioImage: React.FC<Props> = (props) => {
  const p = { ...IMAGE, ...props };
  const { width, height } = useVideoConfig();
  const U = (n: number) => u(width, height, n);

  const tags = p.footerTags.length ? p.footerTags : PROFILE.tags;
  const sub = splitPhrase(p.subhead, p.subheadAccent);

  /** The three bands of the card, in pixels. The name row and the footer are
   *  fixed, so the space left for the copy is arithmetic. */
  const identityBand = U(104);
  const footerBand = U(88);
  const gap = U(LAYOUT.gap);
  const column = width - U(LAYOUT.padX) * 2;
  const contentBand = height - U(LAYOUT.padY) * 2 - identityBand - footerBand - gap * 2;

  /** Type sizes before fitting. */
  const base = {
    eyebrow: U(24),
    headline: U(headlineUnits(p.headline)),
    quote: U(52),
    sub: U(36),
    body: U(bodyUnits(p.body)),
    point: U(pointUnits(p.points.length)),
    statValue: U(128),
    statLabel: U(30),
    showLabel: U(21),
    showValue: U(30),
  };

  /** What the chosen card will need, estimated from the copy itself rather than
   *  measured in the browser: a measurement taken while the composition is
   *  still being laid out reads zero, and a card silently rendered at the
   *  minimum size is worse than one that is a little conservative. */
  const needed = (() => {
    let h = p.eyebrow ? base.eyebrow * 1.3 + gap : 0;
    if (p.kind === 'quote') {
      h += blockHeight(p.quote, base.quote, column - U(42), 1.18, 0.52) + gap;
      h += base.sub * 1.3;
      return h;
    }
    h += blockHeight(p.headline, base.headline, column, 1.06, 0.52);
    if (p.subhead) h += gap + blockHeight(p.subhead, base.sub, column, 1.34);
    if (p.kind === 'insight') h += gap + blockHeight(p.body, base.body, column, 1.46);
    if (p.kind === 'list') {
      const rows = p.points.slice(0, 5);
      h += gap + rows.length * (base.point * 1.32 + U(48)) + (rows.length - 1) * U(20);
    }
    if (p.kind === 'stat') h += gap + base.statValue * 1.05 + base.statLabel * 1.36 + U(100);
    if (p.kind === 'showcase') {
      const rows = [p.showcase.what, p.showcase.built, p.showcase.learned, p.showcase.project];
      h += gap + rows.reduce((n, r) => n + base.showLabel * 1.3 + blockHeight(r, base.showValue, column - U(26), 1.34) + U(6), 0) + 3 * U(18);
    }
    return h;
  })();

  /** One factor, applied to every size on the card, so a long brief comes out
   *  smaller rather than clipped — and a short one is never blown up. */
  const fit = Math.min(1, contentBand / Math.max(needed, 1));
  const S = (n: number) => n * fit;

  const headSize = S(base.headline);
  const subSize = S(base.sub);
  const bodySize = S(base.body);

  return (
    <AbsoluteFill style={{ fontFamily: FONTS.family, backgroundColor: COLORS.bg }}>
      <MeshBackground still />

      <AbsoluteFill
        style={{
          padding: `${U(LAYOUT.padY)}px ${U(LAYOUT.padX)}px`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ height: identityBand, display: 'flex', alignItems: 'center' }}>
          <Identity width={width} height={height} />
        </div>

        {/* everything between the name row and the footer */}
        <div
          style={{
            height: contentBand,
            marginTop: gap,
            marginBottom: gap,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: S(gap) }}>
              {p.eyebrow ? (
                <div
                  style={{
                    fontSize: S(base.eyebrow),
                    fontWeight: FONTS.heading,
                    letterSpacing: '0.24em',
                    textTransform: 'uppercase',
                    color: COLORS.accent,
                  }}
                >
                  {p.eyebrow}
                </div>
              ) : null}

              {p.kind === 'quote' ? (
                <>
                  <div
                    style={{
                      fontSize: S(base.quote),
                      lineHeight: 1.18,
                      fontWeight: FONTS.heading,
                      letterSpacing: FONTS.letterSpacingHeading,
                      color: COLORS.text,
                      borderLeft: `${S(U(8))}px solid ${COLORS.accent}`,
                      paddingLeft: S(U(34)),
                    }}
                  >
                    {p.quote}
                  </div>
                  <div style={{ fontSize: subSize, color: COLORS.dim, fontWeight: FONTS.medium }}>
                    {PROFILE.name}
                  </div>
                </>
              ) : (
                <Headline text={p.headline} phrase={p.keyPhrase} size={headSize} />
              )}

              {p.kind !== 'quote' && p.subhead ? (
                <div
                  style={{
                    fontSize: subSize,
                    lineHeight: 1.34,
                    fontWeight: FONTS.medium,
                    color: COLORS.textSecondary,
                  }}
                >
                  {sub.before}
                  <span style={{ color: COLORS.accent }}>{sub.hit}</span>
                  {sub.after}
                </div>
              ) : null}

              {p.kind === 'insight' ? (
                <div
                  style={{
                    fontSize: bodySize,
                    lineHeight: 1.46,
                    color: COLORS.textSecondary,
                    fontWeight: FONTS.body,
                  }}
                >
                  {p.body}
                </div>
              ) : null}

              {p.kind === 'list' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S(U(20)) }}>
                  {p.points.slice(0, 5).map((point, i) => (
                    <div
                      key={point}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: S(U(24)),
                        padding: `${S(U(24))}px ${S(U(28))}px`,
                        borderRadius: RADIUS.lg,
                        backgroundColor: COLORS.card,
                        border: `1px solid ${COLORS.border}`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: S(base.point),
                          fontWeight: FONTS.heading,
                          color: COLORS.accent,
                          minWidth: S(U(40)),
                        }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <div
                        style={{
                          fontSize: S(base.point),
                          lineHeight: 1.32,
                          color: COLORS.text,
                          fontWeight: FONTS.medium,
                        }}
                      >
                        {point}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {p.kind === 'stat' ? (
                <div
                  style={{
                    padding: S(U(44)),
                    borderRadius: RADIUS.xl,
                    backgroundColor: COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: U(12),
                  }}
                >
                  <div
                    style={{
                      fontSize: S(base.statValue),
                      lineHeight: 1,
                      fontWeight: FONTS.heading,
                      letterSpacing: FONTS.letterSpacingHeading,
                      backgroundImage: GRADIENT.brand,
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      color: 'transparent',
                    }}
                  >
                    {p.stat.value}
                  </div>
                  <div style={{ fontSize: S(base.statLabel), color: COLORS.textSecondary, lineHeight: 1.36 }}>
                    {p.stat.label}
                  </div>
                </div>
              ) : null}

              {p.kind === 'showcase' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: S(U(18)) }}>
                  {[
                    ['Project', p.showcase.project],
                    ['What it does', p.showcase.what],
                    ['Built with', p.showcase.built],
                    ['What it taught me', p.showcase.learned],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: S(U(6)),
                        paddingLeft: S(U(26)),
                        borderLeft: `${S(U(5))}px solid ${COLORS.accent}55`,
                      }}
                    >
                      <div
                        style={{
                          fontSize: S(base.showLabel),
                          letterSpacing: '0.18em',
                          textTransform: 'uppercase',
                          color: COLORS.dim,
                          fontWeight: FONTS.semibold,
                        }}
                      >
                        {label}
                      </div>
                      <div style={{ fontSize: S(base.showValue), color: COLORS.text, lineHeight: 1.34 }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
        </div>

        <div
          style={{
            height: footerBand,
            borderTop: `1px solid ${COLORS.border}`,
            paddingTop: U(28),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: U(28),
          }}
        >
          <div style={{ color: COLORS.dim, fontWeight: FONTS.medium }}>{tags.join(' · ')}</div>
          <div style={{ color: COLORS.accent, fontWeight: FONTS.semibold }}>
            {PROFILE.footerRight} ↗
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
