import { Vector3 } from "three";
import { LOOKS } from "../people";
import type { Question } from "../screens-berkeley";
import type { ActorSpec } from "../stage";
import { GUESTS, milesJokes } from "./cast";
import { DATA_MIDTERM_2, examHall, MATH_MIDTERM_2, sitExam } from "./midterms";
import { again, mirror, nth, noticing } from "./notice";
import { say, type Chapter, type Ctx, type Line } from "./types";

// alai, for real: Allen at the roommate's desk, midterms again, a final
// round at a16z Alpha that ends in a no, a bench at midnight, two
// applications, a bug bash, and the first student who says "oh". Then the
// story catches up with the present, and stops.

const ALLEN_AT_DESK: ActorSpec = { id: "allen", look: LOOKS.allen, at: new Vector3(2.15, 0, -2.05), heading: Math.PI, pose: "type", seat: 0.45, label: "Allen", behaviour: "idle", solid: false };

const REVIEW: Question[] = [
  { q: "A model’s residual plot fans out as x grows. That suggests…", options: ["A perfect fit", "The spread of errors changes with x", "Too few points", "The slope is zero"], answer: 1 },
  { q: "You A/B test two hints. Hint B wins with p = 0.30. You should…", options: ["Ship B", "Not call it yet: that could easily be chance", "Ship A", "Lower the bar to 0.30"], answer: 1 },
  { q: "Math 52: Σ (1/3)ⁿ, from n = 0 to ∞", options: ["1/3", "3/2", "3", "∞"], answer: 1 },
];

// Miles, home early with everyone he met, asked for a joke
const PARTY_JOKES: Line[][] = [
  [say("miles", "What do you call a co-founder?"), say("aiden", "What?"), say("miles", "Allen. That’s his name. I don’t have a joke.")],
  [
    say("miles", "Why did the startup cross the road?"),
    say("aiden", "Don’t."),
    say("miles", "To get to the other side. Of the road. It was a normal road."),
    say("allen", "That isn’t a joke. That’s a description of a road."),
    say("miles", "Thank you."),
    say("allen", "That wasn’t a compliment."),
  ],
  [say("miles", "How many people fit in a double?"), say("allen", "Two."), say("miles", "Nine, if you count Allen twice."), say("allen", "Please stop counting me twice.")],
  [say("miles", "I’m out of jokes."), say("allen", "Statistically, you never had any."), say("miles", "And yet you’re smiling."), say("allen", "I’m not. Aiden is.")],
];

/** Who answered the partners, by question: 1 is Allen every time. */
let picks: number[] = [];

// —— act one: round two

async function roundTwo(ctx: Ctx) {
  await ctx.scene({
    id: "dorm",
    night: true,
    features: ["trophies", "ipad", "monitor", "late"],
    actors: [ALLEN_AT_DESK],
    at: new Vector3(-0.6, 0, 0.9),
    heading: Math.PI * 0.9,
    banner: { place: "Midterms, round two", time: "Tuesday, 11:20 PM" },
    day: "Tue · Week 11",
    clock: 23 * 60 + 20,
  });
  ctx.go("talkAllen");
  await ctx.say([say("aiden", "Second round of midterms: Data C8, then Math 52."), say("aiden", "Also: a company.")]);
}

// —— act two: the final round

async function alpha(ctx: Ctx) {
  picks = [];
  await ctx.scene({
    id: "dorm",
    features: ["trophies", "ipad", "monitor"],
    actors: [{ ...ALLEN_AT_DESK, pose: "stand", at: new Vector3(-1.2, 0, -1.0), heading: Math.PI * 0.8, behaviour: "watch" }],
    at: new Vector3(-2.0, 0, -1.3),
    heading: Math.PI,
    banner: { place: "a16z Alpha", time: "Final round, Thursday, 1:58 PM" },
    day: "Thu · Final round",
    clock: 13 * 60 + 58,
  });
  ctx.go("call");
  await ctx.say([say("allen", "Final round. Two partners."), say("aiden", "Camera on. Hair: handled.")]);
}

async function bench(ctx: Ctx) {
  await ctx.scene({
    id: "glade",
    night: true,
    actors: [{ id: "allen", look: LOOKS.allen, at: new Vector3(2.55, 0, 3.25), heading: Math.PI, pose: "sit", seat: 0.5, label: "Allen", behaviour: "idle", solid: false }],
    at: new Vector3(-1.5, 0, 0.6),
    heading: Math.PI * 0.4,
    banner: { place: "Memorial Glade", time: "Friday, 11:48 PM" },
    day: "Fri · Late",
    clock: 23 * 60 + 48,
  });
  ctx.go("bench");
}

// —— act three: building

async function building(ctx: Ctx) {
  await ctx.scene({
    id: "dorm",
    night: true,
    features: ["trophies", "ipad", "monitor", "late"],
    actors: [ALLEN_AT_DESK],
    at: new Vector3(-2.2, 0, -1.2),
    heading: Math.PI,
    banner: { place: "The office (a dorm room)", time: "Sunday, 1:30 AM" },
    day: "Sun · Week 13",
    clock: 90,
  });
  ctx.go("applyYC");
  await ctx.say([say("allen", "Speedrun and YC. Both tonight."), say("aiden", "And then we fix everything.")]);
}

/** What Allen says between the things that happen, by step. */
const ALLEN_SAYS: Record<string, Line[][]> = {
  study: [[say("allen", "Study first. I blocked out the next two hours. You’re in them.")], [say("allen", "One hour and fifty-eight minutes now.")]],
  midterm: [[say("allen", "I’m fine. Noise-cancelling headphones. They’re cancelling about half.")]],
  call: [[say("allen", "Ninety seconds. You look fine. I’d tell you if you didn’t.")], [say("allen", "Still fine. Eighty seconds.")]],
  applyYC: [[say("allen", "Read me the one-liner again. Slower.")], [say("allen", "Forty-nine characters. One under the limit. I counted twice.")]],
  applySpeedrun: [[say("allen", "Speedrun’s one-liner has no limit. I find that stressful.")]],
  bugs: [[say("allen", "The voice cuts out mid-hint. I know why. Give me twenty minutes.")], [say("allen", "Nineteen minutes.")]],
  tester: [[say("allen", "He didn’t knock. He never knocks. I’ve stopped logging it.")]],
  last: [[say("allen", "A hundred and eleven. I’ll start from the top.")]],
};

export const chapter4: Chapter = {
  id: "ch4",
  number: "Chapter 4",
  title: "The Tutor",
  line: "alai, a co-founder, a final interview, and a lot of bugs.",
  intro: ["Three first places.", "One of them wouldn’t leave us alone:", "a tutor that catches the wrong step.", "So we made it a company."],
  hud: { money: false, ready: "Midterm 2 prep", members: "Waitlist" },
  acts: [
    { stats: { money: 0, ready: 30, members: 240 }, run: roundTwo },
    { stats: { money: 0, ready: 100, members: 480 }, run: alpha },
    { stats: { money: 0, ready: 100, members: 480 }, run: building },
  ],
  objectives: {
    talkAllen: "Talk to Allen",
    study: "Study for the second midterms",
    midterm: "Head to your midterms",
    seat: "Find your seat for Data C8",
    seat2: "Math 52, midterm 2",
    call: "Join the call",
    bench: "Sit with Allen",
    applyYC: "Apply to YC",
    applySpeedrun: "Apply to a16z speedrun",
    bugs: "Bug bash on the iPad",
    tester: "Let Jun try alai",
    last: "Keep building",
    done: "",
  },
  targets: {
    talkAllen: "allen",
    study: "laptop",
    midterm: "door",
    seat: "seat",
    call: "laptop",
    bench: "allen",
    applyYC: "laptop",
    applySpeedrun: "laptop",
    bugs: "ipad",
    tester: "jun",
    last: "laptop",
  },
  use: noticing(async function respond(id, ctx): Promise<void> {
    const step = ctx.step();
    const stage = ctx.stage();
    switch (id) {
      case "allen":
        if (step === "talkAllen") {
          await ctx.say([
            say("allen", "Miles goes out at eleven and comes back after three. I’ve tracked it for two weeks."),
            say("aiden", "You tracked my roommate."),
            say("allen", "His desk is free four hours a night. That’s an office."),
            say("allen", "SpeedHacks was one weekend. This could be a company."),
            say("aiden", "The next big consumer edtech company."),
            say("allen", "Multi-billion. That’s not a guess. I made a model. Do you want to see it? It has forty tabs."),
            say("aiden", "Later."),
            say("allen", "Okay. I’ll leave it open."),
            say("allen", "…We should probably also pass our midterms."),
          ]);
          stage.pose("cheer", 2200);
          stage.actor("allen")?.pose("cheer", 2200);
          await ctx.open({ kind: "impact", text: "CO-FOUNDERS", sub: "alai · day one" });
          return ctx.go("study");
        }
        if (step === "bench") {
          stage.place(new Vector3(1.85, 0, 3.25), Math.PI);
          stage.pose("sit", 0, 0.5);
          // what happened on the call, remembered
          const allens = picks.filter((p) => p === 1).length;
          await ctx.say([
            say("allen", "Final round, though. That’s the last round. There isn’t one after it."),
            say("aiden", "Final round isn’t a yes."),
            say("allen", "No. But “not this time” is a different answer from “no.” I read the email four times."),
            ...(picks[1] === 1
              ? [say("allen", "I told them we’re early. It was true. I’d say it again.")]
              : picks.length && !allens
                ? [say("allen", "Next time, give me one. I had sixty-one answers ready.")]
                : []),
            say("aiden", "Speedrun’s open. YC’s open. We apply to both."),
            say("allen", "And we fix every bug a student has ever hit. They’re in a spreadsheet. I sorted them by how stuck the student got."),
            say("aiden", "And we make it so good the next one can’t say no."),
            say("allen", "Okay. That’s a plan."),
            say("note", "The Campanile rang midnight. Neither of them went home."),
          ]);
          stage.pose("stand");
          ctx.checkpoint(2);
          return building(ctx);
        }
        return ctx.say(again(ctx, `allen:${step}`, ALLEN_SAYS[step] ?? [[say("allen", "Ship first. Sleep later. I slept on Tuesday.")]]));

      case "laptop":
        if (step === "study") {
          const right = (await ctx.open<number>({ kind: "study", title: "Midterm 2 review", subject: "Data C8 · Math 52", questions: REVIEW })) ?? 0;
          ctx.stat("ready", 55 + right * 15, 800);
          await ctx.say([say("aiden", "No fever this time. Just tired.")]);
          ctx.sound()?.notify();
          ctx.stat("members", 480, 1200);
          await ctx.say([
            say("allen", "The waitlist is at 480."),
            say("aiden", "From one demo?"),
            say("allen", "From one demo. 480, not “almost five hundred.” I don’t round up."),
            say("note", "1:40 AM. The door opens."),
          ]);
          // Miles, home from the party, and everyone he met there
          const miles: ActorSpec = { id: "miles", look: LOOKS.miles, at: new Vector3(-3.7, 0, 2.3), heading: Math.PI / 2, label: "Miles", behaviour: "watch" };
          stage.addActor(miles);
          ctx.sound()?.click();
          for (const guest of GUESTS(1800)) stage.addActor(guest);
          await stage.actor("miles")?.walkTo(new Vector3(1.6, 0, 1.2));
          await ctx.say([
            say("miles", "Don’t mind us."),
            say("allen", "You’re early. By at least an hour and twenty minutes."),
            say("miles", "Is that bad?"),
            say("allen", "It’s never happened. I’ll update the model."),
            say("allen", "There are eight people in a room designed for two."),
            say("miles", "Nine."),
            say("allen", "Eight. I counted twice."),
            say("miles", "I counted you twice."),
            say("allen", "…That’s not how counting works."),
            say("note", "Allen put on headphones and fixed three bugs before the room emptied. Study, then build. Build, then study. Sleep, occasionally."),
          ]);
          return ctx.go("midterm");
        }
        if (step === "call") {
          await ctx.say([say("allen", "I wrote down every question they could ask. There are sixty-one.")]);
          picks = (await ctx.open<number[]>({
            kind: "call",
            title: "a16z Alpha · final round",
            host: { name: "Partner", face: "partner" },
            guests: [{ name: "Allen", face: "allen" }],
            questions: [
              {
                q: "Tutoring is crowded. Why does alai win?",
                options: [
                  { label: "It watches the work, not just the answer. It catches the wrong step while they’re still writing.", who: "aiden" },
                  { label: "Voice first. Students talk to it like a person, and it never gives the answer away.", who: "allen" },
                  { label: "We’re cheaper than a human tutor.", who: "aiden" },
                ],
                replies: ["Mm. That’s a real wedge.", "Interesting. Kids actually talk to it?", "Cheaper isn’t a moat."],
              },
              {
                q: "How many students are using it today?",
                options: [
                  { label: "A waitlist that grows every time we demo it.", who: "aiden" },
                  { label: "Honestly, early. We fix whatever they hit, every night.", who: "allen" },
                ],
                replies: ["Waitlists are easy. Retention is hard.", "I appreciate the honesty."],
              },
              {
                q: "Last one. Why the two of you?",
                options: [
                  { label: "We built it in a weekend and won. Imagine a year.", who: "aiden" },
                  { label: "We don’t stop. Midterms, hackathons, this. Same week.", who: "allen" },
                ],
                replies: ["Fair.", "I believe that."],
              },
            ],
            outro: "Thank you, both of you. We’ll be in touch by Friday.",
          })) ?? [];
          await ctx.say([
            say("allen", picks[0] === 2 ? "You said “cheaper.” We agreed not to say “cheaper.” It was on the list." : "They said Friday. That’s specific. I like specific."),
            say("note", "Friday."),
          ]);
          await ctx.open({
            kind: "email",
            app: "Mail",
            from: "a16z Alpha",
            subject: "Your application",
            lines: [
              "Hi Aiden and Allen,",
              "Thank you for making it to the final round. It was a hard decision.",
              "Unfortunately, we’ve decided not to move forward with alai this time.",
              "We’d love to stay in touch as you keep building.",
            ],
            tone: "bad",
          });
          // no shake for a no: just the two of them, quiet for a second
          ctx.emote("allen", "dots");
          await ctx.say([say("aiden", "…"), say("allen", "“Not this time.”"), say("allen", "That means there’s a next time. Logically."), say("allen", "Walk?")]);
          return bench(ctx);
        }
        if (step === "applyYC") {
          await ctx.open({
            kind: "form",
            title: "Y Combinator · Apply",
            accent: "#f26522",
            fields: [
              { label: "Describe what your company does in 50 characters or less.", answer: "A tutor that catches the wrong step as you write." },
              { label: "What is your company going to make?", answer: "alai is a voice-first AI tutor for STEM homework. Students work by hand on an iPad; when they pause after a wrong step, alai underlines it and nudges them out loud, without giving the answer away." },
              { label: "Why did you pick this idea?", answer: "We built it in a weekend at a16z SpeedHacks and won. Every student who tried it asked when they could use it for real." },
              { label: "How long have the founders known each other?", answer: "Since SpeedHacks. It feels like years. Most weeks since have been a hundred hours." },
            ],
            submit: "Submit application",
            done: "Application submitted.",
          });
          await ctx.say([say("allen", "One down. One to go. Then two hundred and eleven bugs.")]);
          return ctx.go("applySpeedrun");
        }
        if (step === "applySpeedrun") {
          await ctx.open({
            kind: "form",
            title: "a16z speedrun · Apply",
            accent: "#1b1d22",
            fields: [
              { label: "alai, in one line", answer: "The tutor that hears you think, and catches the step where it went wrong." },
              { label: "Traction", answer: "A waitlist that grows with every demo, and students coming back every night of exam season." },
              { label: "Why now?", answer: "Voice is finally fast enough to talk in real time, and handwriting finally reads right. Homework help just changed." },
            ],
            submit: "Submit",
            done: "Submitted.",
          });
          await ctx.say([say("aiden", "Two down. Now the part that actually matters.")]);
          return ctx.go("bugs");
        }
        if (step === "last") {
          await ctx.say([
            say("aiden", "Applications in. Midterms done. A hundred bugs fixed."),
            say("allen", "A hundred and eleven to go. I counted."),
            say("aiden", "Every student who opens it should feel what Jun felt."),
            say("allen", "Better than every tutor out there."),
            say("aiden", "Not yet."),
            say("aiden", "Soon."),
            say("allen", "Coffee? Same order as always. It’s one less decision."),
            say("aiden", "Coffee."),
            say("note", "That’s where the story is, right now."),
          ]);
          stage.actor("allen")?.pose("type");
          stage.pose("sit", 0, 0.45);
          ctx.feat("tbc");
          return ctx.end();
        }
        if (step === "tester") return ctx.say([say("aiden", "Not now. Jun’s here, and he has a calc set.")]);
        return ctx.say(again(ctx, "laptop", [[say("aiden", "Forty tabs. Half of them are alai’s logs.")], [say("aiden", "The other half are Allen’s model. He left it open.")]]));

      case "ipad":
        if (step === "bugs") {
          const fixed = (await ctx.open<number>({
            kind: "bugs",
            seconds: 22,
            bugs: [
              "voice cuts out mid-hint",
              "pencil lags on older iPads",
              "wrong step not underlined",
              "hint gives the answer away",
              "page 2 doesn’t sync",
              "mic permission loop",
              "fractions read as 1/7",
              "dark mode flashbang",
            ],
          })) ?? 0;
          await ctx.say([say("allen", `${fixed} fixed. The rest by morning. I’ll be up. I like this part.`)]);
          // Jun, through the door without knocking, as ever
          stage.addActor({ id: "jun", look: LOOKS.jun, at: new Vector3(-3.7, 0, 2.3), heading: Math.PI / 2, label: "Jun", behaviour: "watch" });
          ctx.sound()?.click();
          ctx.bubble("door", "BANG", 900);
          ctx.emote("aiden", "!");
          await stage.actor("jun")?.walkTo(new Vector3(-2.4, 0, 1.6));
          stage.actor("jun")?.face(stage.position);
          return ctx.go("tester");
        }
        // a second look, and the dark screen gives you back
        if (nth(ctx, "ipad") > 1) return mirror(ctx, [say("aiden", "The screen dims. In the glass: still maxed.")]);
        return ctx.say([say("aiden", "alai, open on problem four. It’s waiting for someone to get stuck.")]);

      case "door":
        if (step === "midterm") {
          await examHall(ctx, { course: "Data C8", exam: "Midterm 2", seed: 520, day: "Thu · Midterms", clock: 8 * 60 + 58 });
          return ctx.go("seat");
        }
        if (step === "tester") return respond("jun", ctx);
        if (step === "seat" || step === "seat2") return ctx.say([say("aiden", "Not until pencils are down.")]);
        if (step === "call") return ctx.say([say("aiden", "The call’s in here. The hallway can wait.")]);
        return ctx.say([say("aiden", "Hallway. Someone’s microwaving popcorn again. It’s always popcorn.")]);

      case "jun":
        if (step === "tester") {
          await ctx.say([
            say("jun", "Poker?"),
            say("allen", "No."),
            say("jun", "You didn’t hear the buy-in."),
            say("allen", "The buy-in doesn’t change the answer."),
            say("jun", "Fine. Does your robot do calc? Set’s due at nine."),
            say("aiden", "Try it. Problem four."),
            say("note", "Jun writes. He stops halfway down the page."),
            say("alai", "Check your second line. What happens to the minus sign when you distribute?"),
          ]);
          ctx.emote("jun", "!");
          await ctx.say([say("jun", "…Oh.")]);
          ctx.sound()?.sparkle();
          ctx.shake(0.45);
          await ctx.open({ kind: "impact", text: "OH.", sub: "alai’s first real student" });
          await ctx.say([
            say("jun", "OH."),
            say("aiden", "That. That “oh.” That’s the whole company."),
            say("jun", "It’s alright, I guess."),
            say("allen", "He means it’s good."),
            say("jun", "I said what I said."),
            say("jun", "…Can I keep using it?"),
            say("allen", "Join the waitlist like everyone else. You’d be number 1,401."),
            say("aiden", "You’re on it. You’re first."),
          ]);
          ctx.stat("members", 1400, 1400);
          ctx.sound()?.sparkle();
          return ctx.go("last");
        }
        return ctx.say(
          again(ctx, "jun", [
            [say("jun", "Poker’s at eleven. You’ll both lose. That’s fine.")],
            [say("jun", "Allen counts cards. I can tell."), say("allen", "I count everything. Cards are included.")],
          ]),
        );

      case "seat":
        if (step === "seat") {
          const data = await sitExam(ctx, { title: "DATA C8 · MIDTERM 2", subject: "Data C8", questions: DATA_MIDTERM_2, seconds: 70 });
          await ctx.say([say("aiden", data >= 3 ? "Data C8: done. No fever this time." : "Data C8: done. Not my best. Not sick, though."), say("note", "Then Math 52.")]);
          ctx.go("seat2");
          await examHall(ctx, { course: "Math 52", exam: "Midterm 2", seed: 640, day: "Thu · Midterms", clock: 13 * 60 + 58, seated: true });
          const math = await sitExam(ctx, { title: "MATH 52 · MIDTERM 2", subject: "Math 52", questions: MATH_MIDTERM_2, seconds: 70 });
          ctx.stat("ready", 100, 600);
          await ctx.say([
            say("aiden", math >= 3 ? "Series converge. So do I." : "Series: survived."),
            say("aiden", "No fever. No Tylenol. Just two midterms."),
            say("note", "Second round: done. Back to the company."),
          ]);
          ctx.checkpoint(1);
          return alpha(ctx);
        }
        return ctx.say([say("aiden", "Somebody’s seat.")]);

      case "trophies":
        return ctx.say(
          again(ctx, "trophies", [
            [say("aiden", "BarkOff, alai, Continuity. Three cups, one shelf. The same shelf as on the desk in the beginning.")],
            [say("aiden", "Allen moved them a centimeter so the light hits all three. He measured.")],
          ]),
        );
      case "window":
        return ctx.say([say("aiden", step === "call" ? "Focus. The partners are waiting." : "The Campanile. Still ringing. Still awake, like us.")]);
      case "photo":
        return ctx.say(again(ctx, "photo", [[say("aiden", "Phoebe. She’d sit on the iPad. That’s user research.")], [say("aiden", "She’d find the wrong step first. She’s very smart. I’m biased.")]]));
      case "phone":
        return ctx.say(
          again(ctx, "phone", [
            [say("aiden", "The group chat. John sent a jeans ad. Jerry sent “🔥🔥🔥” under it.")],
            [say("aiden", "Jerry asked if alai does homework. Allen said that’s the whole product.")],
          ]),
        );
      case "pennant":
        return ctx.say(again(ctx, "pennant", [[say("aiden", "Go Bears.")], [say("aiden", "Allen says it’s four degrees crooked. He’s right. I’m leaving it.")]]));
      case "fridge":
        return ctx.say(again(ctx, "fridge", [[say("aiden", "Cold brew, cold brew, and a third cold brew.")], [say("aiden", "The mystery yogurt’s gone. Nobody will say who.")]]));
      case "roommate":
        // with Miles home, the arrangement comes up
        if (step === "midterm") return ctx.say([say("miles", "Is somebody using my desk?"), say("allen", "Yes. Me. Eleven to three."), say("miles", "Cool.")]);
        return ctx.say(
          again(ctx, "roommate", [
            [say("allen", "Miles’s desk. Mine from eleven to three. We have an arrangement. He doesn’t know about it.")],
            [say("allen", "I’ll tell him if he asks. He hasn’t asked.")],
          ]),
        );
      case "miles":
        if (step === "midterm") return milesJokes(ctx, "miles", PARTY_JOKES);
        return ctx.say([say("miles", "What do you call a co-founder? …Allen. That’s his name. I don’t have a joke.")]);
      case "board":
        if (step === "seat" || step === "seat2") return ctx.say([say("aiden", "The clock. It doesn’t care that I’m not sick this time.")]);
        return ctx.say(again(ctx, "board", [[say("aiden", "“3 for 3.” Under it, in Allen’s writing: “now do it for real.”")], [say("aiden", "Under that, also Allen’s: “sleep (optional).”")]]));
      case "bed":
        return ctx.say(again(ctx, "bed", [[say("aiden", "Later. Much later.")], [say("aiden", "Allen slept on Tuesday. I’m aiming for Thursday.")]]));
      case "campanile":
        return ctx.say([say("aiden", "Midnight. It’s always midnight lately.")]);
      case "library":
      case "flyer":
        return ctx.say([say("aiden", "Closed. Everything’s closed but us.")]);
      case "lectern":
      case "proctor":
        return ctx.say([say("proctor", "Back to your seat, please. Eyes on your own paper.")]);
      case "bench":
        if (step === "bench") return respond("allen", ctx);
        return ctx.say([say("aiden", "Good bench. We should put a plaque on it. “Where alai didn’t give up.”")]);
      default:
        return ctx.say([say("aiden", "Hm.")]);
    }
  }),
  end: {
    title: "The Tutor",
    tbc: true,
    stats: [
      ["Co-founders", "2"],
      ["Final rounds", "1"],
      ["Applications", "2, sent"],
      ["Handsome", "Max"],
    ],
    next: { number: "Chapter 5", title: "To be continued", line: "This is where life is, right now. The next chapter is still happening." },
  },
};
