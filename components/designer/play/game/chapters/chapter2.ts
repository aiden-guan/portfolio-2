import { Vector3 } from "three";
import { gowned, LOOKS, someone } from "../people";
import type { Field } from "../rooms/field";
import type { Hallway } from "../rooms/hallway";
import type { ActorSpec } from "../stage";
import { again, mirror, noticing, nth } from "./notice";
import { say, type Chapter, type Ctx, type Line } from "./types";

// High school, after the cook group: John (who sells jeans he has never
// touched), then Jerry (who joins for the pizza), then FBLA, and winning it
// over and over. Senior year, the group chat, graduation, three directions.

const hallway = (ctx: Ctx) => ctx.stage().room as Hallway;
const field = (ctx: Ctx) => ctx.stage().room as Field;

const STUDENTS = (seed: number, area: { x0: number; x1: number; z0: number; z1: number }, count: number): ActorSpec[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `student${i}`,
    look: someone(seed + i * 13),
    at: new Vector3(area.x0 + ((i + 0.5) / count) * (area.x1 - area.x0), 0, (area.z0 + area.z1) / 2 + ((i % 2) - 0.5) * 0.8),
    heading: (i * 1.7) % (Math.PI * 2),
    behaviour: i % 3 === 0 ? "idle" : "wander",
    area,
    seed: seed + i,
  }));

const JOHN = (at: Vector3, extra: Partial<ActorSpec> = {}): ActorSpec => ({ id: "john", look: LOOKS.john, at, label: "John", behaviour: "watch", ...extra });
const JERRY = (at: Vector3, extra: Partial<ActorSpec> = {}): ActorSpec => ({ id: "jerry", look: LOOKS.jerry, at, label: "Jerry", behaviour: "watch", ...extra });

// what the chapter remembers, for later in it
/** Aiden took Jerry's side about the pizza. */
let sided = false;
/** How many of the judges' questions Jerry answered, and whether one was the babies. */
let jerrys = 0;
let babies = false;
/** The summer, proved off John's shoulders. */
let thrown = false;

// what John and Jerry say between the things that happen, by step
const JOHN_SAYS: Record<string, Line[][]> = {
  jerry: [[say("john", "He does this. Let him finish.")]],
  club: [[say("john", "Room 204’s down the hall. Follow the smell of pizza.")], [say("john", "Jerry’s already walking. Jerry’s never walked this fast.")]],
  present: [[say("john", "Focus. We’re winning this.")], [say("john", "Stop looking at me. Look at the judges.")]],
  case: [[say("john", "We should frame the group chat too.")], [say("john", "One more month of this hallway. Then real money.")]],
  grad: [[say("john", "Front doors. Last time.")]],
  walk: [[say("john", "Go. Walk the stage. Don’t trip, everyone’s filming.")], [say("john", "Aiden. The stage. It’s the big thing with the principal on it.")]],
  goodbye: [[say("john", "Signpost. Don’t make it weird.")]],
};
const JERRY_SAYS: Record<string, Line[][]> = {
  club: [[say("jerry", "Pizza’s on me. By which I mean you.")], [say("jerry", "If there’s pineapple on it, I’m joining forever.")]],
  present: [[say("jerry", "If they ask about margins, I’m pointing at John.")], [say("jerry", "I practiced in the mirror. The mirror said I’m ready.")]],
  case: [[say("jerry", "Four trophies. I’ve touched all of them. That counts.")], [say("jerry", "John says I can’t hold one at graduation. I’m holding one at graduation.")]],
  grad: [[say("jerry", "Last time through these doors. I’m not crying. You’re crying.")]],
  walk: [[say("jerry", "If you trip, I’m not helping. I’m filming.")]],
  goodbye: [[say("jerry", "Is this the part where we hug? Is it? It is.")]],
};

async function denim(ctx: Ctx) {
  sided = false;
  await ctx.scene({
    id: "hallway",
    actors: [
      JOHN(new Vector3(1.05, 0, 1.55), { pose: "sit", seat: 0.45, heading: Math.PI * 0.15, behaviour: "idle" }),
      JERRY(new Vector3(-6.4, 0, -0.6), { heading: Math.PI / 2 }),
      ...STUDENTS(101, { x0: -4.8, x1: 4.8, z0: -1.9, z1: -0.9 }, 6),
    ],
    at: new Vector3(-4.2, 0, 0.3),
    heading: Math.PI / 2,
    banner: { place: "High school", time: "Tuesday, lunch" },
    day: "Tue · Lunch",
    clock: 12 * 60 + 5,
  });
  ctx.stage().actor("jerry")?.show(false);
  ctx.go("lunch");
  await ctx.say([say("aiden", "The server runs itself now."), say("aiden", "Which means, for once, I have a lunch break.")]);
}

async function conference(ctx: Ctx) {
  jerrys = 0;
  babies = false;
  const audience: ActorSpec[] = [];
  const rows = [1.1, 1.9, 2.7];
  rows.forEach((z, r) =>
    [-3.4, -2.6, -1.8, 1.6, 2.4, 3.2, 4.0].forEach((x, i) => {
      if ((r * 7 + i) % 3 === 2) return;
      audience.push({ id: `seat${r}-${i}`, look: someone(300 + r * 11 + i * 5, { style: i % 2 ? "blazer" : "tee", inner: 0xf6f4ee }), at: new Vector3(x, 0, z), heading: Math.PI, pose: "sit", seat: 0.45, solid: false });
    }),
  );
  const judges: ActorSpec[] = [-1.0, 0, 1.0].map((x, i) => ({
    id: `judge${i}`,
    look: i === 1 ? LOOKS.judge : { ...LOOKS.judge, skin: i ? 0xb9805a : 0xe2b28a, hair: i ? "bun" : "short", hairColor: i ? 0x2a2420 : 0x6b4426, glasses: i !== 2 },
    at: new Vector3(x + 0.3, 0, 0.35),
    heading: Math.PI,
    pose: "sit",
    seat: 0.45,
    solid: false,
  }));
  await ctx.scene({
    id: "auditorium",
    actors: [JOHN(new Vector3(-4.7, 0, 3.6), { behaviour: "follow", side: -1 }), JERRY(new Vector3(-4.2, 0, 3.9), { behaviour: "follow", side: 1 }), ...judges, ...audience],
    at: new Vector3(-4.5, 0, 3.3),
    heading: Math.PI * 0.9,
    banner: { place: "FBLA Regionals", time: "Saturday, 9:30 AM" },
    day: "Sat · Regionals",
    clock: 9 * 60 + 30,
  });
  ctx.go("present");
  await ctx.say([say("john", "Judges are already seated."), say("jerry", "I’m not nervous. You’re nervous.")]);
}

async function seniorYear(ctx: Ctx) {
  await ctx.scene({
    id: "hallway",
    trophies: 4,
    actors: [JOHN(new Vector3(-3.6, 0, 0.7), { behaviour: "follow", side: -1 }), JERRY(new Vector3(-3.2, 0, 1.1), { behaviour: "follow", side: 1 }), ...STUDENTS(207, { x0: -4.5, x1: 4.5, z0: -1.9, z1: -0.9 }, 5)],
    at: new Vector3(-3.4, 0, 0.2),
    heading: Math.PI / 2,
    banner: { place: "Senior year", time: "Friday, after school" },
    day: "Fri · Senior year",
    clock: 15 * 60 + 20,
  });
  // the same doors, but this time they're the way out
  const doors = ctx.stage().room.spots.find((s) => s.id === "door");
  if (doors) doors.label = "Front doors";
  ctx.go("case");
}

async function graduation(ctx: Ctx) {
  thrown = false;
  const grads: ActorSpec[] = [];
  [0.6, 1.4].forEach((z, r) =>
    [-3.6, -2.8, -2.0, -1.2, 0.8, 1.6, 2.4, 3.2].forEach((x, i) => {
      if ((r + i) % 4 === 3) return;
      grads.push({ id: `grad${r}-${i}`, look: gowned(someone(500 + r * 17 + i * 3)), at: new Vector3(x, 0, z), heading: Math.PI, pose: "sit", seat: 0.45, solid: false });
    }),
  );
  const family: ActorSpec[] = [];
  [[5.6, 1.4], [6.3, 1.4], [5.6, 2.3], [6.3, 2.3], [5.6, 3.2], [6.3, 3.2]].forEach(([x, z], i) => {
    if (i === 3) return;
    family.push({ id: `family${i}`, look: someone(700 + i * 9, { style: i % 2 ? "blazer" : "tee", inner: 0xf6f4ee }), at: new Vector3(x, 0, z), heading: -Math.PI / 2, pose: "sit", seat: 0.3 + (x > 6 ? 0.3 : 0), solid: false });
  });
  await ctx.scene({
    id: "field",
    hero: gowned(LOOKS.aiden),
    actors: [
      JOHN(new Vector3(-5.0, 0, 3.0), { look: gowned(LOOKS.john), heading: Math.PI * 0.5 }),
      JERRY(new Vector3(-4.4, 0, 3.4), { look: gowned(LOOKS.jerry), heading: Math.PI * 0.6 }),
      { id: "principal", look: LOOKS.principal, at: new Vector3(0, 0, -3.6), heading: 0, label: "Principal", reach: 1.6 },
      ...grads,
      ...family,
    ],
    at: new Vector3(-1.6, 0, 2.6),
    heading: Math.PI,
    banner: { place: "Graduation", time: "Class of 2026" },
    day: "Sat · June",
    clock: 16 * 60 + 30,
  });
  ctx.go("walk");
  await ctx.say([say("aiden", "Cap. Gown. It started with a bedroom, a shoebox and a group chat."), say("aiden", "Now it’s two best friends and a shelf of trophies. Same group chat.")]);
}

export const chapter2: Chapter = {
  id: "ch2",
  number: "Chapter 2",
  title: "Future Business Leaders",
  line: "Meet John. Then Jerry. Then win everything.",
  intro: ["$45,000 in revenue.", "A business that mostly ran itself.", "Which left time for something new:", "friends who got it."],
  hud: { money: false, hearts: true },
  acts: [
    { stats: { money: 0, hearts: { john: 0, jerry: 0 } }, run: denim },
    { stats: { money: 0, hearts: { john: 2, jerry: 2 } }, run: conference },
    { stats: { money: 0, hearts: { john: 3, jerry: 3 } }, run: seniorYear },
    { stats: { money: 0, hearts: { john: 4, jerry: 4 } }, run: graduation },
  ],
  objectives: {
    lunch: "Find somewhere to sit",
    jerry: "See what Jerry wants",
    club: "Go to Room 204",
    present: "Take the stage",
    case: "Look at the trophy case",
    grad: "Head out the front doors",
    walk: "Walk the stage",
    friends: "Find John and Jerry",
    goodbye: "Say goodbye",
    done: "",
  },
  targets: {
    lunch: "john",
    jerry: "jerry",
    club: "door",
    present: "stage",
    case: "trophies",
    grad: "door",
    walk: "principal",
    friends: "john",
    goodbye: "signs",
  },
  use: noticing(async function respond(id, ctx): Promise<void> {
    const step = ctx.step();
    const stage = ctx.stage();
    switch (id) {
      // —— act one: denim
      case "john":
        if (step === "lunch") {
          await ctx.say([
            say("john", "Don’t look at my screen."),
            say("aiden", "Too late. Is that a store? Selling… jeans?"),
            say("john", "Dropshipped. Straight from AliExpress to the customer."),
            say("john", "I have never touched a single pair."),
            say("aiden", "Margins?"),
            say("john", "Great. Don’t ask about shipping times."),
            say("aiden", "I run a sneaker cook group. AGNotify. Forty-five thousand in revenue."),
            say("john", "…"),
            say("john", "Okay. You can sit here."),
          ]);
          await ctx.open({ kind: "intro", who: "john", name: "John Wang", line: "Best friend. Sells jeans he has never touched.", colour: "#4a6f9e" });
          ctx.hearts("john", 2);
          await ctx.say([
            say("john", "So what’s next? After the cook group."),
            say("aiden", "Not sure. Something bigger."),
            say("john", "Same. Something with fewer customer service emails."),
          ]);
          const jerry = stage.actor("jerry");
          const john = stage.actor("john");
          john?.pose("stand");
          john?.behave("follow", -1);
          if (jerry) {
            jerry.show(true);
            ctx.bubble("jerry", "GUYS!", 1800);
            ctx.sound()?.whoosh(0.6, true, 0.1);
            // he runs in: it's urgent, there's pizza
            await jerry.walkTo(new Vector3(-1.2, 0, -1.2), true);
            jerry.face(stage.position);
          }
          return ctx.go("jerry");
        }
        if (step === "friends") return respond("jerry", ctx);
        return ctx.say(again(ctx, `john:${step}`, JOHN_SAYS[step] ?? JOHN_SAYS.present));

      case "jerry":
        if (step === "jerry") {
          await ctx.say([
            say("jerry", "Guys. GUYS. Look at this."),
            say("jerry", "FBLA. Future Business Leaders of America."),
            say("jerry", "First meeting Tuesday. FREE PIZZA."),
            say("john", "We’re not joining a club for pizza."),
          ]);
          const pick = await ctx.choose(say("jerry", "I am. Who’s with me?"), [
            { label: "…Business competitions, though. We could win those. All of them.", who: "aiden" },
            { label: "I’m with Jerry.", who: "aiden" },
          ]);
          sided = pick === 1;
          if (sided) {
            ctx.emote("jerry", "heart");
            await ctx.say([
              say("jerry", "…Really? Nobody’s ever with Jerry."),
              say("aiden", "Business competitions, then pizza. We win all of them."),
              say("john", "Fine. But Jerry’s carrying the pizza."),
              say("jerry", "Best. Day. Ever."),
            ]);
            ctx.feat("jerry");
          } else await ctx.say([say("john", "Fine. But Jerry’s carrying the pizza."), say("jerry", "Deal!")]);
          await ctx.open({ kind: "intro", who: "jerry", name: "Jerry", line: "The third founder. Load-bearing comic relief.", colour: "#4f9a5c" });
          ctx.hearts("jerry", sided ? 3 : 2);
          stage.actor("jerry")?.behave("follow", 1);
          return ctx.go("club");
        }
        if (step === "friends") {
          await ctx.say([say("john", "Ready?"), say("jerry", "On three. One, tw—")]);
          // the three caps come off the three heads
          const heads = [stage.position.clone().setY(1.9)];
          for (const who of ["john", "jerry"]) {
            const actor = stage.actor(who);
            if (!actor) continue;
            heads.push(actor.pos.clone().setY(1.9));
            if (actor.rig.cap) actor.rig.cap.visible = false;
          }
          const own = stage.aidenRig().cap;
          if (own) own.visible = false;
          field(ctx).toss(heads);
          for (const who of ["john", "jerry"]) stage.actor(who)?.pose("cheer", 2400);
          stage.pose("cheer", 2400);
          await ctx.open({ kind: "impact", text: "CLASS OF 2026", sub: "Caps up." });
          await ctx.say([
            say("aiden", "That summer, I dated a lot of baddies."),
            say("john", "Name one."),
            say("aiden", "…It was a busy summer."),
            say("jerry", "I believe you!"),
            say("john", "Jerry, you believe everything."),
          ]);
          const prove = await ctx.choose(say("john", "Names, Aiden. Or it didn’t happen."), [
            { label: "Get on my shoulders. I’ll show you.", who: "aiden" },
            { label: "A gentleman doesn’t tell.", who: "aiden" },
          ]);
          if (prove === 0) {
            await ctx.say([say("john", "Absolutely not."), say("aiden", "You asked for names."), say("john", "…One summer. That’s it.")]);
            const summer = await ctx.minigame("wingman");
            thrown = true;
            await ctx.say([
              say("note", `${summer.rizzed} ${summer.rizzed === 1 ? "baddie" : "baddies"} rizzed. ${summer.best} meters down the coast. Peak: ${summer.top}.`),
              say("john", "Okay. It was a busy summer."),
              say("aiden", "I was the launch platform. That’s leadership."),
              say("jerry", "Can I go next time?"),
              say("john", "No."),
              say("aiden", "No."),
            ]);
          } else await ctx.say([say("john", "That’s what I thought."), say("jerry", "I still believe you!")]);
          ctx.hearts("john", 5);
          ctx.hearts("jerry", 5);
          field(ctx).showSigns(true);
          stage.actor("john")?.behave("follow", -1);
          stage.actor("jerry")?.behave("follow", 1);
          return ctx.go("goodbye");
        }
        return ctx.say(again(ctx, `jerry:${step}`, JERRY_SAYS[step] ?? JERRY_SAYS.club));

      case "board":
        if (step === "jerry") return respond("jerry", ctx);
        return ctx.say(
          again(ctx, "board", [
            [say("aiden", "FBLA: first meeting Tuesday. Free pizza. Under it, in pen: “JERRY WAS HERE.”")],
            [say("aiden", "Under that, in different pen: “JERRY WAS ALSO HERE.”")],
          ]),
        );

      case "door":
        if (step === "club") {
          ctx.checkpoint(1);
          return conference(ctx);
        }
        if (step === "grad") {
          ctx.checkpoint(3);
          return graduation(ctx);
        }
        return ctx.say([say("aiden", step === "lunch" || step === "jerry" ? "Room 204. Somebody’s club, probably." : step === "case" ? "Trophy case first. We earned the look." : "Not yet.")]);

      case "lockers":
        return ctx.say(again(ctx, "lockers", [[say("aiden", "Locker 1127. Combination: the day AGNotify hit $10K.")], [say("aiden", "Inside: two textbooks and an empty shoebox. Old habits.")]]));
      case "vending":
        return ctx.say(
          again(ctx, "vending", [
            [say("aiden", "Out of everything except the one chip nobody likes. Classic supply and demand.")],
            [say("aiden", "Bought the chip nobody likes."), say("aiden", "…It’s fine. It’s actually fine.")],
            [say("aiden", "Nobody likes it because nobody’s tried it. That’s a market.")],
          ]),
        );

      // —— act two: win everything
      case "stage": {
        if (step !== "present") return ctx.say([say("aiden", "We already won this one.")]);
        const john = stage.actor("john");
        const jerry = stage.actor("jerry");
        john?.behave("idle");
        jerry?.behave("idle");
        await Promise.all([stage.goTo(new Vector3(0.05, 0, -2.25)), john?.walkTo(new Vector3(-0.75, 0, -2.4)), jerry?.walkTo(new Vector3(0.85, 0, -2.4))]);
        for (const who of [john, jerry]) who?.face(new Vector3(0, 0, 2));
        stage.faceTowards(new Vector3(0, 0, 2));
        await ctx.say([say("judge", "Event: Entrepreneurship. You have five minutes. Go.")]);
        let score = 0;
        jerrys = 0;
        const q1 = await ctx.choose(say("judge", "Who’s your customer, and how do you reach them?"), [
          { label: "Sneakerheads. They find us through referrals: every member brings two more.", who: "aiden" },
          { label: "Anyone who wants jeans cheaper. We find them with ads.", who: "john" },
          { label: "Everyone. Literally everyone. Babies, even.", who: "jerry" },
        ]);
        score += [3, 2, 0][q1];
        if (q1 === 2) jerrys += 1;
        babies = q1 === 2;
        await ctx.say([q1 === 0 ? say("judge", "Specific. Good.") : q1 === 1 ? say("judge", "Hm. Fine.") : say("judge", "…Babies.")]);
        if (q1 === 2) ctx.bubble("seat0-1", "haha", 1600);
        const q2 = await ctx.choose(say("judge", "How do you keep costs down?"), [
          { label: "No inventory. We never hold a single item.", who: "john" },
          { label: "Automate everything a person doesn’t need to do.", who: "aiden" },
          { label: "Jerry works for pizza.", who: "jerry" },
        ]);
        score += [3, 2, 2][q2];
        if (q2 === 2) jerrys += 1;
        await ctx.say([q2 === 2 ? say("judge", "…That is very efficient, actually.") : say("judge", q2 === 0 ? "Smart." : "Good.")]);
        const q3 = await ctx.choose(say("judge", "Last one. Why should we believe you’ll pull this off?"), [
          { label: "Because we already have. $45,000 in revenue.", who: "aiden" },
          { label: "Our projections are very conservative.", who: "john" },
          { label: "Because we’re best friends and we never lose.", who: "jerry" },
        ]);
        score += [3, 1, 3][q3];
        if (q3 === 2) jerrys += 1;
        await ctx.say([q3 === 2 ? say("judge", "…I believe him.") : q3 === 0 ? say("judge", "That’ll do it.") : say("judge", "Everyone says that.")]);
        await ctx.wait(400);
        for (const who of [john, jerry]) who?.pose("cheer", 2600);
        stage.pose("cheer", 2600);
        ctx.shake(0.6);
        await ctx.open({
          kind: "impact",
          text: "1ST PLACE",
          sub: score === 9 ? "A clean sweep" : jerrys === 3 ? "Jerry answered all three. Somehow." : jerrys > 0 ? "Somehow, Jerry’s answer won it" : score >= 7 ? "Specific, and it showed" : "By a nose",
        });
        ctx.hearts("john", 3);
        ctx.hearts("jerry", 3);
        if (jerrys === 3) {
          await ctx.say([
            say("jerry", "WE WON?"),
            say("john", "Jerry won."),
            say("jerry", "I WON?"),
            say("aiden", "Don’t let it go to your head."),
            say("note", "It went to his head. Then state. Then again. Then again."),
          ]);
          ctx.feat("alljerry");
        } else
          await ctx.say([
            say("jerry", "WE WON?"),
            say("john", "We won."),
            say("jerry", "Is there pizza for winning?"),
            say("aiden", "There’s state. Then there’s pizza."),
            say("note", "Then state. Then again. Then again."),
          ]);
        ctx.checkpoint(2);
        return seniorYear(ctx);
      }
      case "slide":
        return ctx.say(again(ctx, "slide", [[say("aiden", "Our slide. A chart that only goes up.")], [say("aiden", "John made the chart. The y-axis just says “up.”")]]));
      case "judges":
        return ctx.say(
          again(ctx, "judges", [
            [say("judge", "Present to the stage, please. We can see you from here.")],
            [say("judge", "The stage, please. We’re very patient.")],
            [say("judge", "We’ve started scoring this.")],
          ]),
        );

      // —— act three: the group chat
      case "trophies":
        if (step === "case") {
          await ctx.say([
            say("aiden", "Regionals. State. Again. And again."),
            say("john", "We should get a bigger case."),
            say("jerry", "That’s my thumb in the team photo."),
            say("john", "It’s in all of them, Jerry."),
            // what the judges heard, remembered
            ...(jerrys === 3
              ? [say("jerry", "Regionals was all me, though."), say("john", "It was. I think about it a lot.")]
              : babies
                ? [say("jerry", "The judges still ask about the babies."), say("john", "One judge, Jerry. Once.")]
                : []),
          ]);
          ctx.sound()?.blip(4);
          await ctx.open({
            kind: "chat",
            app: "phone",
            title: "future billionaires (+ jerry)",
            sub: "3 members",
            face: "chatter",
            group: true,
            messages: [
              { who: "John", text: "new drop. 40% margin. jeans" },
              { who: "Aiden", text: "AGNotify alert: john’s jeans are not a drop", me: true },
              { who: "Jerry", text: "what’s a margin again" },
              { who: "John", text: "no" },
              { who: "Aiden", text: "no", me: true },
              { who: "Jerry", text: "ok 👍" },
              { who: "chatter", text: "Jerry renamed the group “future billionaires (+ jerry, also a billionaire)”", system: true },
              { who: "chatter", text: "John renamed the group “future billionaires (+ jerry)”", system: true },
            ],
          });
          ctx.hearts("john", 4);
          ctx.hearts("jerry", 4);
          await ctx.say([say("aiden", "Graduation’s in a month."), say("jerry", "Then what?"), say("john", "Then everything.")]);
          return ctx.go("grad");
        }
        // the second look is at the glass, and whoever's in it
        if (nth(ctx, "trophies") > 1) return mirror(ctx, [say("aiden", "The glass is spotless. So is the guy in it.")]);
        return ctx.say([say("aiden", hallway(ctx).trophies ? "We need a bigger case." : "Empty. For now.")]);

      // —— act four: class of 2026
      case "principal":
        if (step === "walk") {
          await ctx.say([say("principal", "Aiden Guan.")]);
          ctx.sound()?.chime();
          for (const id of ["family0", "family1", "family2", "family4", "family5"]) ctx.bubble(id, "👏", 1800);
          await ctx.say([say("principal", "Congratulations. Go build something."), say("aiden", "Already on it.")]);
          stage.actor("john")?.place(new Vector3(-5.2, 0, 2.9), Math.PI * 0.4);
          stage.actor("jerry")?.place(new Vector3(-4.6, 0, 3.4), Math.PI * 0.6);
          return ctx.go("friends");
        }
        if (step === "friends" || step === "goodbye")
          return ctx.say(again(ctx, "principal", [[say("principal", "Your friends are by the goalposts.")], [say("principal", "The goalposts. The tall yellow things. You’ll find them.")]]));
        return ctx.say([say("principal", "Congratulations, again.")]);
      case "podium":
        return respond("principal", ctx);

      case "signs":
        if (step !== "goodbye") return ctx.say([say("aiden", "Three signs, three directions.")]);
        await ctx.say([
          say("aiden", "I want to try something new. Berkeley."),
          say("john", "USC."),
          say("jerry", "Community college. Then USC."),
          say("john", "He’ll make it."),
          say("jerry", "I’ll make it!"),
          // Jerry, who was right about FBLA, hears it from Aiden
          ...(sided ? [say("aiden", "You got us into FBLA, Jerry. You’ll make it."), say("jerry", "I’m putting that in the group chat.")] : []),
          say("aiden", "Group chat stays open."),
          say("john", "Obviously."),
          ...(thrown ? [say("john", "No more shoulders, though.")] : []),
        ]);
        stage.actor("john")?.behave("idle");
        stage.actor("jerry")?.behave("idle");
        stage.actor("john")?.walkTo(new Vector3(6.2, 0, 3.9));
        stage.actor("jerry")?.walkTo(new Vector3(5.6, 0, 4.2));
        await stage.goTo(new Vector3(-6.2, 0, 3.6));
        ctx.feat("classof");
        return ctx.end();

      case "phoebe":
        ctx.stage().cheer();
        return ctx.say([say("phoebe", "*wag*")]);

      default:
        return ctx.say([say("aiden", "Hm.")]);
    }
  }),
  end: {
    title: "Future Business Leaders",
    stats: [
      ["Best friends", "2"],
      ["FBLA trophies", "A shelf"],
      ["Group chats", "1, forever"],
      ["Handsome", "Max"],
    ],
    next: { number: "Chapter 3", title: "Golden Bear", line: "Berkeley. Lonely, then sick, then three first places.", chapter: "ch3" },
  },
};
