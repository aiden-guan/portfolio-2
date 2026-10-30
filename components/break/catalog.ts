import { BOSS_HEALTH } from "@/components/break/balance";
export type ShipId = 0 | 1 | 2;
export type Sector = 1 | 2 | 3;

export const SHIPS = [
  {
    name: "KESTREL",
    role: "Interceptor",
    weapon: "Twin ion lances",
    focus: "Piercing lance",
    color: "#b4e3cf",
    detail: "Precise ion fire. Faster handling, narrow coverage.",
  },
  {
    name: "HELIX",
    role: "Heavy fighter",
    weapon: "Plasma fan + seekers",
    focus: "Fusion stream",
    color: "#edb6a0",
    detail: "Plasma coverage and guided support. Heavier, slower handling.",
  },
  {
    name: "WRAITH",
    role: "Arc frigate",
    weapon: "Chain lightning",
    focus: "Singularity rail",
    color: "#efb3d4",
    detail:
      "Close-range arcs decay with each jump. Focus charges a piercing rail.",
  },
] as const;
export const SECTORS = [
  {
    name: "GUAN",
    place: "Signal 01",
    boss: "GUAN",
    subtitle: "Signal acquired",
    color: "#b4e3cf",
    hp: BOSS_HEALTH.guan[0],
    image: "/aiden-face.jpg",
    briefing: "Destroy the signal.",
  },
  {
    name: "PHOEBE",
    place: "The tortilla dimension",
    boss: "PHOEBE",
    subtitle: "Devourer of worlds. Very good girl.",
    color: "#edb6a0",
    hp: BOSS_HEALTH.phoebe,
    image: "/arcade/phoebe.webp",
    briefing: "Something very good is hiding in the signal.",
  },
  {
    name: "THE CO-FOUNDER",
    place: "One last disagreement",
    boss: "THE CO-FOUNDER",
    subtitle: "Allen · One last disagreement",
    color: "#efb3d4",
    hp: BOSS_HEALTH.allen,
    image: "/arcade/co-founder.webp",
    briefing: "The pitch is over. Settle this in orbit.",
  },
] as const;
