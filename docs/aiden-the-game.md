# Aiden: Life of a Handsome Entrepreneur

**The game behind the PLAY button on `/designer`.** A cozy life sim, drawn the way the island is, about the real moments of Aiden's life so far: a $500 sneaker group chat, two best friends and a shelf of FBLA trophies, a hard first semester at Berkeley, three hackathon wins in a row, and alai.

This document is the plan for the whole game. The opening (the PLAY cinematic, the boot, the title screen), the Prologue and Chapters 1 to 4 are built and playable, with an optional mini-game, *Wingman*, in Chapter 2. Chapter 4 ends where Aiden's life is right now, *to be continued*: new chapters get written as it happens.

---

## Contents

1. [What's built](#1-whats-built)
2. [The pitch](#2-the-pitch)
3. [Pillars](#3-pillars)
4. [How it looks](#4-how-it-looks)
5. [How it plays](#5-how-it-plays)
6. [Systems](#6-systems)
7. [The story, chapter by chapter](#7-the-story-chapter-by-chapter)
8. [The island is the map](#8-the-island-is-the-map)
9. [Mini-games](#9-mini-games)
10. [People](#10-people)
11. [Interface](#11-interface)
12. [Sound](#12-sound)
13. [Engineering](#13-engineering)
14. [Production plan](#14-production-plan)
15. [What only Aiden can fill in](#15-what-only-aiden-can-fill-in)
16. [Guardrails](#16-guardrails)

---

## 1. What's built

| Piece | What happens | Code |
| :--- | :--- | :--- |
| **PLAY** | A cobalt pixel button at the top right of `/designer`, shown once the island has arrived. | `components/designer/designer.tsx` |
| **It was a trailer** | The island's UI slips away and a video player bar slides up over it ("0:41 / 1:30"). The island keeps cutting between its places like trailer footage. | `play/play.tsx` |
| **It was a store page** | The footage shrinks into the trailer slot of a game store, *esteem* (the way `/founder` is LockedIn). Capsule art, screenshots and the page's backdrop are cut from the island's own frame at the moment PLAY was pressed. "Overwhelmingly Handsome (318)". -90%, $45.00 → $4.50. | `play/store.tsx` |
| **It was a monitor** | The camera pulls back through the glass into a desk at night, seen from the chair: lamp, steaming mug, fairy lights, the Cal pennant, three trophies and the YC team photo on the shelf, the plushie, a voxel corgi and a voxel Aiden by the monitor's foot, the Campanile lit in the window. | `play/room.ts` |
| **Buying it** | The person in the chair leans in. The pointer travels like a hand moves it (bowed paths, a little overshoot), and the mouse on the desk moves with it. Buy → confirm → *Thank you!* (the phone on the desk lights with the receipt) → library → Install (2.6 GB at 980 MB/s) → Play. The library holds BarkOff, Rally and StartupSim. | `play/play.tsx`, `play/store.tsx` |
| **Booting** | The screen goes black, the room goes dark, *Aiden Guan presents*, then the title on the monitor lights the room peach. The camera goes through the screen and the title is the page. | `play/play.tsx`, `play/game/game.tsx` |
| **Title screen** | The island from the trailer, at dawn, drifting. New game, Chapters, Sound, Back to the island. | `play/game/title.ts` |
| **Prologue: The Drop** | A morning in Aiden's teenage bedroom, as a voxel diorama: wake up, answer the phone (the drop is tomorrow), find the $500 in a shoebox, open the laptop and found **AGNotify**, walk out the door. Phoebe follows you around. | `play/game/rooms/bedroom.ts`, `chapters/prologue.ts` |
| **Chapter 1: The Cook Group** | AGNotify from four members to $45,000. Copy a bigger server's alerts (*CopyRush*), get caught and banned by its owner, find your own insiders, call a restock from the line outside a sneaker shop (*The Drop*), pick the hook for Raymond's reel, set up referrals. | `chapters/chapter1.ts`, `rooms/street.ts`, `screens.tsx` |
| **Chapter 2: Future Business Leaders** | Meet John at lunch (he sells jeans he has never touched), then Jerry (here for the free pizza). Answer the judges as a trio at FBLA Regionals, fill the trophy case, rename the group chat, throw your caps at graduation, and split three ways. | `chapters/chapter2.ts`, `rooms/hallway.ts`, `rooms/auditorium.ts`, `rooms/field.ts` |
| **Wingman** (Ch. 2, optional) | At graduation, John says "Name one." Pick *Get on my shoulders* and Aiden throws John down the coast, Burrito Bison-style: John bounces off every baddie he lands on and rizzes her up, and the further he goes the badder they get (the beach's 6/10s, the pier, the marina, the yacht club's 10/10s). Three throws, each starting further along the coast; a dive homes in on the nearest baddie; boyfriends kill your speed; DMs boost it. | `play/game/wingman.ts`, `wingman-hud.tsx` |
| **Chapter 3: Golden Bear** | Berkeley, with Miles the roommate and Jun from down the hall. The group chat goes quiet, and neither Data C8 nor Math 52 makes sense. Then the flu the week before midterms, and again on the morning of both: two Tylenol, Data C8 then Math 52, an 86 and a 91. After that the floor, the glade, and three hackathons in a row (BarkOff's bark battle, alai's wrong step, Continuity's thread): three first places, a flood of DMs, and an evening in an SF startup office. | `chapters/chapter3.ts`, `rooms/dorm.ts`, `rooms/hall.ts`, `rooms/glade.ts`, `rooms/hackathon.ts`, `rooms/office.ts`, `screens-berkeley.tsx` |
| **Chapter 4: The Tutor** | alai becomes a company. Allen moves into Miles's desk (Miles is always out), the second Data C8 and Math 52 midterms happen anyway, the a16z Alpha final round runs on a video call, and the email after it says no. Then a bench at midnight, the YC and a16z speedrun applications, a bug bash, and Jun, the first student who says "oh". It ends *to be continued*. | `chapters/chapter4.ts` |
| **Saves and chapters** | The game saves at every act. *Continue* picks up from the last one; the Chapters screen unlocks each chapter once the one before it is done, and lists *To be continued* after the last. | `play/game/save.ts`, `chapters/index.ts` |

Skip with **Esc** (or the Skip button) at any point; with *reduced motion* on, PLAY goes straight to the title. Sound follows the site's own Sound setting. *Back to the island* dissolves home in the island's own pixel dither.

---

## 2. The pitch

> **Start with $500 and a sneaker group chat. Grow it, sell it, get into Berkeley, and win your way across the Bay Area's hackathons. A cozy life sim about building things people want, one sleepless weekend at a time.**

It's a life sim in the tradition of the farming-and-friendship games, but what grows here is **things you build**. Ideas are the seeds, weekends are the seasons, hackathons are the festivals, and the farm is **the island**: every project you ship becomes a place on it, until it looks exactly like the page the player pressed PLAY on.

The joke that runs through all of it is in the title. Aiden is very handsome, the game knows it, and the HANDSOME stat is maxed from the first frame and never moves.

---

## 3. Pillars

1. **True, then funny.** The moments are real (the $500, the $45,000, the first places, the classes). The jokes go in the gaps between facts, never instead of them.
2. **Build things people want.** Every system is a version of making something: an idea, hours, a launch, people using it. Nothing is won by grinding; it's won by shipping.
3. **Small world, made by hand.** Each chapter is one diorama you can hold in your head: a bedroom, a dorm, a hackathon floor, the island. Every object can be looked at and has something to say.
4. **The page is the game.** The island on `/designer` is the game's final map. Playing the game is how that island fills up.
5. **Respect the player's time.** A chapter is an evening. Skip anything. Save anywhere. No fail states that cost more than a minute.

---

## 4. How it looks

The game is drawn exactly the way the island is, so the trailer, the store page's screenshots and the game are one look.

- **Voxels at two sizes.** The island's props are 0.2 m voxels; people, Phoebe and interiors are 0.1 m, fine enough for curls and a collar.
- **The island's post pass** (`POST_FRAGMENT` in `scene/engine.ts`, now shared): the scene renders at a low art resolution, is scaled up by whole device pixels, colour is snapped to ~15 levels with an 8×8 ordered dither, solid things get a darker rim where they stand in front of something far, and at night lit things bleed a dithered glow.
- **Dioramas.** Interiors are cut away on the near two sides and float on the paper, the floor slab showing its thickness at the cut.
- **Light tells the time.** Dawn is peach (the title), morning comes through windows as a shaft on the floor, afternoon is the island's late sun, night is moonlight with the lamps lit.
- **Arrivals.** Scenes come in the way the island does on `/designer`: a dither dissolve outward from the middle (`uReveal`). Leaving the title, the island dissolves from the edge in.
- **Palette.** Paper `#f2efe8`, ink `#1b1d22`, cobalt `#2f6be8`, orange `#f08a32`, cream `#f6eedd`. Cobalt is Aiden's colour (the mark on the tee, the rug, the UI), orange is the AGNotify era's.
- **Interface.** Paper panels with an ink line and a hard 5 px ink shadow, Pixelify Sans for anything the game says, Geist for long reading (chapter descriptions, the laptop). No gradients, no glass. It should feel printed and slightly chunky.
- **The real world is not pixel art.** The desk in the cinematic is a lit 3D scene with bloom and grain, so that going through the screen into the pixels feels like going somewhere.

### Characters

| | Look |
| :--- | :--- |
| **Aiden** | A mop of dark curls (the photo), white tee with a small cobalt mark, dark trousers, white sneakers with an orange flash. 6'5", the tallest in every scene. |
| **Phoebe** | White, soft cream ears, cobalt collar with a gold tag. Follows a step behind and to the side. Her dialogue portrait is pixelled from the tortilla photo. |
| **John Wang** | Neat black hair, a denim jacket over a white tee, navy trousers. 5'4". His colour is denim. |
| **Jerry** | Messy hair, a green hoodie with a gold drawstring, khakis, grey sneakers. His colour is green. |
| **Raymond Wang** | The editor: black hoodie, red cap, white sneakers. |
| **Allen** | Neat black hair, glasses, an alai-yellow hoodie. 5'10". |
| **Miles** | Aiden's roommate: a black jacket over a white tee, dressed to go out. 5'11". |
| **Jun** | The floormate: a grey hoodie and a felt-green poker visor; round, and 4'11". |
| **Dylan Nguyen** | Messy hair, a black tee, khakis. |
| **Samuel Choi** | Short black hair, a slate jacket over a white tee. |
| The baddies (Wingman) | Built from a seed per zone: tees and shorts at the beach, crop tops at the pier, sundresses and sun hats at the marina, gold earrings and a pool of light at the yacht club. |
| Everyone else | Built from a seed (hair, skin, clothes, height between 5'3" and 6'0"), so a crowd never repeats. |
| Dialogue portraits | Aiden's and Phoebe's are generated at runtime from real photos (`play/game/portrait.ts`): face crop, 36 px, 7 tones, ordered dither. Everyone else's is drawn (`play/game/faces.ts`) until there's a photo to use. |

Everyone is drawn at their real height: the figure is built at 5'10" and scaled (Aiden 6'5", Miles 5'11", Allen 5'10", John 5'4", Jun 4'11"), and a round build widens and deepens the middle. Faces and clothes are guesses; with a photo each, they'd be pixelled the way Aiden is.

---

## 5. How it plays

### A day

Each playable day runs from waking up to going to sleep, about 12–18 real minutes at the default clock speed. A day has:

- **Time** (the clock in the HUD), which passes while you're free to move and stops in conversations and menus.
- **Energy**, spent by building, studying and going out; restored by sleep, meals, coffee and boba. An all-nighter is allowed (it's a hackathon game) but the next day starts at half energy.
- **Places to be.** Class at 10, a call at 3, a hackathon at 9 on Saturday. The calendar on the in-game phone shows them; missing one costs something small, never the chapter.

### The build loop (the farming)

| Farming idea | Here |
| :--- | :--- |
| Seeds | **Ideas.** Picked up from people's problems ("the cook group never knows when the drop is"), from what you notice, and from hackathon prompts. |
| Planting | **Starting a project:** choose an idea, a stack and a team. |
| Watering | **Work sessions.** Spend hours at a desk (the laptop is the hoe). Each session is a short focus mini-game, or auto-resolved if you'd rather. |
| Growth stages | **Idea → Prototype → Demo → Launch → Live.** Each stage changes how the project's place looks on the island. |
| Quality | **Polish**, from skill, sleep and the right tools. |
| Harvest | **Shipping:** users, revenue, stars, prizes. |
| Seasons | **Semesters and seasons:** summer, fall semester (hackathon season), winter break, spring. |
| Festivals | **Hackathons.** Timed set pieces with their own rules: 12–36 hours, a team, a theme, judging, a stage. |
| The farm | **The island.** Every shipped project becomes its place there. |

A project that isn't worked on doesn't wither; it just waits, the way side projects do.

### Controls

| | Keyboard | Mouse | Touch |
| :--- | :--- | :--- | :--- |
| Walk | WASD / arrows | Click the floor (walks the shortest way round furniture) | Tap the floor |
| Use | E / Space / Enter | Click the thing (walks to it first) | Tap the thing, or the prompt above it |
| Talk on | E / Space / Enter (hold to run on through the lines) | Click | Tap |
| Pause | Esc | The pause button | The pause button |

Gamepad support is planned for Milestone 5 (the stick walks, A uses, Start pauses).

---

## 6. Systems

### Money
One wallet. Starts at **$0**; the Prologue's shoebox makes it **$500**. AGNotify's revenue, freelance work, hackathon prizes and later the startup are the income. Spending: better gear (a faster laptop is faster work sessions), entry fees, food, shoes, rent at Berkeley. The ledger for the AGNotify chapter is played in LedgerLens's style (see the mini-games).

### Skills
Levelled by doing, five of them, each with perks at levels 3, 6 and 10:

| Skill | Grows by | A perk |
| :--- | :--- | :--- |
| **Code** | Work sessions, fixing bugs | Prototypes reach Demo a day sooner |
| **Design** | Polish passes, the island | Launches start with more users |
| **Hustle** | Selling, cold messages, the cook group | Every price you get is better |
| **Pitch** | Demos, judging, interviews | One free retry at the judges' table per hackathon |
| **Data** | Data C8, CourtVision, LedgerLens | See numbers others can't (hidden stats show in the HUD) |

**Handsome** is a sixth stat. It's maxed. It cannot be raised or lowered. The mirror in every chapter confirms this.

### People
Hearts, shown as five in the HUD. In Chapter 2 John's and Jerry's fill through the story; from Chapter 3 on they're raised by talking, helping, building together and gifts, with a short scene at each new heart. Teammates with high hearts join you at hackathons. See [People](#10-people) for who's in it and why most of them are roles until Aiden says otherwise.

### The phone
The in-game phone (P) has the apps a day needs:

- **Calendar**: classes, hackathons, drops.
- **Chats**: the group chats (and, in Chapter 1, the cook group itself).
- **LockedIn**: the `/founder` page as an in-game app. Post after a win to gain followers; the feed is the real one.
- **Bank**: the wallet and the AGNotify ledger.
- **Map**: where you are, where you can go.

### Collections
- **The trophy shelf**: one cup per first place (three so far), the same shelf as the desk in the cinematic.
- **The sneaker wall**: pairs you kept (Chapter 1).
- **The clothesline**: photos of the moments, pegged up like the clothesline on `/student`. The YC steps and the a16z check are the first two.
- **Stickers**: hackathon swag, stuck on your laptop lid, visible whenever you're at a desk.

### Saving
**Built:** a save at every act, in `localStorage` (`aiden-game-save`: the chapter, the act, the chapters finished), checked on load so a broken or old save can't stop the title screen. Continue on the title screen picks up at the start of the last act; a finished chapter moves Continue on to the next one. It only ever moves forward: replaying an earlier chapter from the Chapters screen keeps your place, and New game asks once before starting over.
**Planned:** three slots, and the day, time, wallet, skills, hearts, island state and collections once those systems exist.

---

## 7. The story, chapter by chapter

Each chapter is its own diorama (or a few), its own season, a handful of people, one new system and a set piece at the end. Chapter titles match the in-game Chapters screen (`play/game/chapters/index.ts`).

### Prologue · The Drop ✅ built
**When:** before Berkeley. **Where:** Aiden's bedroom.
**Beats:** wake to the phone buzzing → the drop is tomorrow and every group chat is panicking → *"I could tell them. For a small monthly fee."* → the $500 in the shoebox → the laptop: create a server, name it **AGNotify** → out the door.
**Teaches:** walking, using things, talking, the objective line, the HUD.
**Length:** 3–5 minutes.

### Chapter 1 · The Cook Group ✅ built
**When:** AGNotify's first months. **Where:** the bedroom (by day, then by night as it fills up), the street outside *Sole District* at dawn.
**The goal:** grow AGNotify from four members to **$45,000 in revenue**. The HUD counts members, and revenue against the goal.
**Beats, in three acts:**
- *Scrappy.* Three channels, four members, no information of its own. Aiden copies a bigger server's alerts into AGNotify (*CopyRush*: every pasted alert brings members). Then a DM from **kingcop**, who runs **HYPEHAUS**, the biggest server around: rule #1 is never repost their alerts. Banned.
- *The comeback.* The corkboard of leads turns into two insiders, one at Nike, one at JD Sports, and a tip: the court-low restock is Thursday at 7. At dawn there's a line outside Sole District, and a camper is in it because AGNotify said so. Post the alerts on time (*The Drop*); the shutter goes up and the line cheers.
- *Word of mouth.* **Raymond Wang** cuts the reels: pick the hook (most hooks are bad), stand there, look handsome. The reel's footage is a frame of the game itself. Then referrals on the laptop, and revenue climbs to $45,000. That night: LEDs, a ring light, more shoeboxes than shelves, a plaque that says $45K.
**Ending:** Phoebe, who believed first.
**Length:** 10–15 minutes.

### Chapter 2 · Future Business Leaders ✅ built
**When:** high school, after the cook group. **Where:** the school hallway, FBLA Regionals in a conference auditorium, the football field at graduation.
**People:** **John Wang**, who runs a store of dropshipped jeans from AliExpress, and **Jerry**, who joined FBLA for the free pizza. Aiden and John are the schemers; Jerry is the group's punching bag, and in on the joke.
**New system:** friendship. John's and Jerry's hearts in the HUD.
**Beats, in four acts:**
- *Denim.* Lunch. The only free seat is next to John. Then Jerry runs in: FBLA meets in Room 204, and there's pizza.
- *Regionals.* The three of them on stage, three questions from the judges, and each answer is one of theirs. Jerry's are the funny ones, and one of them somehow wins it. **1st place**, then more of them.
- *Senior year.* The trophy case, full. The group chat is renamed *future billionaires (+ jerry)*.
- *Graduation.* Walk the stage, find John and Jerry, throw the caps. That summer, Aiden dated a lot of baddies ("Name one." "…It was a busy summer."). Then a signpost with three boards: **Berkeley**, **USC**, and **community college, then USC** for Jerry. The group chat stays open.
**Ending:** three ways off one field.
**Length:** 10–15 minutes.

### Chapter 3 · Golden Bear ✅ built
**When:** fall 2026, the first stretch at Berkeley. **Where:** a double in the dorms, a lecture hall, Memorial Glade, three hackathon venues, a startup office in San Francisco.
**New systems:** the *Midterm prep* bar, and a *1st places* counter that appears with the first win.
**Beats, in nine acts:**
- *Week one.* **Miles**, the roommate, tells a joke that isn't one ("What's brown and sticky?" "A stick.") and heads out to friends Aiden is told not to meet. The group chat is busy without Aiden ("who is this" … "jk. miss you too"). The Campanile rings every hour; Phoebe is a photo on the desk. Then **Jun** from down the hall comes through the door without knocking: poker, five-dollar buy-in, midnight. "Fine is a long way from home."
- *Data C8.* A seat in a full lecture hall, a slide about tables, then Math 52 (integrals, then series), then a problem set at 1 AM (*problem sets*, the mini-game).
- *Sick.* The week before midterms: tissues, tea, a Data C8 practice midterm and a Math 52 review played sick (the screen sways, coughs knock it, the edges go green). The group chat: "have you tried not being sick". Jun barges in anyway: "Sick people bluff better."
- *Midterm day.* Sick again at 7 AM. Two Tylenol, hood up, out the door. **Data C8 Midterm 1** in the morning, **Math 52 Midterm 1** that afternoon, each in its own exam hall with the course on the board, each on a ruled sheet with a clock.
- *After.* Two days later, on the glade, the grades land one class at a time: **86** in Data C8 (the class where Aiden's one question was "what is happening"), then **91** in Math 52. Miles: "Ninety-one. That's a nine, then a one." Jun would play that hand. Then the floor, boba, a party every Friday (Miles talks to everyone; half of them come back to the room), a flyer on the kiosk.
- *SpaceXAI Build Night.* "Two webcams. One question. Who barks best." BarkOff, built with the floor in a night; the demo is *Bark Battle*. **1st place.**
- *a16z SpeedHacks.* Meeting **Allen**. alai, built in a weekend; the demo is *Wrong Step*. **1st place, Best Use of Keewano**, and a check the size of a door.
- *Make Something Agents Want.* **Dylan Nguyen** and **Samuel Choi**; Continuity; the demo is *Thread*. **1st place, Primitive.dev track**, the team on the steps.
- *Top of the world.* 1:40 AM, the room full of people Miles met forty minutes ago, and forty-one DM requests ("are you the barking guy"). Then San Francisco: three founders at golden hour, the Bay Bridge in the window.
**Ending:** "Everyone in the room is building something. Including me."
**Length:** 15–20 minutes.

### Chapter 4 · The Tutor ✅ built
**When:** late fall 2026, now. **Where:** the dorm (the office now), the lecture hall, the glade at midnight.
**New systems:** a *Waitlist* counter.
**Beats, in three acts:**
- *Round two.* Allen at Miles's desk (Miles is out from eleven to three; Allen tracked it), **CO-FOUNDERS**, studying and building in the same night, the waitlist at exactly 480, Miles home at 1:40 AM with seven new friends, then **Data C8 Midterm 2** and **Math 52 Midterm 2** (not sick this time).
- *The final round.* The a16z Alpha final round as a video call: three questions, each answered by Aiden or Allen. Friday's email: not this time. A bench under the Campanile at midnight: "We make it so good the next one can't say no."
- *Building.* The YC and a16z speedrun applications, typed into the forms; a bug bash on the iPad; Jun through the door with a calc set due at nine, alai catching his wrong step, and "…Oh. OH." ("It's alright, I guess.")
**Ending:** coffee, two desks, a lot of bugs to go. *To be continued.*
**Length:** 10–15 minutes.

### Chapter 5 · To be continued
Whatever happens next: the YC and speedrun decisions, alai's launch, the next semester. It gets written when it's true.

### Later, maybe
- **Hackathon Season**, as side stories you can play from the Chapters screen: Cal Hacks 13.0 (**LedgerLens**), Kane CLI Hack Day SF (**Seyrin**), and the side projects (Rally, CourtVision, PigeonBox, StartupSim, agenthub, AntiAgent, Inroad, OpenScreen).
- **The Island**: the `/designer` island, fully walkable. Every place you built is there and replays its chapter's moment; anything you start becomes a new place. The last scene: Aiden at a desk at night, a store page on the monitor, the cursor over PLAY, the credits.

### Epilogue · Life, so far
The game is meant to be updated as Aiden's life is: a new project or a new win is a patch, the patch notes are written in the store's voice ("v1.1: adds a co-founder and a waitlist"), and the island grows a place.

---

## 8. The island is the map

The island on `/designer` is already laid out as the game's final map. Each place is unlocked by its chapter:

| Place | Project | Unlocked in |
| :--- | :--- | :--- |
| The tree on the hill | LedgerLens | Hackathon Season (Cal Hacks 13.0) |
| The koi pond | LedgerLens | Hackathon Season |
| The bridge and the letters | Continuity | Ch. 3 (YC) |
| The mailbox | Seyrin | Hackathon Season (Kane CLI Hack Day) |
| The table | Rally | Hackathon Season |
| The court | CourtVision | Hackathon Season |
| The dovecote | PigeonBox | Hackathon Season |
| The chalkboard | alai | Ch. 3–4 (a16z SpeedHacks) |
| The corgis | BarkOff | Ch. 3 (Build Night) |
| Aiden in the field | — | From the start |

A place grows through the project's stages (scaffolding at Prototype, half-built at Demo, finished at Live), using the island's dissolve to swap models. Places for AGNotify (a sneaker stall), StartupSim (a tiny office), agenthub, AntiAgent and Inroad still need sites on the island; there's room by the stream and on the east hill.

---

## 9. Mini-games

Every mini-game is a project's own idea, made playable. All of them are short (30–90 seconds), skippable after a first try, and none blocks the story.

| Mini-game | From | How it plays |
| :--- | :--- | :--- |
| **CopyRush** ✅ | AGNotify (Ch. 1) | Their server's alerts scroll by; paste them into yours and watch members arrive. It goes about as well as it should. |
| **The Drop** ✅ | AGNotify (Ch. 1) | Three drops, each faster: post the alert as the marker crosses the moment it goes live. Perfect, good, early or late. |
| **The Hook** ✅ | AGNotify (Ch. 1) | Raymond asks for the reel's first line; pick the one that stops the scroll. |
| **Wingman** ✅ | The summer after graduation (Ch. 2) | Throw John off your shoulders and bounce him off baddies down the coast. A timing meter for the throw, a homing dive, three throws; the beach, the pier, the marina and the yacht club get badder in that order. |
| **Problem sets and midterms** ✅ | Berkeley (Ch. 3–4) | Multiple choice in each class's own kind of problem: tables, simulation and inference for Data C8; integration techniques, improper integrals and series for Math 52. Four midterms in all, each with its own exam hall; a midterm adds a ruled sheet and a clock. Sick, the screen sways, blurs and coughs. |
| **Cop or Drop** | AGNotify | A market: pairs with asking prices and resale estimates; buy, hold, sell before the hype fades. |
| **Leak Hunt** | LedgerLens | A store's bank feed; tap the duplicate payment, the price creep, the margin slipping. The rules do the maths; you find the leak. |
| **Thread** ✅ | Continuity (Ch. 3) | A long email thread beside a "handoff state" panel: what's the price now, when does it start, who acts next. Each right answer pins a fact the next agent gets in one call. |
| **Rally** | Rally | Table tennis: swipe (or tilt the phone) to brush, drive or chop. |
| **Box Score** | CourtVision | A possession plays out; tag the shot, the rebound, the assist as they happen. |
| **Pigeon Post** | PigeonBox | Sort the inbox by sending pigeons to the right coops. |
| **Bark Battle** ✅ | BarkOff (Ch. 3) | Two webcams, one question. The challenger barks, then you do, on a meter: *AWOOOO*, *WOOF* or *yip.* The room's tug-of-war bar picks the winner. (A mic version could come later.) |
| **Wrong Step** ✅ | alai (Ch. 3) | A handwritten solution on an iPad; circle the step where it goes wrong, and alai's little yellow bird says the nudge out loud. |
| **The call** ✅ | a16z Alpha (Ch. 4) | A video call: the partner asks, and you pick who answers, Aiden or Allen. |
| **Applications** ✅ | YC, a16z speedrun (Ch. 4) | Each press writes the next answer into the form; then send it. |
| **Bug Bash** ✅ | alai (Ch. 4) | Bugs crawl onto alai's six screens; aim with the arrows or 1–6 and squash them before they ship. |
| **Lease** | agenthub | Three agents, one codebase; route each to its files without two holding the same one. |
| **The Pitch** | FBLA (Ch. 2, built as three questions with an answer from each of the trio), then every hackathon | A judges' table: pick what to show and when, read the room, land the demo. |
| **StartupSim** | StartupSim | The real game, embedded, played on the laptop in Hackathon Season. |

---

## 10. People

The game is about a real person, and the people around Aiden are real too. Rules:

- **Aiden** and **Phoebe** are in it as themselves, and so are the people Aiden named: **John Wang**, **Jerry** and **Raymond Wang** (Chapters 1–2), **Miles**, **Jun**, **Allen**, **Dylan Nguyen** and **Samuel Choi** (Chapters 3–4). Their looks are guesses until there are photos; their heights are real.
- Anyone else real appears **only with Aiden's say-so and their own consent**. Until then they're roles, written as composites: *the co-founder*, *the teammate who carries the demo*, *the roommate*, *the judge*.
- No real public figures as characters. (The arcade on `/student` uses some; this game shouldn't.)

| Role | Where | Notes |
| :--- | :--- | :--- |
| Phoebe | Everywhere at home | Follows you; gives the best reactions; the first believer. |
| Raymond Wang | Ch. 1 | The editor who made AGNotify's reels. |
| John Wang | Ch. 2 on | Best friend. Ran a store of dropshipped jeans; went to USC. |
| Jerry | Ch. 2 on | The third of the trio and its punching bag; community college, then USC. |
| kingcop | Ch. 1 | The owner of the big server that banned Aiden. A made-up handle for a real person who isn't named. |
| The insiders | Ch. 1 | One at Nike, one at JD Sports. Never named, never shown. |
| The cook group | Ch. 1 | Members with usernames, not faces; a few regulars with running jokes. |
| Allen | Ch. 3–4 | Won a16z SpeedHacks with Aiden; alai's co-founder. Written the way Allen thinks: direct, literal, exact with numbers, honest without padding, and always right about the detail. The jokes are never at his expense. |
| Miles | Ch. 3–4 | The roommate. His jokes aren't funny, which is the joke. Can talk to anyone, and brings half the party home. His (strange) friend group stays out of the story. |
| Jun | Ch. 3–4 | The floormate. Plays poker, never knocks, comes through the door mid-work. Alright, I guess. alai's first tester. |
| Dylan Nguyen, Samuel Choi | Ch. 3 | The Make Something Agents Want team behind Continuity. |
| The other floormates | Ch. 3 | Two composites, unnamed: the BarkOff team at Build Night. |
| Family | Prologue on | Only if Aiden wants them in it, and how Aiden wants them. |
| Judges, professors, proctors, partners, founders | Ch. 2–4 | Generic characters, never named after real people. |

---

## 11. Interface

- **HUD:** day and time with the objective under it (top left), and under that the chapter's bar (revenue against $45,000 in Chapter 1, *Midterm prep* in Chapters 3–4); the chapter's counters (members, John's and Jerry's hearts, *1st places*, the *Waitlist*), HANDSOME and pause (top right); a prompt above whatever's in reach (*E · Laptop*); an orange diamond over wherever the objective is. Wingman has a HUD of its own.
- **Dialogue:** a paper box at the bottom, portrait on the left, name tag (cobalt for Aiden, orange for Phoebe, ink for objects), text typed at ~45 characters a second with a voice blip per speaker; press to finish, press again to go on, hold to run on through a long exchange. Answers take a beat before they'll accept a press, so mashing through lines never picks one unseen, and a click beside the box never picks one at all. Esc pauses anywhere, a screen included: its clock stops and so does the music.
- **Menus:** title (Continue, New game, Chapters, Sound, Back to the island), pause (Resume, Sound, Title screen, Back to the island).
- **Screens:** the laptop and phone moments open over the scene as their own interfaces: a server being created, chats and DMs (*Chatter*, *Instaglam*), the drop alert, a reel, a revenue chart, problem sets and a midterm sheet, a video call, an email, application forms, alai on an iPad. A new person gets an intro card with their name and a line; a big moment gets an impact frame (*1ST PLACE*, *91*, *CO-FOUNDERS*).
- **The phone:** slides up from the bottom; apps as big pixel tiles.
- **Accessibility:** reduced motion (no camera drift, no shake, instant transitions), text speed and instant text, captions for sound cues ("bzzt bzzt"), every control on keyboard, tap targets at least 44 px, contrast checked on the paper panels, colour never the only signal.
- **Screens:** desktop first; phones play in portrait with tap-to-walk, the dialogue box and HUD reflowing (already true of the Prologue).

---

## 12. Sound

Everything is synthesised in WebAudio (`play/sound.ts`), no files, and it follows the site's Sound setting.

- **Title theme:** a music-box melody over a soft pad, C – Am – F – G at 84 bpm.
- **Per chapter:** Ch. 1 lo-fi beats on a laptop speaker; Ch. 2 a hallway's hum, and a marching band at graduation; Ch. 3 the Campanile's bells on the hour; Ch. 4–7 a driving hackathon loop that gets faster as the deadline closes; Ch. 8 the title theme, fuller.
- **Effects so far:** UI press, mouse clicks (down and up), the store's chime, install ticks, the monitor's thump, the game's sting, whooshes, the room's hum, footsteps, coins, a sparkle, dialogue blips; and since Wingman and Berkeley, a rubbery bounce, a rizz arpeggio that climbs with the combo, a thud, a dive whistle, a "nope", a cough, a bark, an alarm, a notification and keyboard clicks.
- **Still to make:** the phone's vibration, doors, a crowd at a demo, applause, Phoebe's own bark.

---

## 13. Engineering

### How it's put together
- `/designer` stays light: the game is behind a dynamic `import()` that starts loading when the pointer nears PLAY.
- **The cinematic** (`play/play.tsx`) runs on one clock that can pause, speed up and skip. The room is a three.js scene (`play/room.ts`); the store page, the island and the game are real DOM, *corner-pinned* onto the monitor with a `matrix3d` homography each frame (`play/pin.ts`), so the island keeps running inside the trailer and the game is already live on the monitor before the camera goes in. Shaders compile off the main thread before the camera moves.
- **The game** (`play/game/`) draws with the island's own pipeline (`view.ts` + the post pass exported from `scene/engine.ts`) and builds scenes from the island's voxel mesher. Story state is React; the world is three.js; prompts and bubbles are DOM projected from world positions.
- The island engine gained `look(id, zoom, pace)` (the trailer's slow cuts) and `pause(on)` (stops drawing while the game owns the shared uniforms).
- **Scenes** are modules in `play/game/rooms/`, each a voxel diorama with its colliders, its spots (the things you can use) and its lights. `stage.ts` puts people in them, walks them round furniture with A*, and gives the cast simple behaviours: idle, watch you, wander, follow you.
- **Chapters** are scripts in `play/game/chapters/`, written against a small API: say, choose, open a screen, change scene, wait, set a stat, checkpoint, play a mini-game. A chapter is a few acts (each one a place Continue can start from), the objective for each step, and what using each thing does.
- **Wingman** (`play/game/wingman.ts`) takes the world over while it runs: its own scene, a course along screen-right built from pooled 24 m tiles (two per zone), pooled baddies, a camera that leads John and zooms out with height, a sun that follows the action, fixed-step physics with hit-stop. `ctx.minigame("wingman")` resolves with the summer's stats and hands the room back.

### Next, structurally
- **A systems module** (time, energy, wallet, skills, hearts) kept pure, so it can be tested with `node --test` the way `scripts/test-arcade.mjs` tests the arcade.
- **The island as a scene**: the `/designer` world plus a walkable heightfield (`terrain.ts` already has `heightAt`), colliders per place, and places that grow by stage.
- **Saves**: already versioned JSON in `localStorage` (`v: 1`); migrate forward when the systems add to it.
- **Budgets**: 60 fps on a 2020 laptop; the cinematic draws at ≤1.5× device pixels; each diorama under 80k voxels; nothing over 300 kB loaded before PLAY.

---

## 14. Production plan

| Milestone | Contents | Size |
| :--- | :--- | :--- |
| **M0 · The opening** ✅ | PLAY cinematic, store, desk, boot, title, Prologue, this plan | done |
| **M1 · Chapters 1 and 2** ✅ | Story runner, saves and Continue, the Chapters screen, four new dioramas (street, hallway, auditorium, field) and the bedroom by night, the cast, CopyRush, The Drop, The Hook, the judges | done |
| **M2 · Berkeley and alai** ✅ | Wingman, Chapters 3 and 4, five dioramas (dorm, lecture hall, Memorial Glade, a hackathon venue in three colours, an SF office), eight new screens, the new cast | done |
| **M3 · Chapter 5** | Whatever happens next | when it happens |
| **M4 · Systems** | The phone, time and energy, wallet, skills, settings | 1–2 weeks |
| **M5 · Side stories** | Hackathon Season: LedgerLens, Seyrin, the side projects, their mini-games | 2–3 weeks |
| **M6 · The island** | Walkable island, places by stage, the ending, credits | 2–3 weeks |
| **M7 · Launch** | Balance, accessibility pass, performance pass, gamepad, a real trailer (the island page, recorded) | 1 week |

Each milestone ships to `/designer` on its own; the Chapters screen ends with *To be continued*.

---

## 15. What only Aiden can fill in

The game is only as good as its true details. Before each chapter is built:

**Prologue and Chapter 1**
- Where was the bedroom, and what was really in it? How old were you?
- Where did the $500 come from?
- The best drop and the worst one. (The chapter has a restock called from a line at dawn; a true one would be better.)
- What happened to AGNotify after $45,000: sold, handed over, or still running? The chapter ends at the plaque.
- *kingcop* and *HYPEHAUS* are made up. Say if the ban should be vaguer still.

**Chapter 2**
- Which FBLA events you won, and the real results. The chapter has 1st place at Regionals, then "a shelf".
- One or two of the trio's real inside jokes, to replace the invented ones.
- A photo each of John and Jerry (and Raymond, from Chapter 1), and that all three are happy to be in it.
- Which high school, and its colours (the hallway is cobalt for now).

**Chapter 3**
- Which dorm.
- The real floor: are the two floormates people you'd want named? Who built BarkOff with you?
- One true moment from each hackathon: what broke, what saved it, what the judges said.
- Is Phoebe your dog? (She's in the Prologue as if she is.)

**Chapter 4**
- What a16z Alpha is, in your words, and anything true from the final round.
- Your second-midterm scores, if you want them in. (Round two shows no grades for now.)
- Photos of Allen, Dylan, Samuel, Miles and Jun, and that they're happy to be in it (Allen especially, with his voice written the way it is).
- Chapter 5, when it happens: the YC and speedrun decisions, alai's launch.

**Everywhere**
- Foods, places and habits (they become gifts, shops and energy items).
- Things you'd rather the game left out.

---

## 16. Guardrails

- **An original game.** It's a cozy life sim in a well-loved genre, with its own art, interface, mechanics and story. No assets, interface designs, characters or maps from any existing game.
- **The store is a parody.** *esteem* is to games stores what LockedIn is to LinkedIn: its own name and mark, nobody's logo.
- **No real brands on products.** Sneakers have no logos and go by nicknames (*Court Low “Panda”*); the chat app is *Chatter*, the photo app *Instaglam*, the big server *HYPEHAUS*. The one exception is the story's own: the insiders work at Nike and JD Sports, because that's what happened. They're named in a DM, and no logo is ever shown.
- **Real names where they're the facts.** Events are named because they happened (SpaceXAI Build Night, a16z SpeedHacks, Y Combinator's Make Something Agents Want, a16z Alpha and speedrun); a line mentions Tylenol. No logos anywhere.
- **Wingman stays a joke about Aiden.** The baddies are dressed for the beach, the pier, the marina and the yacht club; the ratings rise with the place, and nothing is sexualised.
- **Real people only with consent** (see [People](#10-people)).
- **Facts stay facts.** Dates, results and numbers come from `content/worlds.ts` and `content/founder.ts`, the same source as the rest of the site. One known difference: the content dates BarkOff to August 2026, while Chapter 3 tells it after midterms, the way Aiden does; the chapter shows no month for the hackathons.
