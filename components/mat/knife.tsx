// What the mat is cut with: a craft knife with a No. 11 blade, drawn to
// scale (one unit is a millimetre of mat) with its tip at the origin and
// its handle running out along the x axis. lib/cuts holds it at the pointer
// while a cut is being made, and draws the cut, which heals.

export function Knife() {
  return (
    <div className="knife" aria-hidden="true">
      <div className="knife-hand">
        <svg className="knife-art" viewBox="-4 -8 132 24" focusable="false">
          <defs>
            <filter id="knife-soft" x="-10%" y="-60%" width="120%" height="220%">
              <feGaussianBlur stdDeviation="0.7" />
            </filter>
            <pattern id="knife-knurl" width="1.3" height="1.3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <path d="M0 0H1.3M0 0V1.3" stroke="#6e736f" strokeWidth="0.32" fill="none" />
            </pattern>
            <clipPath id="knife-cone">
              <path d="M28.6 -0.5 L41 -1.8 V7.4 L28.6 6.1 Z" />
            </clipPath>
            <clipPath id="knife-barrel">
              <rect x="41" y="-1.8" width="73.5" height="9.2" />
            </clipPath>
            {/* the point is down in the mat, out of sight below its surface */}
            <linearGradient id="knife-sink-fade" x1="0.2" y1="0" x2="2.2" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#000" />
              <stop offset="1" stopColor="#fff" />
            </linearGradient>
            <mask id="knife-sink" maskUnits="userSpaceOnUse" x="-4" y="-8" width="132" height="24">
              <rect x="-4" y="-8" width="132" height="24" fill="url(#knife-sink-fade)" />
            </mask>
          </defs>
          {/* the tip is on the mat and the handle is held up off it, so the
              shadow leaves the knife further along its length */}
          <g className="knife-shadow" filter="url(#knife-soft)">
            <path d="M0 0 L29 0 V5.6 L22 5.6 Z" />
            <path d="M28.6 -0.5 L41 -1.8 H121 C123.6 -1.8 124.4 7.4 121 7.4 H41 L28.6 6.1 Z" />
          </g>
          {/* the blade: its spine straight, its edge ground at a shallow angle */}
          <g stroke="#5f6460" strokeWidth="0.22" strokeLinejoin="round" mask="url(#knife-sink)">
            <path d="M0 0 L29.5 0 V5.6 L22 5.6 Z" fill="#d3d7d4" />
            <path d="M0 0 L22 5.6 L22.3 4.4 L4.6 0 Z" fill="#f3f4f2" stroke="none" />
            <path d="M4.6 0 L22.3 4.4" stroke="#a7aca8" strokeWidth="0.16" fill="none" />
          </g>
          {/* the knurled nose that grips it */}
          <g clipPath="url(#knife-cone)">
            <rect x="28" y="-2" width="14" height="10" fill="#a9aeaa" />
            <rect x="28" y="-2" width="14" height="2.4" fill="#c6cac6" />
            <rect x="28" y="0.2" width="14" height="1.1" fill="#dfe2de" />
            <rect x="28" y="4.9" width="14" height="3" fill="#868b87" />
            <path d="M30.6 -2V8M32.4 -2V8M34.2 -2V8M36 -2V8M37.8 -2V8M39.6 -2V8" stroke="#6b706c" strokeWidth="0.3" />
          </g>
          <path
            d="M28.6 -0.5 L41 -1.8 V7.4 L28.6 6.1 Z"
            fill="none"
            stroke="#5f6460"
            strokeWidth="0.22"
            strokeLinejoin="round"
          />
          {/* the barrel: aluminium, a knurled grip, engraved */}
          <g clipPath="url(#knife-barrel)">
            <rect x="41" y="-2" width="80" height="10" fill="#bfc3bf" />
            <rect x="41" y="-2" width="80" height="1.6" fill="#d7dad6" />
            <rect x="41" y="-0.4" width="80" height="1.4" fill="#eceeeb" />
            <rect x="41" y="5.2" width="80" height="2.4" fill="#959a96" />
            <rect x="45" y="-2" width="28" height="10" fill="url(#knife-knurl)" />
            <path d="M44.6 -2V8M73.4 -2V8M110.6 -2V8" stroke="#7b807c" strokeWidth="0.26" />
            <text className="knife-engraving" x="79" y="3.85">
              AG—26 · No. 11
            </text>
          </g>
          <path d="M41 -1.8 H114.5 V7.4 H41 Z" fill="none" stroke="#5f6460" strokeWidth="0.22" />
          {/* the collar where the nose screws on */}
          <path d="M41 -2.1 H43.4 V7.7 H41 Z" fill="#8e938f" stroke="#5f6460" strokeWidth="0.22" />
          <path d="M41.1 -0.5 H43.3 V0.8 H41.1 Z" fill="#b9bdb9" />
          {/* and a red cap, the colour of the card's edge */}
          <path d="M114.5 -1.8 H121 C123.6 -1.8 124.4 7.4 121 7.4 H114.5 Z" fill="#c13a26" />
          <path d="M114.6 -0.4 H122.6 V1 H114.6 Z" fill="#dc5a43" />
          <path d="M114.6 5.2 H122.9 V7.3 H114.6 Z" fill="#982b1b" />
          <path
            d="M114.5 -1.8 H121 C123.6 -1.8 124.4 7.4 121 7.4 H114.5 Z"
            fill="none"
            stroke="#5f6460"
            strokeWidth="0.22"
          />
        </svg>
      </div>
    </div>
  );
}

// The layer the cuts are drawn on, the knife, and the length of the cut
// being made (and its angle, along a straight edge), read off as it goes.
export function CuttingLayer() {
  return (
    <>
      <canvas className="mat-cuts" aria-hidden="true" />
      <Knife />
      <span className="cut-readout" aria-hidden="true">
        <span className="cut-readout-value" />
        <span className="cut-readout-angle" />
      </span>
    </>
  );
}
