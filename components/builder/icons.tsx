// Inline icons for /builder, each drawn on the grid it's shown at.

type IconProps = { className?: string };

export function ArrowUpRight({ className }: IconProps) {
  return (
    <svg className={className} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path
        d="M2.75 7.25 7.25 2.75M3.6 2.75h3.65V6.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Chevron({ direction, className }: IconProps & { direction: "left" | "right" }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d={direction === "left" ? "M9.75 3.75 5.5 8l4.25 4.25" : "M6.25 3.75 10.5 8l-4.25 4.25"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Cross({ className }: IconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4.75 4.75 11.25 11.25M11.25 4.75 4.75 11.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Trophy({ className }: IconProps) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M3.4 1.6h5.2v2.7a2.6 2.6 0 0 1-5.2 0Z" fill="currentColor" />
      <path
        d="M3.4 2.6H2.3a.6.6 0 0 0-.6.6c0 1.15.75 2 1.95 2.15M8.6 2.6h1.1a.6.6 0 0 1 .6.6c0 1.15-.75 2-1.95 2.15M6 6.9v2.1M4.1 10.4h3.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
