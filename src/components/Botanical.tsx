/** Simple eucalyptus and monstera line art for the cover. Decorative only. */

export function EucalyptusBranch({ className }: { className?: string }) {
  const leaves = [
    { cx: 60, cy: 40, r: 13, rot: -30 },
    { cx: 92, cy: 52, r: 14, rot: 20 },
    { cx: 70, cy: 80, r: 15, rot: -40 },
    { cx: 104, cy: 96, r: 15, rot: 25 },
    { cx: 80, cy: 124, r: 16, rot: -35 },
    { cx: 114, cy: 142, r: 16, rot: 30 },
    { cx: 90, cy: 170, r: 17, rot: -30 },
    { cx: 124, cy: 190, r: 16, rot: 25 },
  ];
  return (
    <svg viewBox="0 0 180 260" className={className} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M70 10 C 78 70, 92 140, 112 250" />
        {leaves.map((l, i) => (
          <g key={i} transform={`rotate(${l.rot} ${l.cx} ${l.cy})`}>
            <ellipse cx={l.cx} cy={l.cy} rx={l.r} ry={l.r * 0.82} />
            <path d={`M${l.cx - l.r * 0.7} ${l.cy} L ${l.cx + l.r * 0.7} ${l.cy}`} opacity="0.5" />
          </g>
        ))}
      </g>
    </svg>
  );
}

export function MonsteraLeaf({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M100 188 C 98 150, 96 120, 100 92" />
        <path d="M100 92 C 50 96, 18 70, 22 36 C 50 18, 84 22, 100 40 C 116 22, 150 18, 178 36 C 182 70, 150 96, 100 92 Z" />
        <path d="M100 40 L 100 92" />
        <path d="M100 60 C 80 52, 62 44, 46 34" />
        <path d="M100 74 C 76 72, 54 66, 34 56" />
        <path d="M100 60 C 120 52, 138 44, 154 34" />
        <path d="M100 74 C 124 72, 146 66, 166 56" />
        <ellipse cx="62" cy="60" rx="5" ry="3" transform="rotate(25 62 60)" />
        <ellipse cx="138" cy="60" rx="5" ry="3" transform="rotate(-25 138 60)" />
      </g>
    </svg>
  );
}
