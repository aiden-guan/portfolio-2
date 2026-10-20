import type { CSSProperties, ReactNode } from "react";

// One thing on the mat: a sheet with a front and, if it can be turned over,
// a back. Its width is in millimetres of mat (--W); the table
// (components/mat/table) moves and turns it, and `action` says what a click
// on it does.

// flip: turn it over; open: show its print large; mail: write to the owner;
// punch: put a hole through it; clock: punch the time into it; travel: go to
// the place it's a postcard of
type Action = "flip" | "open" | "mail" | "punch" | "clock" | "travel" | "none";

type ThingProps = {
  kind: string;
  label: string;
  // width in millimetres
  w: number;
  action?: Action;
  back?: ReactNode;
  className?: string;
  style?: CSSProperties;
  id?: string;
  data?: Record<string, string>;
  children: ReactNode;
};

export function Thing({ kind, label, w, action = "flip", back, className, style, id, data, children }: ThingProps) {
  const dataset = Object.fromEntries(Object.entries(data ?? {}).map(([key, value]) => [`data-${key}`, value]));
  return (
    <article
      className={`thing thing-${kind}${className ? ` ${className}` : ""}`}
      data-thing={kind}
      data-action={back || action !== "flip" ? action : "none"}
      aria-label={label}
      tabIndex={0}
      id={id}
      style={{ "--W": w, ...style } as CSSProperties}
      {...dataset}
    >
      <div className="thing-turn">
        <div className="thing-body">
          <div className="thing-face thing-front">{children}</div>
          {back ? (
            <div className="thing-face thing-back" aria-hidden="true" inert>
              {back}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

