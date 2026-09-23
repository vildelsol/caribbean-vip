/**
 * Palm fronds, drawn rather than photographed.
 *
 * The concierge screen was a flat fill, and a flat dark green over a screen's
 * worth of scroll reads as absence rather than as depth — Ro's note was that
 * the reference board's foliage "adds more life", and he is right.
 *
 * The obvious answer is a photograph, and it is the wrong one here. Every
 * photograph in this app is CC BY or CC BY-SA and has to be attributed (see
 * `media-credits.md` and the `/credits` screen), so a decorative backdrop would
 * drag a stranger's photograph, and the obligation that comes with it, into the
 * one screen whose whole job is to feel like a person talking to you. It would also
 * cost a decode on every tab switch, and white body copy would have to survive
 * whatever the photographer's highlights happened to land on.
 *
 * Drawn fronds have none of those problems: no request, no licence, no credit,
 * and — the part that matters most — the contrast is a number in this file
 * rather than a property of someone else's exposure. Ro's own note was that it
 * "doesn't have to be a palm tree, but whatever it is must have enough
 * contrast". This is how that becomes controllable instead of hoped for.
 *
 * The leaflets are generated rather than hand-drawn so the shape can be tuned
 * by changing a count or an angle instead of by rewriting a path of 200 numbers
 * that nobody will ever dare touch again.
 */

interface Frond {
  /** Where the stem is rooted, in viewBox units. */
  x: number;
  y: number;
  /** Direction of the stem, in degrees clockwise from east. */
  angle: number;
  length: number;
  /** How far the stem bows away from straight, as a fraction of its length. */
  bow: number;
  leaflets: number;
  opacity: number;
}

/**
 * Four fronds from the top-right corner, fanning down and left.
 *
 * They overlap deliberately: a fan of evenly-spaced fronds reads as a diagram
 * of a fan, and real foliage is mostly one leaf in front of another.
 */
const CANOPY: Frond[] = [
  { x: 322, y: -18, angle: 114, length: 268, bow: 0.26, leaflets: 44, opacity: 1 },
  { x: 356, y: 6, angle: 141, length: 300, bow: 0.2, leaflets: 46, opacity: 0.78 },
  { x: 302, y: -24, angle: 86, length: 226, bow: 0.3, leaflets: 38, opacity: 0.52 },
];

/*
 * The understory: two fronds rooted off the bottom-left, reaching up and right.
 *
 * Ro's note was that the foliage lives only at the top, so the rest of a long
 * screen has nothing in it. This is the answer, and it is deliberately *less*
 * than the canopy — two fronds rather than three, shorter, and carried at about
 * half the opacity. A second cluster as loud as the first stops reading as
 * depth and starts reading as a frame around the content.
 */
const UNDERSTORY: Frond[] = [
  { x: 42, y: 318, angle: -58, length: 286, bow: -0.24, leaflets: 44, opacity: 0.92 },
  { x: -8, y: 300, angle: -22, length: 248, bow: -0.3, leaflets: 40, opacity: 0.66 },
  { x: 74, y: 332, angle: -92, length: 218, bow: -0.2, leaflets: 36, opacity: 0.48 },
];

/*
 * Colour, along the length of each frond.
 *
 * The canopy was three stops of the same emerald, which is why it reads as one
 * flat green shape: a leaf lit from one side is not one colour. It now runs
 * from a light sea-green at the root to the interface's own ocean teal at the
 * tip, so the fronds travel from land toward water as they descend — the two
 * colours this app is already built from, rather than a new one invented for
 * the backdrop.
 *
 * The understory is the same idea further round: teal into the aqua the
 * `--aqua` chips use, at a third of the opacity, so it registers as light in
 * the water rather than as a second plant.
 */
const TINTS = {
  canopy: [
    { offset: '0%', color: '#5cc194', opacity: 0.74 },
    { offset: '46%', color: '#2f9a86', opacity: 0.48 },
    { offset: '100%', color: '#1e7f86', opacity: 0.12 },
  ],
  understory: [
    { offset: '0%', color: '#2f9a86', opacity: 0.62 },
    { offset: '52%', color: '#3f9d95', opacity: 0.42 },
    { offset: '100%', color: '#9fd3cb', opacity: 0.12 },
  ],
} as const;

export type FrondVariant = keyof typeof TINTS;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** A point on the quadratic curve the stem follows. */
function stemPoint(f: Frond, t: number) {
  const a = rad(f.angle);
  const endX = f.x + Math.cos(a) * f.length;
  const endY = f.y + Math.sin(a) * f.length;
  // The control point sits off to one side of the chord, which is what bows the stem.
  const perp = a + Math.PI / 2;
  const midX = (f.x + endX) / 2 + Math.cos(perp) * f.length * f.bow;
  const midY = (f.y + endY) / 2 + Math.sin(perp) * f.length * f.bow;
  const inv = 1 - t;
  return {
    x: inv * inv * f.x + 2 * inv * t * midX + t * t * endX,
    y: inv * inv * f.y + 2 * inv * t * midY + t * t * endY,
  };
}

function Frond({ frond, index }: { frond: Frond; index: string }) {
  const leaflets = [];

  for (let i = 0; i < frond.leaflets; i += 1) {
    // Leave the base bare: a frond whose leaflets start at the stem's root looks
    // like a feather duster rather than a palm.
    const t = 0.1 + (i / (frond.leaflets - 1)) * 0.9;
    const base = stemPoint(frond, t);
    const ahead = stemPoint(frond, Math.min(1, t + 0.015));
    const stemAngle = Math.atan2(ahead.y - base.y, ahead.x - base.x);

    // Longest in the middle third, tapering to nothing at the tip — a sine
    // envelope, skewed so the widest point sits before the halfway mark the way
    // it does on a real frond.
    const envelope = Math.sin(Math.pow(t, 0.8) * Math.PI);
    // Narrow. The first version ran to 0.30 of the stem's length and the
    // leaflets were sparse, which produced a symmetrical fan of straight lines
    // either side of a spine — a spider's web, not a palm. A frond is long,
    // narrow and *dense*, so the count went up and the reach came down.
    const length = envelope * frond.length * 0.21;
    if (length < 3) continue;

    // Leaflets sweep hard back toward the root, and harder toward the tip. The
    // shallow 52° of the first pass was the other half of the web problem.
    const sweep = rad(64 + t * 18);

    for (const side of [-1, 1] as const) {
      const a = stemAngle + side * sweep;
      const tipX = base.x + Math.cos(a) * length;
      const tipY = base.y + Math.sin(a) * length;
      // Each leaflet droops away from the stem rather than running straight:
      // the control point is pushed to the outside of the chord. Straight
      // leaflets are the single thing that makes drawn foliage look drawn.
      const droop = a + side * rad(24);
      leaflets.push(
        <path
          key={`${i}-${side}`}
          d={`M${base.x} ${base.y}Q${base.x + Math.cos(droop) * length * 0.62} ${
            base.y + Math.sin(droop) * length * 0.62
          } ${tipX} ${tipY}`}
        />,
      );
    }
  }

  const tip = stemPoint(frond, 1);
  const mid = stemPoint(frond, 0.5);

  return (
    <g opacity={frond.opacity} stroke={`url(#frond-${index})`} fill="none">
      <g strokeWidth="2.4" strokeLinecap="round">{leaflets}</g>
      <path
        d={`M${frond.x} ${frond.y}Q${mid.x * 2 - (frond.x + tip.x) / 2} ${
          mid.y * 2 - (frond.y + tip.y) / 2
        } ${tip.x} ${tip.y}`}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </g>
  );
}

export function PalmFronds({
  className,
  variant = 'canopy',
}: {
  className?: string;
  variant?: FrondVariant;
}) {
  const fronds = variant === 'canopy' ? CANOPY : UNDERSTORY;
  const stops = TINTS[variant];

  return (
    <svg
      className={className}
      viewBox="0 0 390 300"
      preserveAspectRatio={variant === 'canopy' ? 'xMaxYMin slice' : 'xMinYMax slice'}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {fronds.map((f, i) => {
          const tip = stemPoint(f, 1);
          return (
            /*
             * Each frond fades along its own length rather than through a single
             * overlay, so the ends dissolve into the ground instead of stopping
             * at a line. The stop colours are lighter than the background by a
             * fixed amount, which is what makes the contrast a decision here
             * rather than an accident of blending.
             */
            <linearGradient
              key={f.angle}
              id={`frond-${variant}-${i}`}
              gradientUnits="userSpaceOnUse"
              x1={f.x}
              y1={f.y}
              x2={tip.x}
              y2={tip.y}
            >
              {stops.map((s) => (
                <stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
              ))}
            </linearGradient>
          );
        })}
      </defs>

      {fronds.map((f, i) => (
        <Frond key={f.angle} frond={f} index={`${variant}-${i}`} />
      ))}
    </svg>
  );
}
