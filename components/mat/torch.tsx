// What the mat is burnt with: a pocket butane torch, drawn to scale (one
// unit is a millimetre of mat) and held the way the knife is, its handle
// running out along the x axis. The origin is where the flame lands; the
// nozzle stands back from it, since a torch is held off what it's burning.
// lib/torch holds it at the pointer while it's lit and draws the flame.

export function Torch() {
  return (
    <div className="torch" aria-hidden="true">
      <div className="torch-hand">
        <svg className="torch-art" viewBox="-4 -16 166 34" focusable="false">
          <defs>
            <filter id="torch-soft" x="-10%" y="-60%" width="120%" height="220%">
              <feGaussianBlur stdDeviation="1.1" />
            </filter>
            <linearGradient id="torch-brass" x1="0" y1="-2" x2="0" y2="2" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#e7c98a" />
              <stop offset="0.35" stopColor="#c99a4a" />
              <stop offset="1" stopColor="#7d5a26" />
            </linearGradient>
            <linearGradient id="torch-steel" x1="0" y1="-4" x2="0" y2="4" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#e4e7e3" />
              <stop offset="0.4" stopColor="#a6aba7" />
              <stop offset="1" stopColor="#5d625e" />
            </linearGradient>
            <linearGradient id="torch-head" x1="0" y1="-7" x2="0" y2="7" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#4a4d4a" />
              <stop offset="0.3" stopColor="#2a2c2a" />
              <stop offset="1" stopColor="#121312" />
            </linearGradient>
            <linearGradient id="torch-can" x1="0" y1="-11" x2="0" y2="11" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#e2654c" />
              <stop offset="0.22" stopColor="#c13a26" />
              <stop offset="0.75" stopColor="#9a2a1a" />
              <stop offset="1" stopColor="#6c1c10" />
            </linearGradient>
            <clipPath id="torch-can-clip">
              <path d="M68 -10.5 H146 C150.5 -10.5 151.5 10.5 146 10.5 H68 Z" />
            </clipPath>
          </defs>
          {/* held well up off the mat, so its shadow falls a long way off */}
          <g className="torch-shadow" filter="url(#torch-soft)">
            <path d="M17 -1.9 H42 V-3.6 H47 V-6.5 H68 V-10.5 H146 C150.5 -10.5 151.5 10.5 146 10.5 H68 V6.5 H47 V3.6 H42 V1.9 H17 Z" />
          </g>
          {/* the nozzle: a brass tube with air holes, blackened at its mouth */}
          <path d="M17 -1.9 H42 V1.9 H17 Z" fill="url(#torch-brass)" stroke="#5a4320" strokeWidth="0.2" />
          <path d="M17 -1.9 H19.4 V1.9 H17 Z" fill="#3b3428" />
          <path d="M17 -1.9 H19.4 V-1.1 H17 Z" fill="#6b5f4c" />
          <ellipse cx="31.5" cy="-0.15" rx="1.3" ry="0.75" fill="#3d2d14" />
          <ellipse cx="35.2" cy="-0.15" rx="1.3" ry="0.75" fill="#3d2d14" />
          {/* the collar, and the head with its red push-button and gas dial */}
          <path d="M42 -3.6 H47 V3.6 H42 Z" fill="url(#torch-steel)" stroke="#4e534f" strokeWidth="0.2" />
          <path d="M43.2 -3.6 V3.6 M44.5 -3.6 V3.6 M45.8 -3.6 V3.6" stroke="#6e736f" strokeWidth="0.25" />
          <path
            d="M47 -6.5 H66 C67.6 -6.5 68 -5.6 68 -4.6 V4.6 C68 5.6 67.6 6.5 66 6.5 H47 Z"
            fill="url(#torch-head)"
            stroke="#0b0c0b"
            strokeWidth="0.22"
          />
          <path d="M48 -5.6 H66 V-4.4 H48 Z" fill="#5b5f5b" opacity="0.55" />
          <path
            d="M52 -6.5 V-8.8 C52 -9.6 52.6 -10 53.4 -10 H60 C60.8 -10 61.4 -9.6 61.4 -8.8 V-6.5 Z"
            fill="#c13a26"
            stroke="#5e1a10"
            strokeWidth="0.2"
          />
          <path d="M53 -9.3 H60.4 V-8.5 H53 Z" fill="#e0624a" />
          <path d="M57 6.5 H64.5 V8.6 C64.5 9.1 64.1 9.4 63.6 9.4 H57.9 C57.4 9.4 57 9.1 57 8.6 Z" fill="#3a3d3a" />
          <path d="M58.2 6.5 V9.4 M59.6 6.5 V9.4 M61 6.5 V9.4 M62.4 6.5 V9.4 M63.8 6.5 V9.4" stroke="#1c1e1c" strokeWidth="0.3" />
          {/* the canister, the colour of the card's edge, and its label */}
          <g clipPath="url(#torch-can-clip)">
            <rect x="66" y="-11" width="88" height="22" fill="url(#torch-can)" />
            <rect x="66" y="-8.8" width="88" height="2.2" fill="#ee8a72" opacity="0.45" />
            <rect x="96" y="-11" width="36" height="22" fill="#efeae0" />
            <rect x="96" y="-11" width="36" height="5" fill="#ffffff" opacity="0.5" />
            <rect x="96" y="5" width="36" height="6" fill="#000000" opacity="0.14" />
            <path d="M96 -11 V11 M132 -11 V11" stroke="#8f2818" strokeWidth="0.4" />
            <text className="torch-label" x="114" y="0.9" textAnchor="middle">
              AG—26 · BUTANE
            </text>
            <rect x="144" y="-11" width="10" height="22" fill="#1a1b1a" />
            <rect x="144" y="-9" width="10" height="2" fill="#4a4c4a" />
          </g>
          <path
            d="M68 -10.5 H146 C150.5 -10.5 151.5 10.5 146 10.5 H68 Z"
            fill="none"
            stroke="#4a140b"
            strokeWidth="0.25"
          />
        </svg>
      </div>
    </div>
  );
}

// The torch, the flame and its smoke (drawn over everything on the mat),
// and the scorches it leaves on the mat itself (under everything on it).
export function TorchLayer() {
  return (
    <>
      <canvas className="mat-scorch" aria-hidden="true" />
      <Torch />
      <canvas className="mat-fire" aria-hidden="true" />
    </>
  );
}
