import type { Bedroom } from "../rooms/bedroom";
import { say, type Chapter, type Ctx } from "./types";

// Before Berkeley, before the hackathons: a morning in Aiden's room, $500 in
// a shoebox, and a company started before breakfast.

const room = (ctx: Ctx) => ctx.stage().room as Bedroom;

export const prologue: Chapter = {
  id: "prologue",
  number: "Prologue",
  title: "The Drop",
  line: "$500, a bedroom, and a group chat that doesn’t exist yet.",
  intro: ["Before Berkeley.", "Before the hackathons.", "There was a bedroom, a laptop,", "and five hundred dollars."],
  hud: {},
  acts: [
    {
      stats: { money: 0 },
      run: async (ctx) => {
        await ctx.scene({ id: "bedroom", lying: true, dog: "bed", day: "Sat · Day 1", clock: 7 * 60 });
        room(ctx).setBuzz(true);
        ctx.bubble("phone", "bzzt bzzt", 0);
        ctx.go("wake");
      },
    },
  ],
  objectives: {
    wake: "Get up",
    phone: "Answer your phone",
    shoebox: "Find your savings",
    laptop: "Open your laptop",
    door: "Head out the door",
    done: "",
  },
  targets: { phone: "phone", shoebox: "shoebox", laptop: "laptop", door: "door" },
  wake: async (ctx) => {
    const stage = ctx.stage();
    stage.wake();
    ctx.sound()?.select();
    await ctx.wait(950);
    stage.wakePhoebe();
    await ctx.say([say("aiden", "7:00 AM. Saturday."), say("aiden", "Nobody texts this early unless something’s on fire.")]);
    ctx.go("phone");
  },
  use: async (id, ctx) => {
    const step = ctx.step();
    switch (id) {
      case "phone":
        if (step !== "phone") return ctx.say([say("aiden", "Six group chats, one question. That’s not spam. That’s a market.")]);
        room(ctx).setBuzz(false);
        ctx.bubble("phone", "");
        await ctx.say([
          say("phone", "6 group chats · 14 new messages"),
          say("phone", "“WHAT TIME DOES IT DROP” · “7 or 10??” · “my cousin says midnight”"),
          say("aiden", "The drop’s tomorrow. Thousands of people want the same shoe."),
          say("aiden", "And not one of them knows when it actually goes live."),
        ]);
        {
          const pick = await ctx.choose(say("aiden", "…I could tell them."), [
            { label: "For a small monthly fee.", who: "aiden" },
            { label: "For free. Out of the goodness of my heart.", who: "aiden" },
          ]);
          if (pick === 1) await ctx.say([say("phoebe", "*stares*"), say("aiden", "…Kidding. Small monthly fee.")]);
          else await ctx.say([say("aiden", "Very small. Basically a snack a month.")]);
        }
        return ctx.go("shoebox");
      case "shoebox":
        if (step === "phone" || step === "wake") return ctx.say([say("aiden", "My savings. Rule one: no plan, no spending.")]);
        if (step !== "shoebox") return ctx.say([say("aiden", "Empty now. The money’s working.")]);
        await ctx.say([say("note", "A shoebox, the kind the good pairs come in. Inside: five hundred dollars.")]);
        ctx.earn(500);
        await ctx.say([say("aiden", "Every dollar I’ve saved. All five hundred of them."), say("aiden", "Seed round: closed. Lead investor: me.")]);
        return ctx.go("laptop");
      case "laptop":
        if (step === "phone" || step === "wake") return ctx.say([say("aiden", "Not yet. I need an idea first.")]);
        if (step === "shoebox") return ctx.say([say("aiden", "An idea’s nothing without a budget. Where did I put it…")]);
        if (step !== "laptop") return ctx.say([say("aiden", "Members: one. Growth since launch: infinite, technically.")]);
        await ctx.open({ kind: "create", name: "AGNotify" });
        await ctx.say([
          say("aiden", "Drop times before anyone else. Where to cop. A group chat that never sleeps."),
          say("aiden", "If ten strangers pay for it, it’s a business. If they don’t, it’s a group chat."),
        ]);
        return ctx.go("door");
      case "door":
        if (step !== "door") return ctx.say([say("aiden", "Can’t leave yet. There’s a business to start.")]);
        await ctx.say([say("aiden", "Ten members by tonight."), say("aiden", "How hard can it be?")]);
        return ctx.end();
      case "phoebe":
        ctx.stage().cheer();
        return ctx.say(
          step === "door" || step === "done"
            ? [say("phoebe", "*wag wag wag*"), say("aiden", "First believer. Zero dollars invested. Best investor I’ll ever have.")]
            : [say("phoebe", "*wag*"), say("aiden", "Morning, Phoebe. Today we start a company. You’re on payroll.")],
        );
      default:
        return flavour(id, ctx);
    }
  },
  end: {
    title: "The Drop",
    stats: [
      ["Capital", "$500"],
      ["Company", "AGNotify"],
      ["Members", "1"],
      ["Handsome", "Max"],
    ],
    next: { number: "Chapter 1", title: "The Cook Group", line: "Grow AGNotify from one member to $45,000 in revenue.", chapter: "ch1" },
  },
};

/** The room's things, when there's nothing in particular to do with them. */
export async function flavour(id: string, ctx: Ctx) {
  switch (id) {
    case "mirror":
      await ctx.say([say("aiden", "Hair: curly. Jaw: present."), say("aiden", "Handsome: maxed out. Some stats just come that way.")]);
      ctx.glint();
      ctx.sound()?.sparkle();
      return;
    case "shoes":
      return ctx.say([say("aiden", "Every box on this wall is either for wearing or for reselling."), say("aiden", "Mostly reselling.")]);
    case "window":
      return ctx.say([say("aiden", "The street’s still asleep. The group chats are not.")]);
    case "poster":
      return ctx.say([say("aiden", "The Golden Gate at sunset. Everything gets built on the other side of it.")]);
    case "ball":
      return ctx.say([say("aiden", "I’ve watched enough film to coach. My jump shot has watched none.")]);
    case "football":
      return ctx.say([say("aiden", "Ten minutes of keepy-uppy, then back to work. That’s the deal.")]);
    default:
      return;
  }
}
