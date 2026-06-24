export function MarqueeRectToolIcon({ size = 19, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <rect x="2.75" y="3.25" width="14.5" height="13.5" rx="1.6" stroke="currentColor" strokeWidth={1.7} strokeDasharray="2.3 2" />
    </svg>
  );
}

export function MarqueeEllipseToolIcon({ size = 19, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <ellipse cx="10" cy="10" rx="7" ry="6.3" stroke="currentColor" strokeWidth={1.7} strokeDasharray="2.1 1.8" />
    </svg>
  );
}

export function MarqueeLassoToolIcon({ size = 19, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        d="M4 10.8c0-3.25 2.75-5.75 6.4-5.75 3.2 0 5.6 1.95 5.6 4.75 0 2.35-1.45 4.45-3.8 5.4-.95.4-1.1 1.7-.25 2.25l.55.35"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeDasharray="2 2"
      />
      <circle cx="12.95" cy="17.2" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function MarqueePolygonToolIcon({ size = 19, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        d="M3.2 13.8 5.6 5.4 14.4 4.2 16.8 12.4 9.8 16.2Z"
        stroke="currentColor"
        strokeWidth={1.65}
        strokeLinejoin="round"
        strokeDasharray="2 1.8"
      />
      <circle cx="5.6" cy="5.4" r="1.05" fill="currentColor" />
      <circle cx="14.4" cy="4.2" r="1.05" fill="currentColor" />
      <circle cx="16.8" cy="12.4" r="1.05" fill="currentColor" />
      <circle cx="9.8" cy="16.2" r="1.05" fill="currentColor" />
      <circle cx="3.2" cy="13.8" r="1.05" fill="currentColor" />
    </svg>
  );
}
