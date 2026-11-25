export interface MotifProps {
  className?: string;
}

export interface BrandCrestIconProps extends MotifProps {
  tone?: "light" | "dark" | "ivory" | "forest" | "responsive";
}

export function BrandCrestIcon({
  tone = "responsive",
  className = "",
}: BrandCrestIconProps) {
  const capFillClass =
    tone === "light" || tone === "ivory"
      ? "fill-warm-ivory"
      : tone === "dark" || tone === "forest"
        ? "fill-forest-green"
        : "fill-forest-green md:fill-warm-ivory";

  const capStrokeClass =
    tone === "light" || tone === "ivory"
      ? "stroke-warm-ivory"
      : tone === "dark" || tone === "forest"
        ? "stroke-forest-green"
        : "stroke-forest-green md:stroke-warm-ivory";

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 48 30"
      className={className}
    >
      {/* Left laurel branch */}
      <path
        d="M19 25 C12 24, 7 19, 6 11"
        fill="none"
        stroke="#C4A46C"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <ellipse cx="14" cy="24" rx="2.7" ry="1.35" transform="rotate(-18 14 24)" fill="#C4A46C" />
      <ellipse cx="10" cy="21" rx="2.7" ry="1.35" transform="rotate(-40 10 21)" fill="#C4A46C" />
      <ellipse cx="7.5" cy="16.5" rx="2.5" ry="1.25" transform="rotate(-65 7.5 16.5)" fill="#C4A46C" />
      <ellipse cx="6.5" cy="11.5" rx="2.3" ry="1.15" transform="rotate(-82 6.5 11.5)" fill="#C4A46C" />

      {/* Right laurel branch */}
      <path
        d="M29 25 C36 24, 41 19, 42 11"
        fill="none"
        stroke="#C4A46C"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <ellipse cx="34" cy="24" rx="2.7" ry="1.35" transform="rotate(18 34 24)" fill="#C4A46C" />
      <ellipse cx="38" cy="21" rx="2.7" ry="1.35" transform="rotate(40 38 21)" fill="#C4A46C" />
      <ellipse cx="40.5" cy="16.5" rx="2.5" ry="1.25" transform="rotate(65 40.5 16.5)" fill="#C4A46C" />
      <ellipse cx="41.5" cy="11.5" rx="2.3" ry="1.15" transform="rotate(82 41.5 11.5)" fill="#C4A46C" />

      {/* Center tie */}
      <circle cx="24" cy="25.5" r="1.4" fill="#C4A46C" />

      {/* Graduation mortarboard */}
      <polygon
        points="24,4 37,10.5 24,17 11,10.5"
        className={capFillClass}
        stroke="#C4A46C"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 13.5 V18.5 C19 20.6, 29 20.6, 31.5 18.5 V13.5"
        className={`${capFillClass} ${capStrokeClass}`}
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 18 C19.5 19.6, 28.5 19.6, 31.5 18"
        fill="none"
        stroke="#C4A46C"
        strokeWidth="0.9"
      />
      {/* Tassel */}
      <circle cx="24" cy="10.2" r="1.1" fill="#C4A46C" />
      <path
        d="M24 10.2 L33.5 12.2 L33.5 18.8"
        fill="none"
        stroke="#C4A46C"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M32.3 18.8 L34.7 18.8 L34.2 21.6 L32.8 21.6 Z" fill="#C4A46C" />
    </svg>
  );
}

export const NavbarCrestIcon = BrandCrestIcon;

export function HeroCrestEmblem({ className = "" }: MotifProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 140 74"
      className={className}
    >
      {/* Left laurel wreath */}
      <path
        d="M64 62 C41 61, 24 47, 21 21"
        fill="none"
        stroke="#C4A46C"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <ellipse cx="52" cy="60.5" rx="5.5" ry="2.6" transform="rotate(-12 52 60.5)" fill="#C4A46C" />
      <ellipse cx="42" cy="56.5" rx="5.5" ry="2.6" transform="rotate(-24 42 56.5)" fill="#C4A46C" />
      <ellipse cx="33" cy="50" rx="5.4" ry="2.5" transform="rotate(-40 33 50)" fill="#C4A46C" />
      <ellipse cx="26.5" cy="41" rx="5.2" ry="2.4" transform="rotate(-58 26.5 41)" fill="#C4A46C" />
      <ellipse cx="22.5" cy="31" rx="4.9" ry="2.3" transform="rotate(-74 22.5 31)" fill="#C4A46C" />
      <ellipse cx="21" cy="21" rx="4.4" ry="2.1" transform="rotate(-86 21 21)" fill="#77774D" opacity="0.88" />
      <ellipse cx="47" cy="54" rx="4.4" ry="2" transform="rotate(14 47 54)" fill="#77774D" opacity="0.82" />
      <ellipse cx="37" cy="46.5" rx="4.3" ry="2" transform="rotate(2 37 46.5)" fill="#77774D" opacity="0.82" />
      <ellipse cx="30" cy="36.5" rx="4.1" ry="1.9" transform="rotate(-18 30 36.5)" fill="#77774D" opacity="0.82" />

      {/* Right laurel wreath */}
      <path
        d="M76 62 C99 61, 116 47, 119 21"
        fill="none"
        stroke="#C4A46C"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <ellipse cx="88" cy="60.5" rx="5.5" ry="2.6" transform="rotate(12 88 60.5)" fill="#C4A46C" />
      <ellipse cx="98" cy="56.5" rx="5.5" ry="2.6" transform="rotate(24 98 56.5)" fill="#C4A46C" />
      <ellipse cx="107" cy="50" rx="5.4" ry="2.5" transform="rotate(40 107 50)" fill="#C4A46C" />
      <ellipse cx="113.5" cy="41" rx="5.2" ry="2.4" transform="rotate(58 113.5 41)" fill="#C4A46C" />
      <ellipse cx="117.5" cy="31" rx="4.9" ry="2.3" transform="rotate(74 117.5 31)" fill="#C4A46C" />
      <ellipse cx="119" cy="21" rx="4.4" ry="2.1" transform="rotate(86 119 21)" fill="#77774D" opacity="0.88" />
      <ellipse cx="93" cy="54" rx="4.4" ry="2" transform="rotate(-14 93 54)" fill="#77774D" opacity="0.82" />
      <ellipse cx="103" cy="46.5" rx="4.3" ry="2" transform="rotate(-2 103 46.5)" fill="#77774D" opacity="0.82" />
      <ellipse cx="110" cy="36.5" rx="4.1" ry="1.9" transform="rotate(18 110 36.5)" fill="#77774D" opacity="0.82" />

      {/* Center laurel tie */}
      <path d="M64 62 Q70 66 76 62" fill="none" stroke="#C4A46C" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="70" cy="62.5" r="2.6" fill="#C4A46C" />

      {/* 3D Olive-Forest Graduation Mortarboard */}
      <path
        d="M50 28 V42 C57 47.5, 83 47.5, 90 42 V28 Z"
        fill="#193C2F"
        stroke="#C4A46C"
        strokeWidth="1"
      />
      <path
        d="M50 40 C58 44.8, 82 44.8, 90 40"
        fill="none"
        stroke="#C4A46C"
        strokeWidth="1.15"
      />
      <polygon
        points="70,8 106,23.5 70,38.5 34,23.5"
        fill="#274737"
        stroke="#C4A46C"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <polygon
        points="70,11 100,23.5 70,35.5 40,23.5"
        fill="#4E6242"
        opacity="0.72"
      />
      {/* Cap button and draped tassel */}
      <ellipse cx="70" cy="23" rx="2.6" ry="1.7" fill="#C4A46C" />
      <path
        d="M70 23 L95 27.5 L96.5 46"
        fill="none"
        stroke="#C4A46C"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M94.2 45.5 L98.8 45.5 L98.2 53.5 L94.8 53.5 Z"
        fill="#C4A46C"
      />
    </svg>
  );
}

export function GraduatesCenterEmblem({ className = "" }: MotifProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 160 112"
      className={className}
    >
      {/* Curved gold laurel wreath underneath */}
      <path
        d="M72 95 C46 92, 27 74, 24 44"
        fill="none"
        stroke="#C4A46C"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M88 95 C114 92, 133 74, 136 44"
        fill="none"
        stroke="#C4A46C"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <ellipse cx="58" cy="92" rx="6" ry="2.7" transform="rotate(-14 58 92)" fill="#C4A46C" />
      <ellipse cx="46" cy="86" rx="5.8" ry="2.7" transform="rotate(-28 46 86)" fill="#C4A46C" />
      <ellipse cx="36" cy="76" rx="5.5" ry="2.6" transform="rotate(-44 36 76)" fill="#C4A46C" />
      <ellipse cx="29" cy="63" rx="5.2" ry="2.5" transform="rotate(-64 29 63)" fill="#C4A46C" />
      <ellipse cx="25.5" cy="49" rx="4.8" ry="2.3" transform="rotate(-80 25.5 49)" fill="#77774D" opacity="0.88" />
      <ellipse cx="102" cy="92" rx="6" ry="2.7" transform="rotate(14 102 92)" fill="#C4A46C" />
      <ellipse cx="114" cy="86" rx="5.8" ry="2.7" transform="rotate(28 114 86)" fill="#C4A46C" />
      <ellipse cx="124" cy="76" rx="5.5" ry="2.6" transform="rotate(44 124 76)" fill="#C4A46C" />
      <ellipse cx="131" cy="63" rx="5.2" ry="2.5" transform="rotate(64 131 63)" fill="#C4A46C" />
      <ellipse cx="134.5" cy="49" rx="4.8" ry="2.3" transform="rotate(80 134.5 49)" fill="#77774D" opacity="0.88" />
      <circle cx="80" cy="95.5" r="2.6" fill="#C4A46C" />

      {/* Rolled parchment diploma scroll */}
      <rect
        x="43"
        y="59"
        width="74"
        height="19"
        rx="8"
        fill="#F7F3EA"
        stroke="#C4A46C"
        strokeWidth="1.4"
      />
      <ellipse cx="48" cy="68.5" rx="4.5" ry="9.5" fill="#E8DED0" stroke="#C4A46C" strokeWidth="1.2" />
      <ellipse cx="112" cy="68.5" rx="4.5" ry="9.5" fill="#E8DED0" stroke="#C4A46C" strokeWidth="1.2" />
      {/* Gold satin ribbon & bow on diploma */}
      <rect x="75.5" y="58.5" width="9" height="20" rx="1.5" fill="#C4A46C" />
      <path d="M80 76 L72 87 L77 85.5 L80 78 Z" fill="#C4A46C" />
      <path d="M80 76 L88 87 L83 85.5 L80 78 Z" fill="#C4A46C" />

      {/* Graduation mortarboard atop scroll */}
      <path
        d="M58 34 V49 C65 55, 95 55, 102 49 V34 Z"
        fill="#193C2F"
        stroke="#C4A46C"
        strokeWidth="1.1"
      />
      <polygon
        points="80,14 118,29.5 80,45 42,29.5"
        fill="#274737"
        stroke="#C4A46C"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <polygon
        points="80,17 111,29.5 80,41.5 49,29.5"
        fill="#4E6242"
        opacity="0.72"
      />
      <ellipse cx="80" cy="29" rx="2.6" ry="1.7" fill="#C4A46C" />
      <path
        d="M80 29 L106 34 L107.5 53"
        fill="none"
        stroke="#C4A46C"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M105 52.5 L110 52.5 L109.2 61 L105.8 61 Z" fill="#C4A46C" />
    </svg>
  );
}

export function CalendarGoldIcon({ className = "" }: MotifProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#C4A46C"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
      <line x1="8" y1="2.5" x2="8" y2="6.5" />
      <line x1="16" y1="2.5" x2="16" y2="6.5" />
      <line x1="3" y1="9.5" x2="21" y2="9.5" />
      <line x1="8" y1="13.5" x2="8.01" y2="13.5" />
      <line x1="12" y1="13.5" x2="12.01" y2="13.5" />
      <line x1="16" y1="13.5" x2="16.01" y2="13.5" />
      <line x1="8" y1="17" x2="8.01" y2="17" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export const CalendarIcon = CalendarGoldIcon;

export function ClockGoldIcon({ className = "" }: MotifProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#C4A46C"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

export const ClockIcon = ClockGoldIcon;

export function MapPinGoldIcon({ className = "" }: MotifProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#C4A46C"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.25" />
    </svg>
  );
}

export const MapPinIcon = MapPinGoldIcon;

export interface OliveSprigAccentProps extends MotifProps {
  side?: "left" | "right";
  flip?: boolean;
}

export function OliveSprigAccent({
  side = "left",
  flip,
  className = "",
}: OliveSprigAccentProps) {
  const shouldFlip = flip ?? side === "right";
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 72 48"
      className={className}
    >
      <g transform={shouldFlip ? "translate(72,0) scale(-1,1)" : undefined}>
        <path
          d="M6 42 C20 33, 38 23, 62 12"
          fill="none"
          stroke="#77774D"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <ellipse cx="18" cy="31" rx="7" ry="3" transform="rotate(-38 18 31)" fill="#A5B29A" />
        <ellipse cx="27" cy="34" rx="7" ry="3" transform="rotate(14 27 34)" fill="#77774D" opacity="0.85" />
        <ellipse cx="34" cy="22" rx="7.2" ry="3" transform="rotate(-32 34 22)" fill="#77774D" opacity="0.9" />
        <ellipse cx="44" cy="26" rx="6.8" ry="2.9" transform="rotate(16 44 26)" fill="#A5B29A" />
        <ellipse cx="50" cy="14" rx="6.8" ry="2.8" transform="rotate(-26 50 14)" fill="#A5B29A" />
        <ellipse cx="62" cy="11" rx="6.5" ry="2.6" transform="rotate(-12 62 11)" fill="#77774D" />
      </g>
    </svg>
  );
}

export function ClosingWaveTrim({ className = "" }: MotifProps) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 96"
      preserveAspectRatio="none"
      className={className}
    >
      <path
        d="M0 32 C260 4, 480 68, 760 46 C1030 25, 1240 6, 1440 24 L1440 96 L0 96 Z"
        fill="#193C2F"
      />
      <path
        d="M0 32 C260 4, 480 68, 760 46 C1030 25, 1240 6, 1440 24"
        fill="none"
        stroke="#C4A46C"
        strokeWidth="4"
      />
      <path
        d="M0 34 C260 6, 480 70, 760 48 C1030 27, 1240 8, 1440 26"
        fill="none"
        stroke="#DFC793"
        strokeWidth="1.5"
        opacity="0.85"
      />
    </svg>
  );
}
