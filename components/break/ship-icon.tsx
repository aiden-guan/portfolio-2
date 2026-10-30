import type { ShipId } from "@/components/break/catalog";

export function ShipIcon({ ship }: { ship: ShipId }) {
  const hull = [
    "M32 3 39 25 58 48 56 55 39 47 32 54 25 47 8 55 6 48 25 25Z",
    "M32 6 42 16 48 31 61 39 62 58 43 53 38 61 26 61 21 53 2 58 3 39 16 31 22 16Z",
    "M32 2 41 32 63 21 55 52 42 64 32 53 22 64 9 52 1 21 23 32Z",
  ][ship];
  return (
    <svg viewBox="0 0 64 70" fill="none" aria-hidden="true">
      <path
        d={hull}
        fill="currentColor"
        fillOpacity=".12"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="m32 17 4 15-4 7-4-7Z" fill="currentColor" />
      <path
        d="m14 44 10 3m16 0 10-3M32 43v7"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M23 58v8m18-8v8"
        stroke="currentColor"
        strokeOpacity=".5"
        strokeWidth="3"
      />
    </svg>
  );
}
