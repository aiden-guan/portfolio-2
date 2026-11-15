import { Vector3 } from "three";
import { LOOKS, someone } from "../people";
import type { ActorSpec } from "../stage";
import { JUN, MILES, milesJokes } from "./cast";
import { AT_TABLE, hackathonScene } from "./chapter3";
import { again, mirror, nth, noticing } from "./notice";
import { say, type Chapter, type Ctx, type Line } from "./types";

// The week after the second midterms. A fourth hackathon first: Nomen, with
// Dylan, at YC × Naïve. Then the grades land on the same lawn as last time,
// a 55 and a 20, not sick this time, and it's chill. Then alai's first video
// goes up, and Allen stops counting. alai is nearly out the door, and the
// story catches up with the present.

// The scouts' rows. The outliers are real ones Nomen found on its recorded
// run (README, "What it made"); the rest are the big accounts around them.
const SCOUTED: Array<Array<{ title: string; views: number; followers: number }>> = [
  [
    { title: "Brand ad", views: 2_100_000, followers: 3_800_000 },
    { title: "Unboxing", views: 410_000, followers: 900_000 },
    { title: "AI creator, to camera", views: 1_300_000, followers: 6_200 },
    { title: "Founder vlog", views: 88_000, followers: 120_000 },
  ],
  [
    { title: "3D ad, made in code", views: 644_000, followers: 1_800 },
    { title: "Celebrity skit", views: 9_400_000, followers: 31_000_000 },
    { title: "Day in the life", views: 1_100_000, followers: 2_600_000 },
    { title: "Podcast clip", views: 250_000, followers: 700_000 },
  ],
  [
    { title: "Talking head", views: 12_000_000, followers: 40_000_000 },
    { title: "Product demo", views: 3_200_000, followers: 9_100_000 },
    { title: "Tutorial", views: 600_000, followers: 2_400_000 },
    { title: "Brainrot meme", views: 81_000_000, followers: 235_000 },
  ],
  [
    { title: "POV skit", views: 18_000_000, followers: 52_000_000 },
    { title: "Agent, mid-list", views: 1_900_000, followers: 1_000 },
    { title: "Gym POV", views: 2_300_000, followers: 1_900_000 },
    { title: "Reaction", views: 700_000, followers: 300_000 },
  ],
];

const ALLEN_AT_DESK: ActorSpec = { id: "allen", look: LOOKS.allen, at: new Vector3(2.15, 0, -2.05), heading: Math.PI, pose: "type", seat: 0.45, label: "Allen", behaviour: "idle", solid: false };

// Miles, on the lawn again, asked for a joke
const GLADE_JOKES: Line[][] = [
  [say("miles", "I told a girl by the fountain you got a twenty. She said “in what.” I said “numbers.”")],
  [say("miles", "What’s the difference between a fifty-five and a twenty?"), say("aiden", "…What?"), say("miles", "Thirty-five.")],
  [say("miles", "Why did the midterm cross the road?"), say("aiden", "Don’t."), say("miles", "It didn’t. It was a midterm.")],
  [say("miles", "I’m out of jokes."), say("aiden", "You never had any."), say("miles", "And yet you’re smiling.")],
];

// —— act one: a fourth hackathon

async function naive(ctx: Ctx) {
  await hackathonScene(ctx, "naive", [AT_TABLE(1, "dylan", LOOKS.dylan, "Dylan")], { place: "Autonomous Company Hackathon", time: "YC × Naïve, Saturday" }, "Sat · YC × Naïve", 10 * 60);
  ctx.go("dylan");
  await ctx.say([say("aiden", "Midterms: done. Grades come back next week."), say("aiden", "Next week’s problem.")]);
}

// —— act two: the grades, on the same lawn as last time

async function grades(ctx: Ctx) {
  await ctx.scene({
    id: "glade",
    actors: [
      JUN(new Vector3(-1.4, 0, 1.6), { pose: "sit", seat: 0.3, heading: Math.PI * 0.7, behaviour: "idle" }),
      MILES(new Vector3(-0.6, 0, 1.2), { heading: Math.PI * 0.85 }),
      { id: "allen", look: LOOKS.allen, at: new Vector3(1.7, 0, 2.5), heading: -Math.PI * 0.75, label: "Allen", behaviour: "watch" },
      ...[0, 1, 2, 3].map((n): ActorSpec => ({ id: `lawn${n}`, look: someone(1960 + n * 13), at: new Vector3(-5 + n * 3.1, 0, 2.6 - (n % 2) * 3.4), heading: n * 1.3, pose: n % 2 ? "sit" : "stand", seat: 0.3, behaviour: n % 2 ? "idle" : "wander", area: { x0: -5.5, x1: 5.5, z0: -0.5, z1: 4 }, seed: n })),
    ],
    at: new Vector3(0.6, 0, 4.0),
    heading: Math.PI,
    banner: { place: "Memorial Glade", time: "The week after" },
    day: "Thu · Grades",
    clock: 15 * 60 + 10,
  });
  ctx.go("allen");
  // the same lawn, the same people, the same two emails, one class at a time
  await ctx.wait(1200);
  await ctx.open({
    kind: "email",
    app: "Mail",
    from: "Data C8 course staff",
    subject: "Midterm 2 grades are out",
    lines: ["Hi all,", "Midterm 2 grades are now posted.", "Your score: 55 / 100.", "Regrade requests close next Friday."],
    tone: "bad",
  });
  ctx.emote("aiden", "sweat");
  await ctx.say([say("aiden", "A 55."), say("aiden", "Not sick this time, either.")]);
  await ctx.open({
    kind: "email",
    app: "Mail",
    from: "Math 52 course staff",
    subject: "Midterm 2 scores",
    lines: ["Hi everyone,", "Midterm 2 is graded.", "Your score: 20 / 100.", "Solutions are on the course page."],
    tone: "bad",
  });
  // the 91's frame, for a 20
  ctx.shake(0.9);
  await ctx.open({ kind: "impact", text: "20", sub: "Math 52 · not sick this time" });
  ctx.feat("twenty");
  await ctx.say([
    say("miles", "Twenty. That’s a two, then a zero."),
    say("aiden", "That’s just how numbers work."),
    say("miles", "And yet you’re smiling."),
    say("aiden", "I’m really not."),
    say("jun", "Fifty-five and twenty. I’d fold."),
    say("allen", "Seventy-five, out of two hundred. Thirty-seven and a half percent."),
    say("aiden", "Thank you, Allen."),
    say("allen", "It isn’t good. I’d tell you if it was."),
    say("allen", "You co-founded a calculus tutor, and got a twenty in calculus."),
    say("aiden", "I was busy building the calculus tutor."),
    say("allen", "That’s the most founder sentence I’ve ever heard. I wrote it down."),
    say("allen", "Midterms, a final round, two applications and a hackathon, in the same two weeks. The midterms got what was left."),
  ]);
}

// —— act three: the first video

async function content(ctx: Ctx) {
  await ctx.scene({
    id: "dorm",
    night: true,
    features: ["trophies", "fourth", "ipad", "monitor", "late"],
    actors: [ALLEN_AT_DESK],
    at: new Vector3(-0.6, 0, 0.9),
    heading: Math.PI * 0.9,
    banner: { place: "The office (a dorm room)", time: "Thursday, 9:40 PM" },
    day: "Thu · Night",
    clock: 21 * 60 + 40,
  });
  ctx.go("film");
  await ctx.say([
    say("allen", "Video tonight. You write problem four, alai catches the wrong step, I hold the phone."),
    say("aiden", "A wrong step on purpose."),
    say("allen", "On purpose. I put it in the script."),
  ]);
}

/** Allen's launch checklist, on his phone, and where the story stops. */
async function launchList(ctx: Ctx) {
  const stage = ctx.stage();
  await ctx.open({
    kind: "chat",
    app: "phone",
    title: "alai · launch",
    sub: "Aiden, Allen",
    face: "allen",
    group: true,
    messages: [
      { who: "Allen", text: "Launch checklist. In order." },
      { who: "Allen", text: "✓ catches the wrong step, live" },
      { who: "Allen", text: "✓ the hint never gives the answer away" },
      { who: "Allen", text: "✓ voice doesn’t cut out mid-hint" },
      { who: "Allen", text: "✓ a video up every night" },
      { who: "Allen", text: "☐ launch" },
      { who: "Aiden", text: "so close", me: true },
      { who: "Allen", text: "Almost. I don’t round up." },
    ],
  });
  await ctx.say([
    say("aiden", "Two midterms, failed. A fourth first place. A tutor everyone’s asking about."),
    say("allen", "Fifty-five, twenty, four, and one launch. I’d lead with the four."),
    say("aiden", "And the twenty?"),
    say("allen", "Last. In small print. alai can help with the final."),
    say("aiden", "It’s chill."),
    say("allen", "It’s chill."),
    say("note", "That’s where the story is, right now."),
  ]);
  stage.actor("allen")?.pose("type");
  stage.pose("sit", 0, 0.45);
  ctx.feat("tbc");
  ctx.end();
}

/** What Allen says between the things that happen, by step. */
const ALLEN_SAYS: Record<string, Line[][]> = {
  film: [[say("allen", "The iPad. Problem four. I’m holding the phone already. My arm is getting tired.")]],
  hook: [[say("allen", "The first second decides everything. I read that eleven times.")]],
  phone: [[say("allen", "Your phone. It’s been buzzing for six minutes. I’m not counting. I’ve stopped.")]],
};

export const chapter5: Chapter = {
  id: "ch5",
  number: "Chapter 5",
  title: "It’s Chill",
  line: "A fourth first place, two midterm grades, and alai’s videos take off.",
  intro: ["Midterms, done.", "Not sick this time.", "The grades were a week away,", "and there was a hackathon on Saturday."],
  hud: { money: false, wins: true },
  acts: [
    { stats: { money: 0, wins: 3 }, run: naive },
    { stats: { money: 0, wins: 4 }, run: grades },
    { stats: { money: 0, wins: 4 }, run: content },
  ],
  objectives: {
    dylan: "Find Dylan",
    scouts: "Send out the scouts",
    demo: "Demo it",
    allen: "Talk to Allen",
    film: "Film alai on the iPad",
    hook: "Cut the video",
    phone: "Check your phone",
    launch: "Go over the launch list with Allen",
    done: "",
  },
  targets: {
    dylan: "dylan",
    scouts: "table",
    demo: "stage",
    allen: "allen",
    film: "ipad",
    hook: "laptop",
    phone: "phone",
    launch: "allen",
  },
  use: noticing(async function respond(id, ctx): Promise<void> {
    const step = ctx.step();
    const stage = ctx.stage();
    switch (id) {
      // —— YC × Naïve
      case "dylan":
        if (step === "dylan") {
          await ctx.say([
            say("dylan", "Theme’s autonomous companies. A company with nobody in it."),
            say("aiden", "A video studio. It finds the short videos that are winning, makes new ones like them, posts them, and learns from the numbers."),
            say("dylan", "On its own."),
            say("aiden", "On its own. And you can watch it work, like a camp. Scouts, a workshop, a screening room."),
            say("dylan", "A camp."),
            say("aiden", "With a Trojan horse."),
            say("dylan", "…Why a horse?"),
            say("aiden", "Everyone else is building a dashboard."),
            say("dylan", "Fair."),
            say("note", "Nomen. Scouts find what’s winning, the workshop makes the videos, and nothing posts until someone approves it."),
          ]);
          return ctx.go("scouts");
        }
        if (step === "scouts") return respond("table", ctx);
        return ctx.say(again(ctx, "dylan", [[say("dylan", "Ship it.")], [say("dylan", "The planner held. Don’t touch it. Don’t even look at it.")]]));

      case "table":
        if (step === "scouts") {
          await ctx.say([
            say("dylan", "Scouts are back. A hundred videos, nine ads, five Reddit threads."),
            say("aiden", "We only want the outliers. Way more views than the account has followers."),
          ]);
          const found = (await ctx.open<number>({ kind: "outliers", rounds: SCOUTED })) ?? 0;
          await ctx.say([
            say("dylan", found === SCOUTED.length ? "Every one." : "Close enough. The planner reruns it anyway."),
            say("aiden", "Views over followers. It’s just a ratio."),
            say("dylan", "That’s Data C8."),
            say("aiden", "…I’m aware."),
          ]);
          return ctx.go("demo");
        }
        if (step === "dylan") return respond("dylan", ctx);
        return ctx.say([say("aiden", "Laptops, cables, and a Trojan horse in a browser tab.")]);

      case "stage": {
        if (step !== "demo") return ctx.say([say("aiden", "Not yet. Build first.")]);
        await stage.goTo(new Vector3(-0.5, 0, -2.4));
        stage.faceTowards(new Vector3(-0.5, 0, 2));
        await ctx.say([
          say("aiden", "This is Nomen. Point it at a brand’s website once. It finds what’s winning, makes the videos, and posts the ones you approve."),
          say("dylan", "Then it reads the numbers and starts the next campaign. By itself."),
        ]);
        stage.pose("cheer", 2600);
        stage.actor("dylan")?.pose("cheer", 2600);
        ctx.shake(0.6);
        await ctx.open({ kind: "impact", text: "1ST PLACE", sub: "Monid track · YC × Naïve" });
        ctx.stat("wins", 4, 300);
        ctx.feat("monid");
        await ctx.say([
          say("note", "And 2nd place overall."),
          say("note", "$3,000 for the Monid track. A Mac mini and AirPods for second overall."),
          say("dylan", "The Mac mini’s for the agents. They earned it."),
          say("aiden", "And the AirPods?"),
          say("dylan", "Those are for me. I earned those."),
          say("note", "Four first places. Grades on Thursday."),
        ]);
        ctx.checkpoint(1);
        return grades(ctx);
      }
      case "pizza":
        return ctx.say(again(ctx, "pizza", [[say("aiden", "Pizza at ten in the morning. Hackathon breakfast.")], [say("aiden", "One slice left in every box. Nobody takes the last slice.")]]));
      case "screen":
        return ctx.say(again(ctx, "screen", [[say("aiden", "YC × Naïve. The clock on the screen only goes one way.")], [say("aiden", "Down. Like my grades, probably. Next week’s problem.")]]));
      case "beanbag":
        return ctx.say(again(ctx, "beanbag", [[say("aiden", "Somebody’s been asleep in that since the opening talk.")], [say("aiden", "The fourth beanbag I’ve seen like this. Respect, again.")]]));

      // —— the glade
      case "allen":
        if (step === "allen") {
          const pick = await ctx.choose(say("allen", "Are you okay? Honest answer."), [
            { label: "It’s chill.", who: "aiden" },
            { label: "It’s not chill.", who: "aiden" },
          ]);
          await ctx.say(
            pick === 0
              ? [say("allen", "Explain “chill.” Use numbers.")]
              : [say("aiden", "…Okay. It’s a little chill."), say("allen", "That changed fast. Explain. Use numbers.")],
          );
          await ctx.say([
            say("aiden", "One. Saturday, Nomen took first in the Monid track. And second overall."),
            say("allen", "Both true. I’d lead with first."),
            say("aiden", "Two. alai’s about to launch."),
            say("allen", "Almost about to. There’s one thing left on the checklist."),
            say("aiden", "Three. The final’s in December, and I co-founded a calculus tutor."),
            say("allen", "Then you’re our hardest test. If alai gets you past a twenty, it works on anyone."),
            say("aiden", "So it’s chill."),
            say("jun", "It’s alright, I guess."),
            say("miles", "What do you call a guy who got a twenty?"),
            say("aiden", "Don’t."),
            say("miles", "Aiden. That’s just your name."),
            say("allen", "That isn’t a joke. That’s his name and a number."),
            say("miles", "Thank you."),
            say("allen", "That wasn’t a compliment."),
            say("allen", "Also: we’re filming tonight. You promised. It’s in my calendar."),
          ]);
          ctx.checkpoint(2);
          return content(ctx);
        }
        if (step === "launch") return launchList(ctx);
        return ctx.say(again(ctx, `allen:${step}`, ALLEN_SAYS[step] ?? [[say("allen", "Ship first. Sleep later. Study, also. I’ve added it.")]]));
      case "miles":
        return milesJokes(ctx, "miles", GLADE_JOKES);
      case "jun":
        return ctx.say(again(ctx, "jun", [[say("jun", "Poker tonight. You need a win.")], [say("aiden", "I won on Saturday."), say("jun", "A win at poker. The other ones don’t count.")], [say("jun", "A twenty’s a bluff that got called. Happens to everyone."), say("jun", "Not to me.")]]));
      case "campanile":
        return ctx.say(again(ctx, "campanile", [[say("aiden", "Same tower. Same lawn. Last time it was a 91.")], [say("aiden", "It rings every hour. It doesn’t care what I got.")]]));
      case "library":
        return ctx.say(again(ctx, "library", [[say("aiden", "Doe Library. I should be in there. With the textbook.")], [say("aiden", "The Math 52 textbook is free online. I’ve heard. I haven’t checked.")]]));
      case "bench":
        return ctx.say([say("aiden", "Allen’s bench. “Where alai didn’t give up.” Not giving up on Math 52, either.")]);
      case "flyer":
        return ctx.say(again(ctx, "flyer", [[say("aiden", "Final exam review sessions. Plural. I’ll be at all of them.")], [say("aiden", "Under it, a tutoring ad. Every tab torn off. We should put one up.")]]));

      // —— the office (a dorm room)
      case "ipad":
        if (step === "film") {
          await ctx.say([
            say("note", "Aiden writes problem four. Step two goes wrong, on purpose. Allen holds the phone."),
            say("alai", "Check your second line. What happens to the minus sign when you distribute?"),
            say("allen", "Got it. Again, though. Your hand was in the shot."),
            say("aiden", "It’s a handwriting app, Allen. The hand is the shot."),
            say("allen", "…That’s fair. Keep the hand."),
          ]);
          return ctx.go("hook");
        }
        // a second look, and the dark screen gives you back
        if (nth(ctx, "ipad") > 1) return mirror(ctx, [say("aiden", "The screen dims. In the glass: a 20 in Math 52, and still maxed.")]);
        return ctx.say([say("aiden", "alai, open on problem four. It’s caught that minus sign eleven times tonight.")]);

      case "laptop":
        if (step === "hook") {
          await ctx.say([say("allen", "Now the hook. Most hooks are bad. I’ve watched four hundred of them.")]);
          await ctx.open({
            kind: "hook",
            right: 1,
            editor: { name: "Allen", face: "allen", sub: "Allen · the first second decides everything" },
            game: "hook:alai",
            hooks: [
              { text: "Introducing alai: a voice-first AI tutor for STEM homework.", reply: "That’s our landing page. Nobody stops scrolling for a landing page." },
              { text: "It caught my mistake before I finished writing it.", reply: "Seventy-two of a hundred stopped. I’d like to rerun it, but that’s the one." },
              { text: "I got a 20 on my calc midterm.", reply: "True. Relatable. They stayed for the twenty and left before the tutor." },
              { text: "Wait for it…", reply: "They didn’t." },
            ],
          });
          ctx.glint();
          await ctx.say([say("allen", "Post it.")]);
          await ctx.open({
            kind: "reel",
            caption: "it caught my mistake before i finished writing it 😭✏️",
            comments: ["wait what app is this", "i need this for calc", "drop the link 🙏", "my tutor doesn’t even do this", "is it out yet??", "waitlist where", "showing my whole class", "the minus sign 💀"],
            lost: "▶ Allen stopped counting",
          });
          ctx.feat("uncounted");
          ctx.sound()?.notify();
          ctx.bubble("phone", "bzzt bzzt bzzt", 0);
          await ctx.say([
            say("allen", "Three hundred. Four hundred. Nine hundred."),
            say("allen", "…I stopped counting."),
            say("aiden", "You never stop counting."),
            say("allen", "I know. That’s how you know."),
          ]);
          return ctx.go("phone");
        }
        if (step === "launch") return ctx.say([say("aiden", "The checklist isn’t on the laptop. It’s on Allen’s phone. Of course it is.")]);
        if (step === "film") return ctx.say([say("aiden", "Film first. The laptop’s for the cut.")]);
        return ctx.say(again(ctx, "laptop", [[say("aiden", "Forty tabs. Half are comments on the video.")], [say("aiden", "The other half are Allen’s model. Forty-one tabs, now.")]]));

      case "phone":
        if (step === "phone") {
          ctx.bubble("phone", "");
          await ctx.open({
            kind: "chat",
            app: "phone",
            title: "Instaglam · @alai",
            sub: "requests",
            face: "alai",
            group: true,
            messages: [
              { who: "maya.r", text: "is alai out yet", wait: 480 },
              { who: "devon", text: "when does it launch", wait: 420 },
              { who: "kels", text: "can my whole calc class get this", wait: 420 },
              { who: "ty", text: "my little brother needs this asap", wait: 380 },
              { who: "priya.s", text: "waitlist link??", wait: 360 },
              { who: "noah", text: "the minus sign part got me", wait: 340 },
              { who: "chatter", text: "more than Allen can count", system: true },
            ],
          });
          await ctx.say([
            say("aiden", "Everyone wants to know when."),
            say("allen", "Soon. I have a checklist."),
            say("aiden", "We post another one tomorrow."),
            say("allen", "And the day after. It’s in my calendar."),
            say("note", "They kept posting. It kept going."),
          ]);
          return ctx.go("launch");
        }
        return ctx.say(
          again(ctx, "phone", [
            [say("aiden", "The group chat. John: “a 20??” Jerry: “thats a good score in golf”.")],
            [say("aiden", "John again: “congrats on the hackathon tho”. Jerry: “also golf”.")],
          ]),
        );

      case "trophies":
        return ctx.say(
          again(ctx, "trophies", [
            [say("aiden", "BarkOff, alai, Continuity, Nomen. Four cups, one windowsill.")],
            [say("allen", "I moved the other three a centimeter each to make room. The light still hits all four. I checked.")],
          ]),
        );
      case "window":
        return ctx.say(again(ctx, "window", [[say("aiden", "The Campanile. It was there for the 91, too.")], [say("aiden", "Still ringing. Still awake, like us.")]]));
      case "photo":
        return ctx.say(again(ctx, "photo", [[say("aiden", "Phoebe. She’d still think I’m a genius. She can’t read grades.")], [say("aiden", "She’d be in the video. The dog tests well.")]]));
      case "pennant":
        return ctx.say(again(ctx, "pennant", [[say("aiden", "Go Bears.")], [say("aiden", "Four degrees crooked, says Allen. Still leaving it.")]]));
      case "fridge":
        return ctx.say(again(ctx, "fridge", [[say("aiden", "Cold brew, cold brew, and a sticky note from Allen: “study (also).”")], [say("aiden", "The mystery yogurt’s back. Nobody will say who.")]]));
      case "roommate":
        return ctx.say(again(ctx, "roommate", [[say("allen", "Miles’s desk. Mine from eleven to three, and from nine tonight. I told him. He said cool.")], [say("allen", "He asked if he could be in a video. I said we’d test it.")]]));
      case "board":
        return ctx.say(
          again(ctx, "board", [
            [say("aiden", "“3 for 3” is crossed out. Under it, in Allen’s writing: “4 first places. 1 launch. Math 52 final: TBD.”")],
            [say("aiden", "Under that, also Allen’s: “sleep (still optional).”")],
          ]),
        );
      case "bed":
        return ctx.say(again(ctx, "bed", [[say("aiden", "After the launch.")], [say("aiden", "Allen slept on Tuesday again. I’m aiming for December.")]]));
      case "door":
        return ctx.say(again(ctx, "door", [[say("aiden", "Hallway. Popcorn again.")], [say("aiden", "Somebody down the hall is watching our video. I can hear the minus sign.")]]));
      case "phoebe":
        return;
      default:
        return ctx.say([say("aiden", "Hm.")]);
    }
  }),
  end: {
    title: "It’s Chill",
    tbc: true,
    stats: [
      ["Midterms", "55 and 20"],
      ["1st places", "4"],
      ["alai", "Almost out"],
      ["Handsome", "Max"],
    ],
    next: { number: "Chapter 6", title: "To be continued", line: "This is where life is, right now. The next chapter is still happening." },
  },
};
