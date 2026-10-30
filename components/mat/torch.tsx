// One SVG unit is one millimetre of mat. The flame lands at the origin;
// the heat-blued nozzle is held 25 mm back from it.
export function Torch() {
  return (
    <div className="torch" aria-hidden="true">
      <div className="torch-hand">
        <svg className="torch-art" viewBox="-4 -16 166 34" focusable="false">
          <defs>
            <filter id="torch-soft" x="-15%" y="-80%" width="130%" height="260%">
              <feGaussianBlur stdDeviation="1.4" />
            </filter>
            <linearGradient id="torch-titanium" x1="0" y1="-4" x2="0" y2="4" gradientUnits="userSpaceOnUse">
              <stop stopColor="#232a32" />
              <stop offset=".22" stopColor="#a6b5c1" />
              <stop offset=".4" stopColor="#e4edf0" />
              <stop offset=".52" stopColor="#6e7c85" />
              <stop offset="1" stopColor="#1c242e" />
            </linearGradient>
            <linearGradient id="torch-temper">
              <stop stopColor="#142c51" />
              <stop offset=".2" stopColor="#3e6da3" />
              <stop offset=".43" stopColor="#61547d" />
              <stop offset=".66" stopColor="#a38a67" />
              <stop offset="1" stopColor="#bac4c5" />
            </linearGradient>
            <linearGradient id="torch-head" x1="0" y1="-8" x2="0" y2="8" gradientUnits="userSpaceOnUse">
              <stop stopColor="#50545a" />
              <stop offset=".25" stopColor="#292d31" />
              <stop offset=".65" stopColor="#171b20" />
              <stop offset="1" stopColor="#090c10" />
            </linearGradient>
            <linearGradient id="torch-cell" x1="0" y1="-11" x2="0" y2="11" gradientUnits="userSpaceOnUse">
              <stop stopColor="#c78b32" />
              <stop offset=".15" stopColor="#ffe0a1" />
              <stop offset=".32" stopColor="#eab456" />
              <stop offset=".7" stopColor="#d28a28" />
              <stop offset="1" stopColor="#79501f" />
            </linearGradient>
            <pattern id="torch-knurl" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
              <path d="M0 0 V1.2" stroke="#000" strokeWidth=".35" opacity=".45" />
              <path d="M.4 0 V1.2" stroke="#d0d9de" strokeWidth=".12" opacity=".2" />
            </pattern>
            <pattern id="torch-hazard" width="3.6" height="4" patternUnits="userSpaceOnUse" patternTransform="skewX(-30)">
              <rect width="1.8" height="4" fill="#202123" />
            </pattern>
            <clipPath id="torch-cell-clip">
              <rect x="77" y="-10.5" width="73" height="21" rx="3" />
            </clipPath>
          </defs>
          <g className="torch-shadow" filter="url(#torch-soft)">
            <path d="M25 -3 H47 V-5 H55 V-7 H77 V-10.5 H146 Q153 -10.5 153 0 Q153 10.5 146 10.5 H77 V7 H55 V5 H47 V3 H25Z" />
          </g>
          {/* Machined, heat-tempered barrel and black ceramic mouth. */}
          <path d="M25 -3.1 H46 L49 -2.2 V2.2 L46 3.1 H25Z" fill="url(#torch-titanium)" stroke="#202830" strokeWidth=".25" />
          <path d="M25 -3.1 H43 V3.1 H25Z" fill="url(#torch-temper)" opacity=".8" />
          <path d="M25 -3.1 H27 V3.1 H25Z" fill="#111c2b" />
          <path className="torch-mouth" d="M25 -2.5 V2.5" stroke="#87eeff" strokeWidth=".5" />
          <path d="M29 -2.4 H43" stroke="#d7e7f1" strokeWidth=".35" opacity=".6" />
          {[33, 36.2, 39.4].map((x) => <rect key={x} x={x} y="-.8" width="1.5" height="1.6" rx=".65" fill="#16222e" stroke="#a3afb6" strokeWidth=".15" />)}
          <rect x="46" y="-4.5" width="9" height="9" rx=".6" fill="url(#torch-titanium)" stroke="#1c242c" strokeWidth=".25" />
          {[47, 49, 51, 53].map((x) => <path key={x} d={`M${x} -4.4 V4.4`} stroke="#1b242c" strokeWidth=".65" />)}
          {/* Knurled regulator, ignition paddle, and a tiny live indicator. */}
          <path d="M55 -7 H75 Q79 -7 79 -3 V3 Q79 7 75 7 H55Z" fill="url(#torch-head)" stroke="#080b0e" strokeWidth=".3" />
          <rect x="56" y="-6" width="12" height="12" fill="url(#torch-knurl)" />
          <path className="torch-trigger" d="M61 -7 V-10 Q61 -11 62 -11 H71 Q72 -11 72 -10 V-7" fill="#e9a241" stroke="#77501e" strokeWidth=".25" />
          <path d="M62 -10.3 H71" stroke="#ffe6b0" strokeWidth=".35" />
          <circle cx="72.5" cy="0" r="1.5" fill="#070d13" stroke="#4b565e" strokeWidth=".25" />
          <circle className="torch-indicator" cx="72.5" cy="0" r=".8" fill="#8cefff" />
          <path d="M64 7 H73 V9 H64Z" fill="#343b41" stroke="#0c1116" strokeWidth=".25" />
          <path d="M65 7 V9 M67 7 V9 M69 7 V9 M71 7 V9" stroke="#0b1015" strokeWidth=".45" />
          {/* Amber anodised fuel cell, with an inset instrument label. */}
          <g clipPath="url(#torch-cell-clip)">
            <rect x="77" y="-10.5" width="73" height="21" fill="url(#torch-cell)" />
            <path d="M79 -8.3 H148" stroke="#fff0c7" strokeWidth=".5" opacity=".65" />
            <rect x="79" y="-10.5" width="4" height="21" fill="url(#torch-head)" />
            <rect x="88" y="-10.5" width="3" height="21" fill="url(#torch-knurl)" opacity=".65" />
            <rect x="95" y="-7.7" width="40" height="15.4" rx=".7" fill="#172025" stroke="#f2cc81" strokeWidth=".25" />
            <text className="torch-label torch-label-main" x="98" y="-2.7">AG / JET—01</text>
            <text className="torch-label" x="98" y=".6">PRECISION TORCH</text>
            <path d="M98 2.3 H132" stroke="#697166" strokeWidth=".2" />
            <text className="torch-label torch-label-micro" x="98" y="5.3">BUTANE · 1,300°C · 26</text>
            <rect x="138" y="-10.5" width="4" height="21" fill="url(#torch-hazard)" />
            <rect x="145" y="-10.5" width="7" height="21" fill="url(#torch-head)" />
            <path d="M146 -8 V8 M148 -8 V8" stroke="#697075" strokeWidth=".3" />
          </g>
          <rect x="77" y="-10.5" width="73" height="21" rx="3" fill="none" stroke="#392e1b" strokeWidth=".3" />
        </svg>
      </div>
    </div>
  );
}

export function TorchLayer() {
  return (
    <>
      <canvas className="mat-scorch" aria-hidden="true" />
      <Torch />
      <canvas className="mat-fire" aria-hidden="true" />
      <div className="torch-guide" aria-hidden="true">
        <span className="torch-guide-light" />
        <span className="torch-guide-id">JET—01</span>
        <span className="torch-guide-idle">Hold to ignite</span>
        <span className="torch-guide-live">Burning</span>
        <span className="torch-guide-boost">Overdrive</span>
        <span className="torch-guide-key"><kbd>⇧</kbd> overdrive</span>
        <span className="torch-guide-touch">Hold &amp; drag to burn</span>
      </div>
    </>
  );
}
