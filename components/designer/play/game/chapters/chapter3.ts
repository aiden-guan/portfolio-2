import { Vector3 } from "three";
import { LOOKS, someone } from "../people";
import { TEAM } from "../rooms/hackathon";
import { ROWS } from "../rooms/hall";
import type { Question } from "../screens-berkeley";
import type { ActorSpec } from "../stage";
import { GUESTS, JUN, junBargesIn, MILES, milesJokes } from "./cast";
import { DATA_MIDTERM_1, examHall, HALL_SEAT, hallStudents, MATH_MIDTERM_1, MATH_REVIEW, sitExam } from "./midterms";
import { again, mirror, noticing, nth } from "./notice";
import { say, type Chapter, type Ctx, type Line } from "./types";

// Berkeley, the first stretch: a fine friend group and nothing happening,
// the group chat going quiet, two classes that don't make sense yet. Sick
// the week before midterms, sick again the morning of, two Tylenol, an 86
// and a 91. Then it all opens up: the floor, boba, and three hackathons in
// a row, three first places, and a city full of people building things.

const FLOORMATES = (at: Vector3, extra: Partial<ActorSpec> = {}): ActorSpec[] => [
  { id: "floormate", look: someone(901, { skin: 0xd9a277, hair: "messy", hairColor: 0x4a3324, top: 0xd74718, style: "hoodie" }), at, label: "Floormate", behaviour: "watch", ...extra },
  { id: "floormate2", look: someone(907, { skin: 0xf3cfae, hair: "long", hairColor: 0x2a2420, top: 0x8fd3b6, style: "tee" }), at: at.clone().add(new Vector3(0.6, 0, 0.3)), label: "Floormate", behaviour: "watch", ...extra },
];

const HOMEWORK: Question[] = [
  { q: "tbl.where('major', are.equal_to('Data Science'))\n\nWhat comes back?", options: ["A table, only the Data Science rows", "One column", "The number of rows", "An error"], answer: 0 },
  { q: "np.mean(make_array(2, 4, 9))", options: ["4", "5", "15", "3"], answer: 1 },
  { q: "You simulate 10,000 fair coin flips. The proportion of heads is most likely near…", options: ["0", "1", "0.5", "10,000"], answer: 2 },
];
const PRACTICE: Question[] = [
  { q: "A 95% confidence interval for a mean means:", options: ["95% of the data falls inside it", "Repeat the process, and about 95% of intervals catch the true mean", "There's a 95% chance the mean is in this one", "The sample is 95% accurate"], answer: 1 },
  { q: "Bootstrapping means resampling…", options: ["from the population, without replacement", "from your sample, with replacement", "from your sample, without replacement", "until the p-value is small"], answer: 1 },
  { q: "tbl.column('price') gives you…", options: ["a table with one column", "an array of that column’s values", "the column’s label", "the first price"], answer: 1 },
];

// Miles, asked again and again: none of them are jokes
const GLADE_JOKES: Line[][] = [
  [say("miles", "I told a girl by the fountain you got a ninety-one. She said “in what.” I said “numbers.”")],
  [say("miles", "What’s the difference between a midterm and a final?"), say("aiden", "…What?"), say("miles", "One’s in the middle.")],
  [say("miles", "Why is the glade so green?"), say("aiden", "Don’t."), say("miles", "Grass.")],
  [say("miles", "I’m out of jokes."), say("aiden", "You never had any."), say("miles", "And yet you’re smiling.")],
];
const PARTY_JOKES: Line[][] = [
  [say("miles", "What do you call a guy with three first places?"), say("aiden", "What?"), say("miles", "Aiden. That’s just your name.")],
  [say("miles", "How many people fit in a double?"), say("aiden", "Two."), say("miles", "Seven. Housing doesn’t need to know.")],
  [say("miles", "Knock knock."), say("aiden", "Who’s there?"), say("miles", "Everyone I met tonight.")],
  [say("miles", "I’m out of jokes."), say("aiden", "You never had any."), say("miles", "And yet you’re smiling.")],
];

/** Which hackathon the room is, from the step. */
const eventOf = (step: string) => (step === "build1" || step === "demo1" ? "buildnight" : step === "build3" || step === "demo3" ? "yc" : "speedhacks");

// —— act one: week one

async function weekOne(ctx: Ctx) {
  dealt = false;
  await ctx.scene({
    id: "dorm",
    night: true,
    features: ["boxes"],
    actors: [MILES(new Vector3(2.5, 0, 0.5), { heading: -Math.PI / 2 })],
    at: new Vector3(-0.7, 0, 0.9),
    heading: Math.PI * 1.1,
    banner: { place: "Berkeley", time: "Week one, 11:40 PM" },
    day: "Mon · Week 1",
    clock: 23 * 60 + 40,
  });
  ctx.go("miles");
  await ctx.say([say("aiden", "Week one."), say("aiden", "Everyone’s nice. Nothing’s happening.")]);
}

async function lecture(ctx: Ctx) {
  await ctx.scene({
    id: "hall",
    hall: "lecture",
    slide: "DATA C8",
    actors: [{ id: "professor", look: LOOKS.professor, at: new Vector3(-0.2, 0, -3.95), heading: 0, label: "Professor", pose: "talk" }, ...hallStudents(410, "type")],
    banner: { place: "Data C8", time: "Tuesday, 10:00 AM" },
    day: "Tue · Week 2",
    clock: 10 * 60,
  });
  ctx.go("sit");
}

async function sickWeek(ctx: Ctx) {
  await ctx.scene({
    id: "dorm",
    night: true,
    features: ["sick"],
    at: new Vector3(-1.6, 0, -1.2),
    heading: Math.PI,
    banner: { place: "The week before midterms", time: "Sunday, 1:12 AM" },
    day: "Sun · Week 5",
    clock: 60 + 12,
  });
  ctx.stage().pose("sick");
  ctx.sound()?.cough();
  ctx.go("study");
  await ctx.say([say("aiden", "Data C8 and Math 52 midterms, both on Wednesday."), say("aiden", "Fever on Sunday. Great timing, body.")]);
}

async function midtermDay(ctx: Ctx) {
  await ctx.scene({
    id: "dorm",
    features: ["sick"],
    lying: true,
    banner: { place: "Midterm day", time: "Wednesday, 7:00 AM" },
    day: "Wed · Midterms",
    clock: 7 * 60,
  });
  ctx.sound()?.alarm();
  ctx.bubble("phone", "BEEP BEEP", 0);
  ctx.go("wake");
}

async function afterMidterms(ctx: Ctx) {
  await ctx.scene({
    id: "glade",
    actors: [
      JUN(new Vector3(-1.4, 0, 1.6), { pose: "sit", seat: 0.3, heading: Math.PI * 0.7, behaviour: "idle" }),
      MILES(new Vector3(-0.6, 0, 1.2), { heading: Math.PI * 0.85 }),
      FLOORMATES(new Vector3(-2.0, 0, 2.3), { pose: "sit", seat: 0.3, heading: Math.PI * 0.6, behaviour: "idle" })[1],
      ...[0, 1, 2, 3, 4].map((n): ActorSpec => ({ id: `lawn${n}`, look: someone(950 + n * 13), at: new Vector3(-5 + n * 2.4, 0, 2.6 - (n % 2) * 3.4), heading: n * 1.3, pose: n % 2 ? "sit" : "stand", seat: 0.3, behaviour: n % 2 ? "idle" : "wander", area: { x0: -5.5, x1: 5.5, z0: -0.5, z1: 4 }, seed: n })),
    ],
    at: new Vector3(0.6, 0, 4.0),
    heading: Math.PI,
    banner: { place: "Memorial Glade", time: "After midterms" },
    day: "Fri · Week 7",
    clock: 15 * 60 + 30,
  });
  ctx.go("hang");
  // the grades land on the lawn, one class at a time
  await ctx.wait(1200);
  await ctx.open({
    kind: "email",
    app: "Mail",
    from: "Data C8 course staff",
    subject: "Midterm 1 grades are out",
    lines: ["Hi all,", "Midterm 1 grades are now posted.", "Your score: 86 / 100.", "Regrade requests close next Friday."],
    tone: "good",
  });
  // the first one is a bump; the second is the hit
  ctx.emote("aiden", "!");
  ctx.shake(0.2);
  await ctx.say([
    say("aiden", "An 86. In the class where my one question was “what is happening.”"),
    ...(felt.data >= 0 && felt.data < 3 ? [say("aiden", "I walked out of that room sure I’d failed it.")] : []),
  ]);
  await ctx.open({
    kind: "email",
    app: "Mail",
    from: "Math 52 course staff",
    subject: "Midterm 1 scores",
    lines: ["Hi everyone,", "Midterm 1 is graded.", "Your score: 91 / 100.", "Solutions are on the course page."],
    tone: "good",
  });
  ctx.stat("ready", 100, 600);
  ctx.shake(0.9);
  await ctx.open({ kind: "impact", text: "91", sub: "Math 52 · sick twice, still a 91" });
  ctx.feat("ninetyone");
  await ctx.say([
    ...(felt.math >= 0 && felt.math < 3 ? [say("aiden", "A 91. I thought I’d integrated my own name.")] : []),
    say("miles", "Ninety-one. That’s a nine, then a one."),
    say("aiden", "That’s just how numbers work."),
    say("miles", "And yet you’re smiling."),
    say("jun", "Eighty-six and ninety-one. I’d play that hand."),
    say("aiden", "Midterms: done. Fever: gone."),
    say("aiden", "For the first time since I got here, nothing’s due."),
  ]);
}

async function hackathonScene(ctx: Ctx, event: "buildnight" | "speedhacks" | "yc", team: ActorSpec[], banner: { place: string; time: string }, day: string, clock: number) {
  const crowd: ActorSpec[] = [];
  [-3.6, -2.0, -0.4].forEach((z, r) =>
    [-5.0, -4.2, -3.4, -2.6, -1.8, 1.0, 1.8, 2.6, 3.4, 4.2].forEach((x, i) => {
      if ((r * 3 + i) % 4 === 1 || (z === 0.2 && x > 0.5 && x < 2.9)) return;
      crowd.push({ id: `h${r}-${i}`, look: someone(1200 + r * 19 + i * 7 + event.length), at: new Vector3(x, 0, z + (i % 2 ? 0.95 : -0.45)), heading: i % 2 ? Math.PI : 0, pose: "type", seat: 0.45, solid: false });
    }),
  );
  await ctx.scene({ id: "hackathon", event, actors: [...team, ...crowd], at: new Vector3(5.6, 0, 3.6), heading: -Math.PI * 0.75, banner, day, clock });
}

const AT_TABLE = (i: number, id: string, look: ActorSpec["look"], label: string): ActorSpec => ({ id, look, at: new Vector3(TEAM.xs[i], 0, TEAM.far), heading: 0, pose: "type", seat: 0.45, label, behaviour: "idle", solid: false });

async function buildNight(ctx: Ctx) {
  await hackathonScene(
    ctx,
    "buildnight",
    FLOORMATES(new Vector3(TEAM.xs[1], 0, TEAM.far), { pose: "type", seat: 0.45, heading: 0, behaviour: "idle", solid: false }).map((a, i) => ({ ...a, at: new Vector3(TEAM.xs[1 + i], 0, TEAM.far) })),
    { place: "SpaceXAI Build Night", time: "Friday, 9:00 PM" },
    "Fri · Build Night",
    21 * 60,
  );
  ctx.go("build1");
  await ctx.say([say("floormate", "Table’s ours. What are we building?"), say("aiden", "Give me a minute. I’ve got an idea, and it’s stupid.")]);
}

async function speedHacks(ctx: Ctx) {
  await hackathonScene(ctx, "speedhacks", [AT_TABLE(1, "allen", LOOKS.allen, "Allen")], { place: "a16z SpeedHacks", time: "Saturday, 10:00 AM" }, "Sat · SpeedHacks", 10 * 60);
  ctx.go("meetAllen");
}

async function agentsWant(ctx: Ctx) {
  await hackathonScene(
    ctx,
    "yc",
    [AT_TABLE(1, "dylan", LOOKS.dylan, "Dylan"), AT_TABLE(2, "samuel", LOOKS.samuel, "Samuel")],
    { place: "Make Something Agents Want", time: "Y Combinator, Saturday" },
    "Sat · YC",
    11 * 60,
  );
  ctx.go("build3");
}

async function topOfTheWorld(ctx: Ctx) {
  await ctx.scene({
    id: "dorm",
    night: true,
    actors: [MILES(new Vector3(2.0, 0, 1.0), { heading: -Math.PI * 0.6, pose: "talk" }), ...GUESTS(1700)],
    at: new Vector3(-0.8, 0, 0.6),
    heading: Math.PI * 1.1,
    // the night after the third one
    banner: { place: "Back in the dorm", time: "Sunday, 1:40 AM" },
    day: "Sun · Week 9",
    clock: 60 + 40,
  });
  ctx.bubble("phone", "bzzt bzzt bzzt", 0);
  ctx.bubble("guest2", "wait, YOU’RE the barking guy?", 2600);
  await ctx.say([
    say("aiden", "Three hackathons. Three first places."),
    say("miles", "Aiden. These are my friends. I met them forty minutes ago."),
    say("aiden", "All of them?"),
    say("miles", "Some of them twenty."),
    say("miles", "Why did the girl bring a ladder to the party?"),
    say("aiden", "Why?"),
    say("miles", "She didn’t. I don’t know why I said that."),
    say("note", "Miles could talk to anyone. He just couldn’t tell a joke."),
    say("aiden", "And my phone hasn’t stopped buzzing since Saturday."),
  ]);
  ctx.go("dms");
}

async function sanFrancisco(ctx: Ctx) {
  await ctx.scene({
    id: "office",
    dusk: true,
    actors: [
      { id: "founder", look: LOOKS.founder, at: new Vector3(-2.6, 0, 0.9), heading: Math.PI * 0.2, label: "Founder", behaviour: "watch" },
      { id: "founder2", look: LOOKS.founder2, at: new Vector3(2.1, 0, -0.4), heading: -Math.PI * 0.6, label: "Founder", behaviour: "watch" },
      { id: "founder3", look: LOOKS.founder3, at: new Vector3(-4.6, 0, 1.6), heading: Math.PI * 0.5, label: "Founder", behaviour: "watch" },
      ...[0, 1, 2].map((n): ActorSpec => ({ id: `desk${n}`, look: someone(1400 + n * 11), at: new Vector3(-3.3 + n * 2.6, 0, -1.25), heading: Math.PI, pose: "type", solid: false })),
    ],
    at: new Vector3(0.4, 0, 3.5),
    heading: Math.PI,
    banner: { place: "San Francisco", time: "The week after" },
    day: "Thu · SF",
    clock: 18 * 60 + 20,
  });
  ctx.go("founders");
}

/** Who's been met in San Francisco. */
let met = new Set<string>();
/** How the two midterms felt, for when the grades come back. */
const felt = { data: -1, math: -1 };
/** Whether Aiden said yes to Jun's poker, week one. */
let dealt = false;

const sick = (step: string) => step === "study" || step === "study2" || step === "sleep";
/** Still sick: the week before, and the morning of. */
const ill = (step: string) => sick(step) || step === "pills" || step === "leave";
const weekOneSteps = (step: string) => step === "miles" || step === "chat" || step === "window" || step === "photo";

export const chapter3: Chapter = {
  id: "ch3",
  number: "Chapter 3",
  title: "Golden Bear",
  line: "Lonely, sick twice, an 86 and a 91. Then three hackathons, three first places.",
  intro: ["Fall, 2026. Berkeley.", "A room the size of a closet.", "Four hundred miles from the group chat.", "Nothing wrong. Nothing happening."],
  hud: { money: false, ready: "Midterm prep", wins: true },
  target: (step) => (step === "founders" ? ["founder", "founder2", "founder3"].find((id) => !met.has(id)) : undefined),
  acts: [
    { stats: { money: 0, ready: 0, wins: 0 }, run: weekOne },
    { stats: { money: 0, ready: 0, wins: 0 }, run: lecture },
    { stats: { money: 0, ready: 25, wins: 0 }, run: sickWeek },
    { stats: { money: 0, ready: 70, wins: 0 }, run: midtermDay },
    { stats: { money: 0, ready: 100, wins: 0 }, run: afterMidterms },
    { stats: { money: 0, ready: 100, wins: 0 }, run: buildNight },
    { stats: { money: 0, ready: 100, wins: 1 }, run: speedHacks },
    { stats: { money: 0, ready: 100, wins: 2 }, run: agentsWant },
    {
      stats: { money: 0, ready: 100, wins: 3 },
      run: async (ctx) => {
        met = new Set();
        await topOfTheWorld(ctx);
      },
    },
  ],
  objectives: {
    miles: "Talk to Miles",
    chat: "Check the group chat",
    window: "Look out the window",
    photo: "Look at the photo on the desk",
    sit: "Find a seat",
    homework: "Do the problem set",
    study: "Study (you’re sick)",
    study2: "Keep going: Math 52",
    sleep: "Go to bed",
    wake: "Get up",
    pills: "Take a Tylenol",
    leave: "Go to your midterms",
    exam: "Find your seat for Data C8",
    exam2: "Math 52, midterm 1",
    hang: "Hang out with the floor",
    flyer: "Check the kiosk",
    build1: "Build something at your table",
    demo1: "Demo it",
    meetAllen: "Find Allen",
    build2: "Build alai",
    demo2: "Demo it",
    build3: "Build Continuity",
    demo3: "Demo it",
    dms: "Check your phone",
    founders: "Meet the founders",
    window2: "Look at the city",
    done: "",
  },
  targets: {
    miles: "miles",
    chat: "phone",
    window: "window",
    photo: "photo",
    sit: "seat",
    homework: "laptop",
    study: "laptop",
    study2: "laptop",
    sleep: "bed",
    pills: "pills",
    leave: "door",
    exam: "seat",
    hang: "jun",
    flyer: "flyer",
    build1: "table",
    demo1: "stage",
    meetAllen: "allen",
    build2: "table",
    demo2: "stage",
    build3: "table",
    demo3: "stage",
    dms: "phone",
    founders: "founder",
    window2: "window",
  },
  wake: async (ctx) => {
    const stage = ctx.stage();
    ctx.bubble("phone", "");
    stage.wake();
    await ctx.wait(950);
    stage.pose("sick");
    ctx.sound()?.cough();
    await ctx.say([say("aiden", "No."), say("aiden", "No no no. Not today."), say("aiden", "…Okay. Okay. One thing at a time.")]);
    ctx.go("pills");
  },
  use: noticing(async function respond(id, ctx): Promise<void> {
    const step = ctx.step();
    const stage = ctx.stage();
    switch (id) {
      // —— week one
      case "phone":
        if (step === "chat") {
          await ctx.open({
            kind: "chat",
            app: "phone",
            title: "future billionaires (+ jerry)",
            sub: "3 members",
            face: "chatter",
            group: true,
            messages: [
              { who: "John", text: "usc is insane bro" },
              { who: "John", text: "400 people on one lawn. sold 3 pairs of jeans" },
              { who: "Jerry", text: "cc parking lot is also insane" },
              { who: "Jerry", text: "someone took my spot. third time" },
              { who: "Aiden", text: "miss you guys", me: true },
              { who: "John", text: "who is this" },
              { who: "John", text: "jk. miss you too. go to sleep" },
              { who: "chatter", text: "Seen by Jerry, 12:04 AM", system: true },
            ],
          });
          await ctx.say([say("aiden", "They’re busy. Good for them."), say("aiden", "I’m busy too. Technically.")]);
          return ctx.go("window");
        }
        if (step === "dms") {
          ctx.bubble("phone", "");
          await ctx.open({
            kind: "chat",
            app: "phone",
            title: "Instaglam · requests",
            sub: "41 new",
            face: "dm",
            group: true,
            messages: [
              { who: "lena.k", text: "wait you won ANOTHER one?? 👀", wait: 520 },
              { who: "mira", text: "are you the barking guy", wait: 420 },
              { who: "jas", text: "my roommate says you’re in data 8", wait: 420 },
              { who: "chloe", text: "congrats!! coffee sometime?", wait: 380 },
              { who: "nat.w", text: "ur the alai guy right", wait: 360 },
              { who: "sasha", text: "hiii", wait: 340 },
              { who: "em", text: "saw the YC post. impressive 👏", wait: 340 },
              { who: "chatter", text: "+34 more", system: true },
            ],
          });
          await ctx.say([
            say("aiden", "Like the summer."),
            say("aiden", "Except this time they found me on LockedIn."),
            say("miles", "Between your phone and my friends, this room has never been this full."),
          ]);
          ctx.glint();
          ctx.sound()?.sparkle();
          await ctx.say([say("note", "A week later, a founder from one of the hackathons invited Aiden up to San Francisco to see the office.")]);
          ctx.checkpoint(8);
          return sanFrancisco(ctx);
        }
        if (sick(step)) return ctx.say([say("aiden", "The group chat says “drink water.” Helpful.")]);
        if (step === "pills" || step === "leave") return ctx.say([say("aiden", "No texts. Just the alarm, and the alarm’s right.")]);
        return ctx.say(again(ctx, "phone", [[say("aiden", "Nothing new. It’s fine.")], [say("aiden", "Still nothing. It’s fine. Everything’s fine.")]]));

      case "window":
        if (step === "window") {
          await ctx.say([say("aiden", "The Campanile. Lit up all night, rings every hour."), say("aiden", "I’ve heard every hour this week.")]);
          return ctx.go("photo");
        }
        if (step === "window2") return respond("founder2", ctx);
        if (step === "founders") return ctx.say([say("aiden", "The Bay Bridge, lighting up. Somebody in this room is going to build something on the other side of it.")]);
        if (step === "pills" || step === "leave") return ctx.say([say("aiden", "Too bright. Everything’s too bright.")]);
        if (step === "miles" || step === "chat") return ctx.say([say("aiden", "The Campanile. It’s been staring at me all week.")]);
        // a second look, at night, and the glass gives you back
        if (nth(ctx, "window") > 1) return mirror(ctx, [say("aiden", sick(step) ? "At night the window’s a mirror. Feverish. Still maxed." : "At night the window’s a mirror. Still maxed.")]);
        return ctx.say([say("aiden", "Still there. Still ringing.")]);

      case "photo":
        if (step === "photo") {
          await ctx.say([say("note", "Phoebe, mid-yawn, in a frame from home."), say("aiden", "She’d have hated that tower. Barked at it every hour."), say("aiden", "…I miss my dog.")]);
          await ctx.wait(600);
          await junBargesIn(ctx);
          await ctx.say([say("jun", "Yo. Door was open."), say("aiden", "It was closed.")]);
          const pick = await ctx.choose(say("jun", "Poker. Floor lounge. Five-dollar buy-in."), [
            { label: "It’s midnight.", who: "aiden" },
            { label: "Deal me in.", who: "aiden" },
          ]);
          dealt = pick === 1;
          if (dealt) {
            ctx.emote("jun", "!");
            await ctx.say([say("jun", "…Nobody says yes."), say("jun", "Okay. Respect.")]);
          } else await ctx.say([say("jun", "Best time. Everybody’s tired. Tired people call.")]);
          await ctx.open({ kind: "intro", who: "jun", name: "Jun", line: "Floormate. Plays poker. Never knocks.", colour: "#2f7a4a" });
          await ctx.say([
            say("jun", "Late-night dining hall first, though. You’re coming."),
            say("aiden", "…Sure."),
            say("note", "Jun was alright, I guess. The food was fine. Everything was fine."),
            say("note", "Fine is a long way from home."),
          ]);
          ctx.checkpoint(1);
          return lecture(ctx);
        }
        if (ill(step)) return ctx.say([say("aiden", "Phoebe would be lying on my feet right now. Best medicine there is.")]);
        return ctx.say(again(ctx, "photo", [[say("aiden", "Phoebe. Still the best investor I’ve ever had.")], [say("aiden", "She’d have barked at Miles. Then loved him. Then barked at him again.")]]));

      case "door":
        if (step === "leave") {
          await examHall(ctx, { course: "Data C8", exam: "Midterm 1", seed: 470, day: "Wed · Midterms", clock: 8 * 60 + 58 });
          ctx.stage().pose("sick");
          return ctx.go("exam");
        }
        if (step === "sit" || step === "exam" || step === "exam2") return ctx.say([say("aiden", step === "sit" ? "I could leave. I’d be lost faster at home, though." : "Not until pencils are down.")]);
        if (step === "pills") return ctx.say([say("aiden", "Not without the Tylenol.")]);
        if (step === "dms") return ctx.say([say("aiden", "People keep coming in. I think the door just lives open now.")]);
        return ctx.say(again(ctx, "door", [[say("aiden", "Hallway. Somebody’s microwaving popcorn. Somebody always is.")], [say("aiden", "Still popcorn. It’s been popcorn since move-in.")]]));

      case "miles":
        if (step === "miles") {
          await ctx.say([
            say("miles", "Roommate. You want to hear a joke?"),
            say("aiden", "Sure."),
            say("miles", "What’s brown and sticky?"),
            say("aiden", "…What?"),
            say("miles", "A stick."),
            say("aiden", "…"),
            say("miles", "Yeah."),
            say("aiden", "That’s not a joke. That’s a stick."),
            say("miles", "And yet you’re smiling."),
          ]);
          await ctx.open({ kind: "intro", who: "miles", name: "Miles", line: "Roommate. His jokes aren’t funny. That’s the joke.", colour: "#1b1d22" });
          await ctx.say([say("miles", "Going out. My friends are downstairs."), say("aiden", "Can I meet them?"), say("miles", "No. Trust me on that one.")]);
          const miles = stage.actor("miles");
          await miles?.walkTo(new Vector3(-3.7, 0, 2.3));
          miles?.show(false);
          ctx.sound()?.click();
          return ctx.go("chat");
        }
        if (step === "hang" || step === "flyer") return milesJokes(ctx, "miles", GLADE_JOKES);
        if (step === "dms") return milesJokes(ctx, "miles", PARTY_JOKES);
        return ctx.say([say("miles", "Knock knock. …It’s me. I live here.")]);
      case "jun":
        if (step === "hang") return respond("floormate2", ctx);
        if (step === "flyer") return ctx.say(again(ctx, "jun", [[say("jun", "Hackathon’s Friday. Poker’s Thursday. Plan accordingly.")], [say("jun", "Hackathons are poker with laptops. Worse odds.")]]));
        return ctx.say([say("jun", "Poker later? No? Your loss.")]);

      // —— the lecture, then the problem set
      case "seat":
        if (step === "sit") {
          stage.place(HALL_SEAT, Math.PI);
          stage.pose("sit", 0, ROWS[1].seat);
          await ctx.say([
            say("professor", "Tables. Arrays. And why your code says “Table has no attribute ‘wherre’.”"),
            say("professor", "Midterm’s in four weeks. Don’t fall behind."),
            say("aiden", "Four weeks. That’s fine."),
            say("note", "Fifty minutes later."),
            say("professor", "Any questions?"),
            say("aiden", "Just the one. What is happening."),
            say("note", "Then Math 52: integrals, then series. Then the problem sets, every night."),
          ]);
          stage.pose("stand");
          await ctx.scene({ id: "dorm", night: true, features: ["boxes"], at: new Vector3(-2.2, 0, -1.2), heading: Math.PI, banner: { place: "Problem set 3", time: "Thursday, 12:50 AM" }, day: "Thu · Week 3", clock: 50 });
          return ctx.go("homework");
        }
        if (step === "exam") {
          const data = await sitExam(ctx, { title: "DATA C8 · MIDTERM 1", subject: "Data C8", questions: DATA_MIDTERM_1, sick: true, seconds: 75 });
          felt.data = data;
          await ctx.say([say("aiden", data >= 3 ? "One down. I think that went… okay?" : "One down. I can’t feel my face."), say("note", "That afternoon: Math 52.")]);
          ctx.go("exam2");
          await examHall(ctx, { course: "Math 52", exam: "Midterm 1", seed: 610, day: "Wed · Midterms", clock: 13 * 60 + 58, seated: true });
          const math = await sitExam(ctx, { title: "MATH 52 · MIDTERM 1", subject: "Math 52", questions: MATH_MIDTERM_1, sick: true, seconds: 75 });
          felt.math = math;
          stage.pose("stand");
          await ctx.say([say("aiden", math >= 3 ? "Two down. The Tylenol held." : "Two down. I think I integrated my own name."), say("note", "Two days later.")]);
          ctx.checkpoint(4);
          return afterMidterms(ctx);
        }
        return ctx.say([say("aiden", "Somebody’s seat. Probably.")]);

      case "laptop":
        if (step === "homework") {
          const right = (await ctx.open<number>({ kind: "study", title: "Data C8 · Problem set 3", subject: "Data C8", questions: HOMEWORK })) ?? 0;
          ctx.stat("ready", 10 + right * 5, 700);
          await ctx.say([say("aiden", right === HOMEWORK.length ? "Okay. Okay, I get tables." : "Some of that made sense. Some."), say("note", "Weeks went by like that. Lecture, problem set, sleep, repeat.")]);
          ctx.checkpoint(2);
          return sickWeek(ctx);
        }
        if (step === "study") {
          const right = (await ctx.open<number>({ kind: "study", title: "Data C8 · Practice midterm", subject: "Data C8", questions: PRACTICE, sick: true })) ?? 0;
          ctx.stat("ready", 35 + right * 6, 800);
          ctx.sound()?.cough();
          await ctx.open({
            kind: "chat",
            app: "phone",
            title: "future billionaires (+ jerry)",
            sub: "3 members",
            face: "chatter",
            group: true,
            messages: [
              { who: "Aiden", text: "sick. midterms wed", me: true },
              { who: "John", text: "drink water" },
              { who: "Jerry", text: "have you tried not being sick" },
              { who: "John", text: "jerry" },
              { who: "Jerry", text: "what. it works for me" },
            ],
          });
          await junBargesIn(ctx);
          await ctx.say([
            say("jun", "Poker tonight?"),
            say("aiden", "I have a fever."),
            say("jun", "Sick people bluff better. Nobody can read a face that looks like that."),
            // week one's answer, kept
            ...(dealt ? [say("jun", "You said yes once. Week one. It counts forever.")] : []),
            say("aiden", "Out, Jun."),
            say("jun", "Alright, alright. Feel better."),
            say("jun", "…Fold early tonight. That’s real advice."),
          ]);
          const jun = stage.actor("jun");
          await jun?.walkTo(new Vector3(-3.7, 0, 2.3));
          jun?.show(false);
          return ctx.go("study2");
        }
        if (step === "study2") {
          const right = (await ctx.open<number>({ kind: "study", title: "Math 52 · Review", subject: "Math 52", questions: MATH_REVIEW, sick: true })) ?? 0;
          ctx.stat("ready", Math.min(85, 60 + right * 8), 800);
          await ctx.say([say("aiden", "That’s all my brain has. Bed.")]);
          return ctx.go("sleep");
        }
        if (step === "pills" || step === "leave") return ctx.say([say("aiden", "No more studying. It’s in there or it isn’t.")]);
        return ctx.say(
          again(ctx, "laptop", [
            [say("aiden", "Forty tabs open. Thirty-nine of them are Data C8.")],
            [say("aiden", weekOneSteps(step) ? "The fortieth is the group chat. It’s quiet." : "I closed one. Another one opened. That’s how tabs work now.")],
          ]),
        );

      case "bed":
        if (step === "sleep") {
          await ctx.say([say("note", "Monday: worse. Tuesday: a little better."), say("note", "Wednesday morning…")]);
          ctx.checkpoint(3);
          return midtermDay(ctx);
        }
        return ctx.say(again(ctx, "bed", [[say("aiden", "Twin XL. It’s twin, it’s not XL.")], [say("aiden", "I’m six-five. My feet sleep in the hallway.")]]));

      case "pills":
        if (step === "pills") {
          stage.pose("stand");
          await ctx.say([say("note", "Two Tylenol. A glass of water. A hoodie, hood up."), say("aiden", "Let’s go.")]);
          return ctx.go("leave");
        }
        if (sick(step)) return ctx.say([say("aiden", "Tylenol. Saving them for Wednesday morning. I have a feeling.")]);
        return ctx.say([say("aiden", "Already took them. Waiting for them to work.")]);

      // —— after midterms: the floor, the glade, a flyer
      case "floormate":
      case "floormate2":
        if (step === "hang") {
          await ctx.say([
            say("jun", "Look who’s alive."),
            say("miles", "We were going to hold a funeral. I wrote a eulogy."),
            say("aiden", "Was it funny?"),
            say("miles", "No. It was just your name, over and over."),
            say("floormate2", "We’re getting boba. Then nothing. Then more boba."),
            say("aiden", "That’s the best plan I’ve heard all semester."),
            say("note", "For a while, everything was easy. Boba, the glade, a party every Friday."),
            say("note", "Miles talked to everyone at every party. Half of them came back to the room after."),
            say("jun", "Oh, hey. Saw a flyer for you. Hackathon this Friday."),
          ]);
          return ctx.go("flyer");
        }
        if (step === "build1") return respond("table", ctx);
        if (step === "demo1")
          return ctx.say(
            again(
              ctx,
              id,
              id === "floormate"
                ? [[say(id, "Go! You’re the one who barks!")], [say(id, "From the chest. Not the throat. The chest.")]]
                : [[say(id, "I’ll hold the webcam. You hold the bark.")], [say(id, "If we lose, it was the webcam.")]],
            ),
          );
        return ctx.say(again(ctx, id, [[say(id, "We’re just vibing.")], [say(id, "Boba in ten. That’s not a question.")]]));

      case "flyer":
        if (step === "flyer") {
          await ctx.say([say("note", "SPACEXAI BUILD NIGHT. FRIDAY. ONE NIGHT, ONE BUILD."), say("aiden", "One night?"), say("floormate2", "You should go."), say("aiden", "We should go."), say("jun", "Friday’s poker."), say("aiden", "Not anymore.")]);
          ctx.checkpoint(5);
          return buildNight(ctx);
        }
        return ctx.say(
          again(ctx, "flyer", [[say("aiden", "Club fair flyers, a lost cat, a tutoring ad. Tutoring, huh.")], [say("aiden", "Every tab on the tutoring ad is torn off. Everyone needs a tutor.")]]),
        );
      case "campanile":
        return ctx.say(again(ctx, "campanile", [[say("aiden", "It still rings every hour. I don’t hear it anymore.")], [say("aiden", "Phoebe would have barked at it. Every hour, on the hour.")]]));
      case "library":
        return ctx.say(again(ctx, "library", [[say("aiden", "Doe Library. Quietest place on campus. I’ve napped there four times.")], [say("aiden", "Five now.")]]));
      case "bench":
        return ctx.say(again(ctx, "bench", [[say("aiden", "Good bench. Good view. Somebody should put a plaque on it.")], [say("aiden", "I’m not sitting. If I sit, I nap. See: the library.")]]));

      // —— three hackathons
      case "table":
        if (step === "build1") {
          await ctx.say([
            say("floormate", "So. The stupid idea."),
            say("aiden", "Two players. Two webcams. One question."),
            say("floormate2", "…Which is?"),
            say("aiden", "Who barks best."),
            say("floormate", "That’s the stupidest thing I’ve ever heard."),
            say("floormate", "I’m in."),
            say("note", "BarkOff. A live bark battle. Built in a night, with friends."),
          ]);
          return ctx.go("demo1");
        }
        if (step === "build2") {
          const caught = (await ctx.open<number>({
            kind: "wrongstep",
            problems: [
              { prompt: "Solve: 3(x − 2) = 12", steps: ["3x − 6 = 12", "3x = 6", "x = 2"], wrong: 1, nudge: "Step 2: when the −6 moves over, does it add, or subtract?" },
              { prompt: "Differentiate: f(x) = x³ − 4x", steps: ["d/dx of x³ is 3x²", "d/dx of −4x is −4x", "f′(x) = 3x² − 4x"], wrong: 1, nudge: "Step 2: what’s the derivative of a plain x?" },
              { prompt: "Solve: x² − 5x + 6 = 0", steps: ["(x − 2)(x − 3) = 0", "x − 2 = 0 or x − 3 = 0", "x = −2 or x = −3"], wrong: 2, nudge: "Last step: if x − 2 = 0, what does x have to be?" },
            ],
          })) ?? 0;
          await ctx.say([
            say("allen", caught === 3 ? "Three for three." : "It works."),
            say("allen", "I want to test it on a hundred more before I believe it."),
            say("aiden", "After the demo. Let’s go show them."),
            say("allen", "Okay. I’ll do the second half. I’ve practiced it eleven times."),
          ]);
          return ctx.go("demo2");
        }
        if (step === "build3") {
          await ctx.say([
            say("samuel", "Agents lose the plot on long email threads. Every handoff, they reread everything."),
            say("dylan", "So we keep the thread as state. What’s current, what got replaced, who acts next."),
            say("aiden", "One call instead of forty emails. Let’s build it."),
          ]);
          await ctx.open({ kind: "intro", who: "dylan", name: "Dylan Nguyen", line: "Teammate at YC. Writes the parser at 3 AM.", colour: "#2a2f3d" });
          await ctx.open({ kind: "intro", who: "samuel", name: "Samuel Choi", line: "Teammate at YC. Asks what the agent actually needs.", colour: "#4f6b8a" });
          await ctx.open({
            kind: "thread",
            subject: "Re: Re: Re: Acme pilot, pricing",
            emails: [
              { from: "Dana (Acme)", time: "Mon 9:02", text: "Proposal attached: $40/seat, 50 seats, starting Oct 1." },
              { from: "You", time: "Mon 11:40", text: "Could you do $35 if we sign this week?" },
              { from: "Dana (Acme)", time: "Tue 8:15", text: "We can do $35/seat for 60 seats. Contract by Friday." },
              { from: "Priya (Finance)", time: "Wed 2:30", text: "Approved: $35 for 60. Legal needs to review the contract first." },
              { from: "Dana (Acme)", time: "Thu 4:51", text: "Contract sent. One change: the start moves to Oct 15." },
            ],
            questions: [
              { q: "What’s the price now?", options: ["$40/seat, 50 seats", "$35/seat, 60 seats", "$35/seat, 50 seats"], answer: 1 },
              { q: "When does it start?", options: ["Oct 1", "Oct 15", "This Friday"], answer: 1 },
              { q: "Who has to act next?", options: ["Dana: send a proposal", "Priya: approve the price", "Legal: review the contract"], answer: 2 },
            ],
            pins: ["Current: $35/seat × 60 (replaced $40 × 50)", "Start: Oct 15 (replaced Oct 1)", "Next: Legal reviews Dana’s contract"],
          });
          return ctx.go("demo3");
        }
        return ctx.say([say("aiden", "Laptops, cables, three empty cans. Home.")]);

      case "stage": {
        if (step !== "demo1" && step !== "demo2" && step !== "demo3") return ctx.say([say("aiden", "Not yet. Build first.")]);
        await stage.goTo(new Vector3(-0.5, 0, -2.4));
        stage.faceTowards(new Vector3(-0.5, 0, 2));
        if (step === "demo1") {
          await ctx.say([say("aiden", "This is BarkOff. Two webcams, one question: who barks best?"), say("aiden", "I need a volunteer.")]);
          await ctx.open({ kind: "bark", rounds: 3 });
          stage.pose("cheer", 2600);
          ctx.shake(0.5);
          await ctx.open({ kind: "impact", text: "1ST PLACE", sub: "SpaceXAI Build Night" });
          ctx.stat("wins", 1, 300);
          ctx.feat("barkoff");
          await ctx.say([say("floormate", "WE WON? With the BARKING?"), say("aiden", "With the barking."), say("note", "The next weekend, another one.")]);
          ctx.checkpoint(6);
          return speedHacks(ctx);
        }
        if (step === "demo2") {
          await ctx.say([
            say("aiden", "This is alai. A tutor that watches you work by hand, and catches the wrong step while you’re still writing it."),
            say("allen", "Out loud. Without giving you the answer. That part matters most. If it gives the answer away, you learn nothing."),
          ]);
          stage.pose("cheer", 2600);
          ctx.shake(0.6);
          await ctx.open({ kind: "impact", text: "1ST PLACE", sub: "Best Use of Keewano · a16z SpeedHacks" });
          ctx.stat("wins", 2, 300);
          ctx.feat("keewano");
          await ctx.say([
            say("note", "A winner’s check the size of a door."),
            say("allen", "We should keep building this. I made a list. It has forty-one things on it."),
            say("aiden", "Forty-one?"),
            say("allen", "Forty-two. I thought of one while you were talking."),
            say("aiden", "We should keep building this."),
          ]);
          ctx.checkpoint(7);
          return agentsWant(ctx);
        }
        await ctx.say([say("samuel", "Continuity. Email memory that survives an agent handoff."), say("dylan", "The next agent makes one call instead of rereading the thread.")]);
        stage.pose("cheer", 2600);
        for (const who of ["dylan", "samuel"]) stage.actor(who)?.pose("cheer", 2600);
        // three for three: the chapter's biggest hit
        ctx.shake(1);
        await ctx.open({ kind: "impact", text: "1ST PLACE", sub: "Primitive.dev track · Y Combinator" });
        ctx.stat("wins", 3, 300);
        ctx.feat("primitive");
        await ctx.say([say("note", "The team on the steps outside. The photo’s still on the clothesline.")]);
        ctx.checkpoint(8);
        met = new Set();
        return topOfTheWorld(ctx);
      }

      case "allen":
        if (step === "meetAllen") {
          await ctx.say([
            say("allen", "Hi. I’m Allen. I’ve been thinking about one problem for three weeks. Can I tell you it?"),
            say("aiden", "Go."),
            say("allen", "Students get stuck on one wrong step, and they never find it. I’ve counted. It’s usually step two."),
            say("aiden", "So the tutor finds it. While they’re writing."),
            say("allen", "Out loud. Without giving the answer away."),
            say("aiden", "…You’re hired."),
            say("allen", "I’m not your employee. We met two minutes ago."),
            say("aiden", "Partner, then."),
            say("allen", "Partner is accurate."),
          ]);
          await ctx.open({ kind: "intro", who: "allen", name: "Allen", line: "Teammate at SpeedHacks. Notices the step everyone else misses.", colour: "#ffd23f" });
          return ctx.go("build2");
        }
        if (step === "build2") return respond("table", ctx);
        if (step === "demo2") return ctx.say(again(ctx, "allen", [[say("allen", "Demo first. Then I’ll celebrate. I’ve scheduled it.")], [say("allen", "It’s in my calendar. “Celebrate: fifteen minutes.”")]]));
        return ctx.say(again(ctx, "allen", [[say("allen", "I’m in the middle of something. Ask me in eleven minutes.")], [say("allen", "Ten minutes now.")]]));
      case "dylan":
        if (step === "build3") return respond("table", ctx);
        return ctx.say(again(ctx, "dylan", [[say("dylan", "Ship it.")], [say("dylan", "The parser held. Don’t touch it. Don’t even look at it.")]]));
      case "samuel":
        if (step === "build3") return respond("table", ctx);
        return ctx.say(again(ctx, "samuel", [[say("samuel", "Ship it.")], [say("samuel", "Show them what the next agent gets. That’s the whole demo.")]]));
      case "pizza": {
        const event = eventOf(step);
        return ctx.say(
          again(ctx, "pizza", [
            [say("aiden", event === "buildnight" ? "Still warm. It’s only nine. Give it six hours." : event === "speedhacks" ? "Pizza at 10 AM. That’s hackathon breakfast." : "Cold pizza before noon. Peak performance.")],
            [say("aiden", "One slice left in every box. Nobody takes the last slice.")],
          ]),
        );
      }
      case "screen":
        return ctx.say(again(ctx, "screen", [[say("aiden", "The clock on the screen only goes one way.")], [say("aiden", "Down. It only goes down.")]]));
      case "beanbag":
        return ctx.say(again(ctx, "beanbag", [[say("aiden", "Somebody’s been asleep in that since the opening talk.")], [say("aiden", "It still has the shape of whoever it was. Respect.")]]));

      // —— San Francisco
      case "founder":
      case "founder2":
      case "founder3": {
        if (step !== "founders" && step !== "window2") return;
        const lines: Record<string, Line[]> = {
          founder: [say("founder", "You’re the BarkOff kid? Legend."), say("founder", "We’re building agents that hire other agents. Seed closed in four days.")],
          founder2: [say("founder2", "I dropped out to do this. Twice. Different schools."), say("founder2", "Stay in, though. Berkeley’s good for you. Come visit whenever.")],
          founder3: [say("founder3", "Kombucha? It’s on tap. Everything’s on tap."), say("founder3", "You should apply to things. Everything. You’d get in.")],
        };
        // a founder you've already met says one more thing
        const more: Record<string, Line> = {
          founder: say("founder", "Seriously, come back. Bring the barking."),
          founder2: say("founder2", "Stay in school. I mean it. I’m the cautionary tale."),
          founder3: say("founder3", "It’s ginger lemon. I’m not allowed to say that’s the best part."),
        };
        if (step === "founders") {
          if (met.has(id)) return ctx.say([more[id]]);
          await ctx.say(lines[id]);
          met.add(id);
          if (met.size < 3) return ctx.say([say("note", `${met.size} of 3 founders met.`)]);
          await ctx.say([say("aiden", "Everyone here is building something.")]);
          return ctx.go("window2");
        }
        await ctx.say([
          say("aiden", "A month ago I couldn’t get the group chat to text back."),
          say("aiden", "Now I’m in San Francisco, looking at the Bay Bridge, and everyone in the room is building something."),
          say("aiden", "Including me."),
        ]);
        ctx.feat("building");
        return ctx.end();
      }
      case "whiteboard":
        return ctx.say(again(ctx, "whiteboard", [[say("aiden", "Boxes, arrows, and “??? → profit.” Every startup has this whiteboard.")], [say("aiden", "“DO NOT ERASE,” from weeks ago. Nobody ever will.")]]));
      case "kombucha":
        return ctx.say(again(ctx, "kombucha", [[say("aiden", "Ginger lemon. On tap. I could get used to this.")], [say("aiden", "Second glass. I’m getting used to this.")]]));
      case "neon":
        return ctx.say(again(ctx, "neon", [[say("aiden", "Everyone in this city is hiring. Nobody in this city is sleeping.")], [say("aiden", "It’s pink, and it never turns off. That’s the culture.")]]));

      // —— the room's other things
      case "pennant":
        return ctx.say(again(ctx, "pennant", [[say("aiden", "Go Bears. Bought it at orientation. Felt like I had to.")], [say("aiden", "Go Bears. …Still feels weird to say out loud.")]]));
      case "fridge":
        if (ill(step)) return ctx.say(again(ctx, "fridge", [[say("aiden", "Ginger ale, soup, and a sad lemon.")], [say("aiden", "The lemon and I are going through the same thing.")]]));
        return ctx.say(again(ctx, "fridge", [[say("aiden", "Two energy drinks and somebody else’s yogurt.")], [say("aiden", "The yogurt isn’t Miles’s. It isn’t mine. It was here before us.")]]));
      case "roommate":
        if (step === "dms") return ctx.say([say("aiden", "Two people on Miles’s bed. He met them tonight. They seem settled.")]);
        return ctx.say(again(ctx, "roommate", [[say("aiden", "Miles’s bed. Made, somehow. He’s never in it before 3 AM.")], [say("aiden", "A jacket on it. Always a jacket. He’s always on his way out.")]]));
      case "board":
        if (step === "exam" || step === "exam2") return ctx.say(again(ctx, "board", [[say("aiden", "The clock. Every time I look at it, it’s later.")], [say("aiden", "Still later.")]]));
        if (step === "sit") return ctx.say(again(ctx, "board", [[say("aiden", "Tables. Arrays. Somebody’s already taking a photo of it.")], [say("aiden", "“Table has no attribute ‘wherre’.” I felt that.")]]));
        if (step === "dms") return ctx.say([say("aiden", "“3 for 3.” I wrote it on a sticky note. It’s the only sticky note now.")]);
        return ctx.say(again(ctx, "board", [[say("aiden", "Office hours, the Data C8 schedule, “call mom.”")], [say("aiden", "One sticky note just says “sleep.” It’s a suggestion.")]]));
      case "lectern":
        if (step === "exam" || step === "exam2") return ctx.say([say("proctor", "Back to your seat, please.")]);
        return ctx.say(again(ctx, "lectern", [[say("professor", "Office hours are on the syllabus.")], [say("professor", "Nobody comes to office hours. There are cookies. Nobody comes.")]]));
      case "proctor":
        if (step === "exam" || step === "exam2") return ctx.say(again(ctx, "proctor", [[say("proctor", "Your seat’s the one with the paper on it. Eyes on your own.")], [say("proctor", "Eyes. On. Your. Own.")]]));
        return ctx.say([say("proctor", "Phones away, please.")]);
      case "professor":
        return ctx.say(again(ctx, "professor", [[say("professor", "Read the textbook. It’s free. It’s online. Nobody reads it.")], [say("professor", "You read it? …You didn’t read it.")]]));
      case "phoebe":
        return;
      default:
        return ctx.say([say("aiden", "Hm.")]);
    }
  }),
  end: {
    title: "Golden Bear",
    stats: [
      ["Midterms", "86 and 91"],
      ["Times sick", "2"],
      ["Hackathons", "3 for 3"],
      ["Handsome", "Max"],
    ],
    next: { number: "Chapter 4", title: "The Tutor", line: "alai, a co-founder, a final interview, and a lot of bugs.", chapter: "ch4" },
  },
};
