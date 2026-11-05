import type { Bedroom } from "../rooms/bedroom";
import { again, mirror, noticing, pet } from "./notice";
import { say, type Chapter, type Ctx } from "./types";

// Before Berkeley, before the hackathons: a morning in Aiden's room, $500 in
// a shoebox, and a company started before breakfast. Phoebe is the first to
// believe in it, before there's anything to believe in.

const room = (ctx: Ctx) => ctx.stage().room as Bedroom;

/** Whether Aiden joked about doing it for free (Phoebe remembers). */
let free = false;

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
        free = false;
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
  use: noticing(async function respond(id, ctx): Promise<void> {
    const step = ctx.step();
    switch (id) {
      case "phone":
        if (step !== "phone")
          return ctx.say(
            again(ctx, "phone", [
              [say("aiden", "Six group chats, one question. That’s not spam. That’s a market.")],
              [say("aiden", "Somebody’s cousin still says midnight. Somebody’s cousin is wrong.")],
            ]),
          );
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
          free = pick === 1;
          if (free) {
            ctx.emote("phoebe", "dots");
            await ctx.say([say("phoebe", "*stares*"), say("aiden", "…Kidding. Small monthly fee.")]);
          } else await ctx.say([say("aiden", "Very small. Basically a snack a month.")]);
        }
        return ctx.go("shoebox");
      case "shoebox":
        if (step === "phone" || step === "wake")
          return ctx.say(again(ctx, "shoebox", [[say("aiden", "My savings. Rule one: no plan, no spending.")], [say("aiden", "The box stays shut until there’s a plan. The box has rules.")]]));
        if (step !== "shoebox") return ctx.say(again(ctx, "shoebox", [[say("aiden", "Empty now. The money’s working.")], [say("aiden", "I’m keeping the box. Founders keep the box.")]]));
        await ctx.say([say("note", "A shoebox, the kind the good pairs come in. Inside: five hundred dollars.")]);
        ctx.earn(500);
        await ctx.say([say("aiden", "Every dollar I’ve saved. All five hundred of them."), say("aiden", "Seed round: closed. Lead investor: me.")]);
        return ctx.go("laptop");
      case "laptop":
        if (step === "phone" || step === "wake") return ctx.say([say("aiden", "Not yet. I need an idea first.")]);
        if (step === "shoebox") return ctx.say([say("aiden", "An idea’s nothing without a budget. Where did I put it…")]);
        if (step !== "laptop")
          return ctx.say(again(ctx, "laptop", [[say("aiden", "Members: one. Growth since launch: infinite, technically.")], [say("aiden", "Refreshing won’t make it ten. I’ve checked.")]]));
        await ctx.open({ kind: "create", name: "AGNotify" });
        await ctx.say([
          say("aiden", "Drop times before anyone else. Where to cop. A group chat that never sleeps."),
          say("aiden", "If ten strangers pay for it, it’s a business. If they don’t, it’s a group chat."),
        ]);
        // the first reaction AGNotify ever gets
        ctx.stage().cheer();
        ctx.emote("phoebe", "heart");
        await ctx.say([say("phoebe", "*wag wag wag*"), say("aiden", "One believer. Zero customers.")]);
        return ctx.go("door");
      case "door":
        if (step !== "door")
          return ctx.say(again(ctx, "door", [[say("aiden", "Can’t leave yet. There’s a business to start.")], [say("aiden", "Still can’t. Businesses don’t start themselves. I’ve looked into it.")]]));
        await ctx.say([say("aiden", "Ten members by tonight."), ...(free ? [say("aiden", "Paying ones, Phoebe. Relax.")] : []), say("aiden", "How hard can it be?")]);
        ctx.feat("dayone");
        return ctx.end();
      case "phoebe":
        return pet(
          ctx,
          step === "door" || step === "done"
            ? again(ctx, "phoebe:after", [
                [say("phoebe", "*wag wag wag*"), say("aiden", "First believer. Zero dollars invested. Best investor I’ll ever have.")],
                [say("phoebe", "*rolls over*"), say("aiden", "She wants a board seat. She already has the bed.")],
                [say("phoebe", "*the full spin*"), say("aiden", "Back by tonight. You’re in charge.")],
              ])
            : again(ctx, "phoebe", [
                [say("phoebe", "*wag*"), say("aiden", "Morning, Phoebe. Today we start a company. You’re on payroll.")],
                [say("phoebe", "*rolls over*"), say("aiden", "Payroll is belly rubs. Same as yesterday.")],
                [say("phoebe", "*the full spin*"), say("aiden", "Okay. Okay. Back to work.")],
              ]),
        );
      default:
        return flavour(id, ctx);
    }
  }),
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
      return mirror(
        ctx,
        again(ctx, "mirror", [
          [say("aiden", "Hair: curly. Jaw: present."), say("aiden", "Handsome: maxed out. Some stats just come that way.")],
          [say("aiden", "Checked again. Still maxed. It doesn’t go higher. I’ve tried.")],
          [say("aiden", "Last look. …Okay, one more.")],
        ]),
      );
    case "shoes":
      return ctx.say(
        again(ctx, "shoes", [
          [say("aiden", "Every box on this wall is either for wearing or for reselling."), say("aiden", "Mostly reselling.")],
          [say("aiden", "Phoebe chewed one box, once. The cheapest one. She knows the market.")],
        ]),
      );
    case "window":
      return ctx.say(
        again(ctx, "window", [
          [say("aiden", "The street’s still asleep. The group chats are not.")],
          [say("aiden", "Every window on this street has somebody behind it, refreshing a group chat.")],
        ]),
      );
    case "poster":
      return ctx.say(
        again(ctx, "poster", [
          [say("aiden", "The Golden Gate at sunset. Everything gets built on the other side of it.")],
          [say("aiden", "One day: an office over there. A bridge in the window. Kombucha on tap.")],
        ]),
      );
    case "ball":
      return ctx.say(again(ctx, "ball", [[say("aiden", "I’ve watched enough film to coach. My jump shot has watched none.")], [say("aiden", "Fine. One shot."), say("note", "Nothing but floor.")]]));
    case "football":
      return ctx.say(
        again(ctx, "football", [
          [say("aiden", "Ten minutes of keepy-uppy, then back to work. That’s the deal.")],
          [say("aiden", "Phoebe thinks the deal is she gets the ball. She’s renegotiating.")],
        ]),
      );
    default:
      return;
  }
}
