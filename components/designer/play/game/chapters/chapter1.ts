import { Vector3 } from "three";
import { LOOKS, someone } from "../people";
import type { Bedroom } from "../rooms/bedroom";
import type { Street } from "../rooms/street";
import type { ActorSpec } from "../stage";
import { flavour } from "./prologue";
import { say, type Chapter, type Ctx } from "./types";

// AGNotify, from four members to $45,000. It starts scrappy: no information
// of its own, so Aiden copies a bigger server's alerts, and its owner finds
// out. The ban is the turn: AGNotify gets sources of its own (insiders at
// Nike and JD Sports), proves it on a drop morning, Raymond makes the
// reels, and referrals do the rest.

const bedroom = (ctx: Ctx) => ctx.stage().room as Bedroom;
const street = (ctx: Ctx) => ctx.stage().room as Street;

// the people in the line outside the store
const CAMPERS: ActorSpec[] = [
  { id: "camper", look: someone(11, { style: "hoodie", top: 0xf08a32, hat: "beanie", hatColor: 0x2a2f3d }), at: new Vector3(0.9, 0, -1.55), heading: Math.PI * 0.85, label: "Camper", behaviour: "watch" },
  { id: "camper2", look: someone(23, { top: 0x2a2f3d, style: "hoodie" }), at: new Vector3(1.6, 0, -1.6), heading: Math.PI, label: "Camper", behaviour: "watch" },
  { id: "camper3", look: someone(37, { top: 0x8fd3b6 }), at: new Vector3(2.35, 0, -1.4), heading: -Math.PI * 0.9, pose: "sit", seat: 0.42, label: "Camper" },
  { id: "camper4", look: someone(41, { hat: "cap", hatColor: 0xd74718 }), at: new Vector3(3.1, 0, -1.6), heading: Math.PI, behaviour: "watch" },
  { id: "camper5", look: someone(59, { style: "hoodie", top: 0x5b4fd6 }), at: new Vector3(3.85, 0, -1.5), heading: Math.PI * 1.05 },
  { id: "camper6", look: someone(67), at: new Vector3(4.6, 0, -1.4), heading: Math.PI * 0.9, pose: "sit", seat: 0.42 },
  { id: "camper7", look: someone(73, { hat: "beanie", hatColor: 0xf2c46b }), at: new Vector3(5.05, 0, -1.0), heading: Math.PI * 1.1 },
];

const EDITOR: ActorSpec = {
  id: "editor",
  look: LOOKS.editor,
  at: new Vector3(0.95, 0, -1.25),
  heading: -Math.PI * 0.6,
  label: "Raymond",
  behaviour: "watch",
};

async function scrappy(ctx: Ctx) {
  await ctx.scene({
    id: "bedroom",
    night: true,
    dog: "bed",
    at: new Vector3(1.32, 0, -2.5),
    heading: Math.PI * 0.85,
    day: "Fri · Week 1",
    clock: 21 * 60 + 40,
  });
  ctx.go("check");
  await ctx.say([say("aiden", "AGNotify’s been up a week."), say("aiden", "Let’s see how it’s doing.")]);
}

async function comeback(ctx: Ctx) {
  await ctx.scene({
    id: "bedroom",
    features: ["board"],
    dog: "follow",
    at: new Vector3(-2.3, 0, -1.3),
    heading: -Math.PI * 0.5,
    banner: { place: "Two weeks later", time: "Monday, after school" },
    day: "Mon · Week 3",
    clock: 16 * 60 + 10,
  });
  ctx.go("sources");
  await ctx.say([say("aiden", "No more copying. If I want information, I need my own.")]);
}

async function wordOfMouth(ctx: Ctx) {
  await ctx.scene({
    id: "bedroom",
    features: ["board", "boardFull", "ringlight", "monitor", "boxes"],
    dog: "follow",
    actors: [EDITOR],
    at: new Vector3(-0.4, 0, 0.6),
    heading: Math.PI * 0.8,
    banner: { place: "A month later", time: "Saturday afternoon" },
    day: "Sat · Week 7",
    clock: 14 * 60,
  });
  ctx.go("editor");
}

export const chapter1: Chapter = {
  id: "ch1",
  number: "Chapter 1",
  title: "The Cook Group",
  line: "Copy, get caught, get banned, find your own sources. Then $45,000.",
  intro: ["AGNotify, week one.", "One server. Three channels.", "Four members,", "if you count yourself."],
  // revenue, not a wallet: what the cook group made isn't what landed in Aiden's pocket
  hud: { money: false, members: true, goal: 45000 },
  acts: [
    { stats: { money: 500, members: 4, revenue: 0 }, run: scrappy },
    { stats: { money: 500, members: 28, revenue: 0 }, run: comeback },
    { stats: { money: 3600, members: 190, revenue: 3100 }, run: wordOfMouth },
  ],
  objectives: {
    check: "Check on the server",
    copy: "Find something to post",
    dm: "Read your messages",
    sources: "Find your own sources",
    line: "Go see the line",
    post: "Post the alert at 7:00",
    home: "Head home",
    editor: "Talk to Raymond",
    referrals: "Set up referrals on the laptop",
    celebrate: "Celebrate with Phoebe",
    done: "",
  },
  targets: {
    check: "laptop",
    copy: "laptop",
    dm: "phone",
    sources: "board",
    line: "camper",
    post: "store",
    home: "home",
    editor: "editor",
    referrals: "laptop",
    celebrate: "phoebe",
  },
  use: async (id, ctx) => {
    const step = ctx.step();
    switch (id) {
      // —— act one: scrappy
      case "laptop":
        if (step === "check") {
          await ctx.open({
            kind: "chat",
            app: "server",
            title: "AGNotify",
            members: "4 members",
            channels: ["release-alerts", "where-to-cop", "general"],
            channel: "general",
            messages: [
              { who: "sneakerfan22", text: "yo when’s the drop" },
              { who: "kev.k", text: "is this server dead" },
              { who: "sneakerfan22", text: "bro??" },
              { who: "chatter", text: "4 members · 1 online (you)", system: true },
            ],
          });
          await ctx.say([
            say("aiden", "Four members. Zero information."),
            say("aiden", "I don’t actually know when anything drops."),
            say("aiden", "…But the big servers do."),
          ]);
          return ctx.go("copy");
        }
        if (step === "copy") {
          const copied = (await ctx.open<number>({ kind: "copy" })) ?? 0;
          ctx.stat("members", 4 + Math.max(4, copied) * 3);
          await ctx.say([say("aiden", "Copy. Paste. Members."), say("aiden", "Business is easy.")]);
          bedroom(ctx).setBuzz(true);
          ctx.bubble("phone", "bzzt bzzt", 0);
          return ctx.go("dm");
        }
        if (step === "dm") return ctx.say([say("aiden", "My phone’s going off. That’s never good at this hour.")]);
        if (step === "referrals") {
          await ctx.open({ kind: "growth", from: 6000, to: 45000 });
          ctx.stat("revenue", 45000, 600);
          ctx.stat("members", 900, 600);
          await ctx.wait(500);
          await ctx.scene({
            id: "bedroom",
            night: true,
            features: ["board", "boardFull", "ringlight", "monitor", "boxes", "leds", "plaque"],
            dog: "follow",
            at: new Vector3(1.6, 0, -1.4),
            heading: Math.PI,
            banner: { place: "Months later", time: "Friday, 11:58 PM" },
            day: "Fri · Night",
            clock: 23 * 60 + 58,
          });
          await ctx.say([
            say("aiden", "Forty-five thousand dollars."),
            say("aiden", "From five hundred dollars and a group chat."),
            say("aiden", "And not one alert copied since the ban."),
          ]);
          return ctx.go("celebrate");
        }
        return ctx.say([say("aiden", "The server runs itself now. Mostly.")]);

      case "phone":
        if (step === "dm") {
          bedroom(ctx).setBuzz(false);
          ctx.bubble("phone", "");
          await ctx.open({
            kind: "chat",
            app: "phone",
            title: "kingcop",
            sub: "owner · HYPEHAUS",
            face: "kingcop",
            messages: [
              { who: "kingcop", text: "yo" },
              { who: "kingcop", text: "YO" },
              { who: "kingcop", text: "why is my #alerts showing up word for word in some server called AGNotify" },
              { who: "kingcop", text: "u think i wouldnt notice??" },
              { who: "aiden", text: "it’s just a few alerts", me: true },
              { who: "kingcop", text: "my team PAYS for those sources" },
              { who: "kingcop", text: "rule #1. read it" },
              { who: "kingcop", text: "ur done" },
              { who: "chatter", text: "You were banned from HYPEHAUS.", system: true, alert: true },
            ],
            stamp: "BANNED",
          });
          ctx.stage().wakePhoebe();
          await ctx.say([
            say("aiden", "…"),
            say("aiden", "Yeah. I’d be mad too."),
            say("aiden", "Copying someone else’s work was never going to be a business."),
            say("aiden", "If I’m doing this, the information has to be mine."),
          ]);
          ctx.checkpoint(1);
          return comeback(ctx);
        }
        return ctx.say([say("aiden", step === "check" || step === "copy" ? "Nothing yet. Not even from the server." : "Notifications: AGNotify, AGNotify, AGNotify.")]);

      // —— act two: the comeback
      case "board":
        if (step === "sources") {
          await ctx.say([say("aiden", "Who knows when shoes drop before anyone else?"), say("aiden", "The people who stock them.")]);
          await ctx.open({
            kind: "chat",
            app: "phone",
            title: "Insider · Nike",
            sub: "a friend’s cousin",
            face: "insider",
            messages: [
              { who: "aiden", text: "hey! a friend said you might know when things release?", me: true },
              { who: "insider", text: "might 👀" },
              { who: "insider", text: "nothing official. but i hear things early" },
              { who: "insider", text: "the court low restock? thursday. 7am" },
              { who: "aiden", text: "you’re a legend", me: true },
            ],
          });
          await ctx.open({
            kind: "chat",
            app: "phone",
            title: "Insider · JD Sports",
            sub: "works the stockroom",
            face: "insider",
            messages: [
              { who: "insider", text: "you’re the AGNotify kid?" },
              { who: "insider", text: "heard hypehaus banned you lol" },
              { who: "aiden", text: "learned my lesson. doing it properly now", me: true },
              { who: "insider", text: "respect. restock thursday 7am sharp" },
              { who: "insider", text: "you didn’t hear it from me" },
            ],
          });
          bedroom(ctx).show("boardFull");
          ctx.sound()?.confirm();
          await ctx.say([
            say("aiden", "Two insiders. Our own information. Nobody to copy from."),
            say("aiden", "Thursday. 7:00 AM. Let’s see if they’re right."),
          ]);
          ctx.go("line");
          return ctx.scene({
            id: "street",
            actors: CAMPERS,
            dog: false,
            banner: { place: "Sole District", time: "Thursday, 6:52 AM" },
            day: "Thu · Week 3",
            clock: 6 * 60 + 52,
          });
        }
        return ctx.say([say("aiden", "Red string. Very professional.")]);

      case "camper":
        await ctx.say([
          say("camper", "Been here since four. Some server called it: restock at seven."),
          say("aiden", "…Which server?"),
          say("camper", "AGNotify. You heard of it?"),
          say("aiden", "Once or twice."),
        ]);
        ctx.glint();
        if (step === "line") ctx.go("post");
        return;
      case "camper2":
        return ctx.say([say("camper", "If this restock’s real, I’m joining that server for life.")]);
      case "camper3":
        return ctx.say([say("camper", "Shh. I’m saving my energy for 7:00.")]);

      case "store":
        if (step === "line") return ctx.say([say("aiden", "Shutters still down. Let’s see who’s in line first.")]);
        if (step !== "post") return ctx.say([say("aiden", "Sold out in four minutes. Our members got theirs.")]);
        {
          const hits = (await ctx.open<number>({
            kind: "drop",
            rounds: [
              { name: "Court Low “Panda” · restock", time: "Thursday · 7:00:00 AM" },
              { name: "Retro IV “Cement” · online", time: "Saturday · 10:00:00 AM" },
              { name: "Surprise drop", time: "Any second now" },
            ],
          })) ?? 0;
          street(ctx).setShutter(true);
          ctx.sound()?.chime();
          const stage = ctx.stage();
          for (const id of ["camper", "camper2", "camper4", "camper5", "camper7"]) stage.actor(id)?.pose("cheer", 2600);
          ctx.bubble("camper", "LET’S GO", 2200);
          ctx.bubble("camper4", "W", 2200);
          ctx.stat("members", 70 + hits * 40);
          ctx.stat("revenue", 1000 + hits * 700);
          ctx.sound()?.coin();
          await ctx.wait(1400);
          await ctx.say([
            say("aiden", "Our alert went out at 7:00:00. The big servers? 7:02."),
            say("aiden", "That’s the whole business. Be first. Be right."),
          ]);
          return ctx.go("home");
        }

      case "home":
        if (step !== "home") return ctx.say([say("aiden", "Not leaving before seven.")]);
        ctx.checkpoint(2);
        return wordOfMouth(ctx);

      // —— act three: word of mouth
      case "editor": {
        if (step !== "editor") return ctx.say([say("editor", "Posting another one tonight. The algorithm loves you.")]);
        await ctx.open({ kind: "intro", who: "editor", name: "Raymond Wang", line: "The editor. Makes the reels that make people join.", colour: "#d74718" });
        await ctx.say([say("editor", "Okay. Reels. Short, loud, and the first second decides everything.")]);
        const hooks = ["“Hi guys, welcome to my sneaker group.”", "“POV: you knew the drop time before everyone.”", "“Shoes. Shoes. Shoes. Shoes.”"];
        for (;;) {
          const pick = await ctx.choose(say("editor", "So what’s the hook?"), hooks.map((label) => ({ label, who: "aiden" })));
          if (pick === 1) break;
          await ctx.say([say("editor", pick === 0 ? "They scrolled. They’re gone. Next." : "That’s not a hook. That’s a cry for help.")]);
        }
        await ctx.say([say("editor", "…Okay. That’s the one. Stand there. Look handsome.")]);
        ctx.glint();
        await ctx.open({ kind: "reel", caption: "POV: you knew the drop time before everyone 👟⏰" });
        ctx.stat("members", 420, 1600);
        ctx.stat("revenue", 6000, 1600);
        ctx.sound()?.coin();
        await ctx.say([
          say("editor", "Told you."),
          say("aiden", "Now it has to grow without us posting every day."),
          say("editor", "Then give people a reason to bring their friends."),
        ]);
        return ctx.go("referrals");
      }

      case "plaque":
        return ctx.say([say("aiden", "Framed it. Obviously.")]);

      case "phoebe":
        ctx.stage().cheer();
        if (step === "celebrate") {
          await ctx.say([say("phoebe", "*the happiest wag of all time*"), say("aiden", "We did it, Phoebe.")]);
          return ctx.end();
        }
        return ctx.say([say("phoebe", "*wag*"), say("aiden", step === "sources" ? "Don’t look at me like that. I said I’m doing it properly." : "Busy week, Phoebe.")]);

      case "door":
        return ctx.say([say("aiden", step === "check" || step === "copy" || step === "dm" ? "It’s late. The server needs me more than the street does." : "Not now.")]);

      case "window":
        if (step === "check" || step === "copy" || step === "dm") return ctx.say([say("aiden", "Somewhere out there, a group chat is asking when the drop is.")]);
        return flavour(id, ctx);

      case "mirror":
        if (step === "check" || step === "copy" || step === "dm") {
          await ctx.say([say("aiden", "Still handsome. Even at 9:40 PM.")]);
          ctx.glint();
          return;
        }
        return flavour(id, ctx);

      default:
        return flavour(id, ctx);
    }
  },
  end: {
    title: "The Cook Group",
    stats: [
      ["Revenue", "$45,000"],
      ["Sources", "Your own"],
      ["Bans", "1"],
      ["Handsome", "Max"],
    ],
    next: { number: "Chapter 2", title: "Future Business Leaders", line: "Meet John. Then Jerry. Then win everything.", chapter: "ch2" },
  },
};
