"use client";

import { usePathname } from "next/navigation";
import { ROLES, type Role } from "@/content/worlds";
import styles from "./not-found.module.css";

// Edits (insert, delete, change, swap two neighbours) between two words.
function distance(a: string, b: string) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

// What the address was reaching for. Only a slip of one of the four pages is
// ever said back: anything else typed into the address stays out of a
// sentence that starts "my name is Aiden".
function read(pathname: string): { role: Role; typo: string | null } | null {
  const first = pathname.split("/").find(Boolean);
  if (!first) return null;
  let word = "";
  try {
    word = decodeURIComponent(first).toLowerCase().replace(/[^a-z]/g, "");
  } catch {
    return null;
  }
  if (word.length < 4) return null;
  const exact = ROLES.find((role) => role === word);
  // /student/anything: the page is real, the rest of the address isn't
  if (exact) return { role: exact, typo: null };
  const ranked = ROLES.map((role) => ({ role, edits: distance(word, role) })).sort((a, b) => a.edits - b.edits);
  const [best, next] = ranked;
  if (best.edits > 2 || best.edits === next.edits) return null;
  return { role: best.role, typo: word };
}

// "not a studnet", "not an atudent", and "not builders"
function notA(typo: string, role: Role) {
  if (typo === `${role}s`) return `not ${typo}`;
  return `not ${/^[aeiou]/.test(typo) ? "an" : "a"} ${typo}`;
}

// One sentence, like the black page's, and the way back to it. A slip of
// one of the four pages gets the sentence finished with the right word,
// which is the way there.
export function NotFoundSentence() {
  const reached = read(usePathname() ?? "");
  const tail =
    reached?.typo ? (
      <>
        <span className={styles.part} style={{ "--d": 2 } as React.CSSProperties}>
          and I am a{" "}
          {/* a full load, like every way into a world */}
          <a className={styles.word} data-role={reached.role} href={`/${reached.role}`}>
            {reached.role}
          </a>
          ,
        </span>{" "}
        <span className={styles.part} style={{ "--d": 3 } as React.CSSProperties}>
          {notA(reached.typo, reached.role)}.
        </span>
      </>
    ) : (
      <>
        <span className={styles.part} style={{ "--d": 2 } as React.CSSProperties}>
          and this page
        </span>{" "}
        <span className={styles.part} style={{ "--d": 3 } as React.CSSProperties}>
          isn’t here.
        </span>
      </>
    );
  const home = reached && !reached.typo ? { href: `/${reached.role}`, label: `back to /${reached.role}` } : { href: "/", label: "back to the start" };

  return (
    <>
      <h1 className={styles.line}>
        <span className={styles.part} style={{ "--d": 0 } as React.CSSProperties}>
          Hi, my name is
        </span>{" "}
        <span className={`${styles.part} ${styles.name}`} style={{ "--d": 1 } as React.CSSProperties}>
          Aiden
        </span>{" "}
        {tail}
      </h1>
      <a className={styles.home} href={home.href}>
        {home.label}
      </a>
    </>
  );
}
