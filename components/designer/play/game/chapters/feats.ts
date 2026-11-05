// The game's moments: small things a player can find or do, kept in this
// browser across playthroughs. A chapter unlocks one with ctx.feat(id); the
// game shows a card the first time and lists them all on the pause screen.
// Secret ones stay hidden in the list until they're found. They're in the
// order a first playthrough would come across them.

export type Feat = { title: string; line: string; secret?: boolean };

export const FEATS = {
  mirror: { title: "Still maxed", line: "Checked the mirror. HANDSOME has not moved.", secret: true },
  phoebe: { title: "First believer", line: "Petted Phoebe three times running. She’d allow a fourth.", secret: true },
  diligence: { title: "Due diligence", line: "Used every last thing in one room.", secret: true },
  dayone: { title: "Day one", line: "Started a company before breakfast." },
  banned: { title: "Rule #1", line: "Banned from HYPEHAUS. Earned it." },
  cookgroup: { title: "$45K", line: "From $500 in a shoebox to $45,000 in revenue." },
  jerry: { title: "Plus Jerry", line: "Took Jerry’s side. He’ll bring it up forever.", secret: true },
  alljerry: { title: "All in on Jerry", line: "Let Jerry answer every question. Still won.", secret: true },
  classof: { title: "Class of 2026", line: "Three ways off one field. One group chat." },
  ninetyone: { title: "91", line: "Sick twice. An 86, then a 91." },
  toughcrowd: { title: "Tough crowd", line: "Heard three of Miles’s jokes in a row. None were jokes.", secret: true },
  barkoff: { title: "Who barks best", line: "BarkOff took 1st at SpaceXAI Build Night." },
  keewano: { title: "Best Use of Keewano", line: "alai took 1st at a16z SpeedHacks." },
  primitive: { title: "3 for 3", line: "Continuity took 1st on YC’s Primitive.dev track." },
  building: { title: "Including me", line: "Everyone in the room was building something." },
  tbc: { title: "To be continued", line: "Caught up with the present. The rest is still happening." },
  threeam: { title: "3 AM", line: "Played at 3 AM. Very hackathon of you.", secret: true },
} satisfies Record<string, Feat>;

export type FeatId = keyof typeof FEATS;
