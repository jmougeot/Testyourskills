// Gemme Azerit (cf. LandingPage/src/components/Logo.tsx), en SVG pur.
// Deux facettes : chartreuse vers teal, teal vers bleu acier.

export function AzeritGemDefs({ id }: { id: string }) {
  return (
    <>
      <linearGradient id={`${id}-gl`} x1="30" y1="4" x2="30" y2="106" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#dde27d" />
        <stop offset="1" stopColor="#4e9a86" />
      </linearGradient>
      <linearGradient id={`${id}-gr`} x1="70" y1="8" x2="70" y2="116" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#93dbcf" />
        <stop offset="1" stopColor="#3a5a72" />
      </linearGradient>
    </>
  );
}

/** Gemme posée en (x, y), hauteur `h` (proportions 104 × 120). */
export function AzeritGem({ id, x, y, h, outline }: { id: string; x: number; y: number; h: number; outline?: string }) {
  const s = h / 120;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {outline && (
        <g fill={outline} stroke={outline} strokeWidth={9 + 2.2 / s} strokeLinejoin="round" opacity={0.55}>
          <path d="M52 8 L14 50 L37 102 Z" />
          <path d="M63 10 L92 42 L85 80 L47 112 Z" />
        </g>
      )}
      <path d="M52 8 L14 50 L37 102 Z" fill={`url(#${id}-gl)`} stroke={`url(#${id}-gl)`} strokeWidth={9} strokeLinejoin="round" />
      <path d="M63 10 L92 42 L85 80 L47 112 Z" fill={`url(#${id}-gr)`} stroke={`url(#${id}-gr)`} strokeWidth={9} strokeLinejoin="round" />
    </g>
  );
}
