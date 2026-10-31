import type { ReactNode, SVGProps } from "react";

// The page's icons, drawn for it: filled 24px glyphs for the nav, 16px line
// icons for the small stuff.

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number };

function Svg({ size = 24, box = 24, children, ...rest }: IconProps & { box?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

function Line({ size = 16, box = 16, children, ...rest }: IconProps & { box?: number; children: ReactNode }) {
  return (
    <Svg size={size} box={box} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {children}
    </Svg>
  );
}

/* Nav */

export function HomeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.5 1.5 10.2l1.2 1.6 1.8-1.3V19a2 2 0 0 0 2 2H10v-6h4v6h3.5a2 2 0 0 0 2-2v-8.5l1.8 1.3 1.2-1.6L12 2.5z" />
    </Svg>
  );
}

export function NetworkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M2 19.5C2 15.9 5.1 13 9 13s7 2.9 7 6.5V21H2z" />
      <circle cx="17" cy="8.5" r="2.75" />
      <path d="M17.5 13c-1 0-1.9.2-2.7.6 1.4 1.3 2.2 3.1 2.2 5V21H23v-2.5c0-3-2.5-5.5-5.5-5.5z" />
    </Svg>
  );
}

export function JobsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fillRule="evenodd"
        d="M9 4a2 2 0 0 0-2 2v1H4a2 2 0 0 0-2 2v3.5h20V9a2 2 0 0 0-2-2h-3V6a2 2 0 0 0-2-2zm0 2h6v1H9zM2 14v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5h-8v1.5h-4V14z"
      />
    </Svg>
  );
}

export function MessagingIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fillRule="evenodd"
        d="M4 3h16a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-9l-5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2.5 4.5V9h11V7.5zm0 3.5v1.5H14V11z"
      />
    </Svg>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.5A1.5 1.5 0 0 0 10.5 4v.6A6.5 6.5 0 0 0 5.5 11v4.2L3.5 18v1h17v-1l-2-2.8V11a6.5 6.5 0 0 0-5-6.4V4A1.5 1.5 0 0 0 12 2.5zM9.5 20.2a2.5 2.5 0 0 0 5 0z" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Line strokeWidth={1.8} {...props}>
      <circle cx="7" cy="7" r="4.75" />
      <path d="m10.6 10.6 3.4 3.4" />
    </Line>
  );
}

export function CaretDownIcon(props: IconProps) {
  return (
    <Svg size={16} box={16} {...props}>
      <path d="M8 11 3.5 6h9z" />
    </Svg>
  );
}

/* Profile */

export function ShieldIcon(props: IconProps) {
  return (
    <Svg size={16} box={16} {...props}>
      <path
        fillRule="evenodd"
        d="M8 1 2.5 3v4.3c0 3.4 2.3 6.4 5.5 7.7 3.2-1.3 5.5-4.3 5.5-7.7V3zm-.8 9.6L4.8 8.2l1.06-1.06L7.2 8.48l3-3 1.06 1.06z"
      />
    </Svg>
  );
}

export function ConnectIcon(props: IconProps) {
  return (
    <Svg size={16} box={16} {...props}>
      <path d="M6 2.25a2.75 2.75 0 1 1 0 5.5 2.75 2.75 0 0 1 0-5.5zM1 13.5C1 11 3.2 9.5 6 9.5s5 1.5 5 4V14H1zM12 2.5h1.5v2h2V6h-2v2H12V6h-2V4.5h2z" />
    </Svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <Svg size={16} box={16} {...props}>
      <path
        fillRule="evenodd"
        d="M8 3C4.5 3 1.8 5.5 1 8c.8 2.5 3.5 5 7 5s6.2-2.5 7-5c-.8-2.5-3.5-5-7-5zm0 8.2A3.2 3.2 0 1 0 8 4.8a3.2 3.2 0 0 0 0 6.4zm0-1.7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
      />
    </Svg>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Line strokeWidth={1.4} {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M2.2 8h11.6M8 2c1.8 1.7 2.6 3.7 2.6 6S9.8 12.3 8 14C6.2 12.3 5.4 10.3 5.4 8S6.2 3.7 8 2z" />
    </Line>
  );
}

export function DiamondIcon(props: IconProps) {
  return (
    <Line strokeWidth={1.5} {...props}>
      <path d="M8 1.75 14.25 8 8 14.25 1.75 8z" />
      <path d="M8 5.5 10.5 8 8 10.5 5.5 8z" fill="currentColor" stroke="none" />
    </Line>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Line strokeWidth={1.7} {...props}>
      <path d="M9.5 3.5 14 8l-4.5 4.5M13.5 8H2" />
    </Line>
  );
}

export function ExternalIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" />
    </Line>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M6.6 9.4 9.4 6.6M7.3 4.3l.9-.9a2.9 2.9 0 0 1 4.1 4.1l-.9.9M8.7 11.7l-.9.9a2.9 2.9 0 0 1-4.1-4.1l.9-.9" />
    </Line>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Line strokeWidth={1.8} {...props}>
      <path d="M8 2.75v10.5M2.75 8h10.5" />
    </Line>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Line strokeWidth={1.8} {...props}>
      <path d="m2.75 8.5 3.5 3.5 7-7.5" />
    </Line>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Line size={24} box={24} strokeWidth={1.8} {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Line>
  );
}

export function ChevronIcon({ direction = "down", ...props }: IconProps & { direction?: "up" | "down" | "left" | "right" }) {
  const d = {
    up: "m4 10 4-4 4 4",
    down: "m4 6 4 4 4-4",
    left: "M10 4 6 8l4 4",
    right: "m6 4 4 4-4 4",
  }[direction];
  return (
    <Line strokeWidth={1.8} {...props}>
      <path d={d} />
    </Line>
  );
}

export function EllipsisIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5.5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="18.5" cy="12" r="1.75" />
    </Svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <Line size={24} box={24} {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </Line>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <Line size={24} box={24} {...props}>
      <path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15" />
    </Line>
  );
}

export function WebIcon(props: IconProps) {
  return (
    <Line size={24} box={24} {...props}>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
    </Line>
  );
}

export function ProfileCardIcon(props: IconProps) {
  return (
    <Line size={24} box={24} {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <circle cx="9" cy="10.5" r="2.25" />
      <path d="M5.75 16.5c.5-1.7 1.8-2.6 3.25-2.6s2.75.9 3.25 2.6M14.5 10h3.5M14.5 13.5h3.5" />
    </Line>
  );
}

export function ComposeIcon(props: IconProps) {
  return (
    <Line size={24} box={24} {...props}>
      <path d="M11 4.5H6a2 2 0 0 0-2 2V18a2 2 0 0 0 2 2h11.5a2 2 0 0 0 2-2v-5" />
      <path d="M17.6 3.4a1.9 1.9 0 0 1 2.7 2.7L12.5 14l-3.5.8.8-3.5z" />
    </Line>
  );
}

export function MedalIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M5 1.75h6l-1.6 4.1M5 1.75l1.6 4.1" />
      <circle cx="8" cy="10" r="4.25" />
      <path d="m8 7.9.65 1.3 1.4.2-1 1 .25 1.4L8 11.1l-1.3.7.25-1.4-1-1 1.4-.2z" fill="currentColor" strokeWidth={0.6} />
    </Line>
  );
}

export function StackIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M8 1.75 14.25 5 8 8.25 1.75 5zM1.75 8 8 11.25 14.25 8M1.75 11 8 14.25 14.25 11" />
    </Line>
  );
}

export function PeopleIcon(props: IconProps) {
  return (
    <Svg size={16} box={16} {...props}>
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1.5 13c0-2.5 2-4.2 4.5-4.2s4.5 1.7 4.5 4.2v.5h-9zM11.2 3.2a2.2 2.2 0 1 1 0 4.4 6 6 0 0 0 .1-4.4zM11.8 13.5v-.5c0-1.6-.6-3-1.6-4 2.5 0 4.3 1.6 4.3 4v.5z" />
    </Svg>
  );
}

export function CheckCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fillRule="evenodd"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.3 14.2-4.2-4.2 1.4-1.4 2.8 2.8 5.6-5.6 1.4 1.4z"
      />
    </Svg>
  );
}

/* Analytics */

export function TrendIcon(props: IconProps) {
  return (
    <Line size={24} box={24} strokeWidth={1.8} {...props}>
      <path d="M3 17.5 9 11.5l4 4 7.5-7.5M15 8h5.5v5.5" />
    </Line>
  );
}

export function TrophyIcon(props: IconProps) {
  return (
    <Line size={24} box={24} strokeWidth={1.8} {...props}>
      <path d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0zM7.5 6H4.5v1a3.5 3.5 0 0 0 3.4 3.5M16.5 6h3v1a3.5 3.5 0 0 1-3.4 3.5M12 13v3.5M8.5 20h7l-.8-3.5H9.3z" />
    </Line>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <Line size={24} box={24} strokeWidth={1.8} {...props}>
      <path d="m12 3 9 4.5-9 4.5-9-4.5zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
    </Line>
  );
}

/* Posts */

export function ThumbIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Line size={20} box={24} strokeWidth={1.7} {...props}>
      <path
        d="M7.5 10.5v9.5H4.25a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1zM7.5 10.5l3.7-6.3a1.6 1.6 0 0 1 2.95 1.15L13.4 9.5h5.35a2 2 0 0 1 1.96 2.4l-1.3 6.5a2 2 0 0 1-1.96 1.6H7.5"
        fill={filled ? "currentColor" : "none"}
      />
    </Line>
  );
}

export function CommentIcon(props: IconProps) {
  return (
    <Line size={20} box={24} strokeWidth={1.7} {...props}>
      <path d="M4.5 4.5h15A1.5 1.5 0 0 1 21 6v9.5a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3.5V17h-2A1.5 1.5 0 0 1 3 15.5V6a1.5 1.5 0 0 1 1.5-1.5zM7.5 9h9M7.5 12.5h6" />
    </Line>
  );
}

export function RepostIcon(props: IconProps) {
  return (
    <Line size={20} box={24} strokeWidth={1.7} {...props}>
      <path d="m16.5 3.5 3 3-3 3M19.5 6.5H8.5A4 4 0 0 0 4.5 10.5V12M7.5 20.5l-3-3 3-3M4.5 17.5h11a4 4 0 0 0 4-4V12" />
    </Line>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Line size={20} box={24} strokeWidth={1.7} {...props}>
      <path d="M21 3 3 10.4l7.2 3.3L13.6 21zM10.2 13.7 21 3" />
    </Line>
  );
}

const REACTION_COLORS = { like: "#378fe9", celebrate: "#6dae4f", love: "#df704d" } as const;

export function ReactionIcon({ kind, size = 16 }: { kind: keyof typeof REACTION_COLORS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="8" fill={REACTION_COLORS[kind]} />
      {kind === "like" ? (
        <path
          fill="#fff"
          d="M4.1 7.3h1.6v4.9H4.1zM6.4 12.2h3.8a1.1 1.1 0 0 0 1.1-.9l.55-2.75a1 1 0 0 0-1-1.2H8.7l.33-1.7a.95.95 0 0 0-1.7-.75L6.4 7.15z"
        />
      ) : kind === "celebrate" ? (
        <path
          fill="#fff"
          d="M6.4 12.3 4.6 9.6a.75.75 0 0 1 1.2-.9l.75 1V5.4a.75.75 0 0 1 1.5 0v2.4-3.3a.75.75 0 0 1 1.5 0v3.3-2.6a.75.75 0 0 1 1.5 0v2.6-1.6a.75.75 0 0 1 1.5 0v3.6a3.3 3.3 0 0 1-3.3 3.3h-.9a2.4 2.4 0 0 1-1.95-.9z"
        />
      ) : (
        <path fill="#fff" d="M8 12.4 4.5 9.1a2.25 2.25 0 0 1 3.15-3.2l.35.35.35-.35A2.25 2.25 0 0 1 11.5 9.1z" />
      )}
    </svg>
  );
}

/* Logos */

export function BuildingGlyph(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        fillRule="evenodd"
        d="M4 3h10v6h6v12H4zm2.5 2.5v2h2v-2zm3.5 0v2h2v-2zm-3.5 3.5v2h2V9zm3.5 0v2h2V9zm-3.5 3.5v2h2v-2zm3.5 0v2h2v-2zm5.5-1v2h2v-2zm0 3.5v2h2V15zM10 17v4H8v-4z"
      />
    </Svg>
  );
}

export function RecordGlyph(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="11.5" r="3" fill="#ff5a4e" />
      <path d="M8.5 21h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}
