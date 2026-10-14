// Marque Azerit (gemme) et mot-symbole Testyourskills.
import { useId } from "react";

export function AzeritMark({ size = 18, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className={className}
      width={size}
      height={Math.round(size * 1.15)}
      viewBox="0 0 104 120"
      fill="none"
      aria-hidden
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id={`${id}l`} x1="30" y1="4" x2="30" y2="106" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#dde27d" />
          <stop offset="1" stopColor="#4e9a86" />
        </linearGradient>
        <linearGradient id={`${id}r`} x1="70" y1="8" x2="70" y2="116" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#93dbcf" />
          <stop offset="1" stopColor="#3a5a72" />
        </linearGradient>
      </defs>
      <path d="M52 8 L14 50 L37 102 Z" fill={`url(#${id}l)`} stroke={`url(#${id}l)`} strokeWidth="9" strokeLinejoin="round" />
      <path d="M63 10 L92 42 L85 80 L47 112 Z" fill={`url(#${id}r)`} stroke={`url(#${id}r)`} strokeWidth="9" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <span className="wordmark-test">test</span>
      <span className="wordmark-your">your</span>
      <span className="wordmark-skills">skills</span>
    </span>
  );
}
