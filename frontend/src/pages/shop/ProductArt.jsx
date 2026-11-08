import { useId } from "react";

// Small code-native illustrations; the catalog adapter can later supply approved assets.
export function ProductArt({ art, tone = "mint" }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const paint = `url(#shop-paint-${id})`;
  return (
    <svg
      aria-hidden="true"
      className={`shop-art shop-art--${tone}`}
      viewBox="0 0 240 180"
      fill="none"
    >
      <defs>
        <linearGradient
          id={`shop-paint-${id}`}
          x1="70"
          y1="40"
          x2="160"
          y2="155"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--art-light)" />
          <stop offset=".55" stopColor="var(--art-color)" />
          <stop offset="1" stopColor="var(--art-dark)" />
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="154" rx="59" ry="8" fill="var(--color-ink)" opacity=".07" />
      {art === "beanie" && (
        <g transform="rotate(-7 120 95)">
          <path d="M64 119V96c0-38 20-65 56-65s56 27 56 65v23Z" fill={paint} />
          <path
            d="M87 104c-2-31 3-52 15-64m7 64c-1-34 0-57 5-70m17 70c2-31-1-56-7-70m28 70c1-31-6-52-17-64"
            stroke="var(--art-dark)"
            strokeWidth="3"
            strokeLinecap="round"
            opacity=".2"
          />
          <rect x="58" y="105" width="124" height="38" rx="14" fill="var(--art-color)" />
          <path
            d="M68 115h104"
            stroke="var(--art-light)"
            strokeWidth="3"
            strokeLinecap="round"
            opacity=".8"
          />
          <path
            d="M73 121v12m13-12v12m13-12v12m13-12v12m13-12v12m13-12v12m13-12v12m13-12v12"
            stroke="var(--art-dark)"
            strokeWidth="3"
            strokeLinecap="round"
            opacity=".28"
          />
          <path
            d="M73 141h94"
            stroke="var(--art-dark)"
            strokeWidth="3"
            strokeLinecap="round"
            opacity=".18"
          />
        </g>
      )}
      {art === "bucket" && (
        <g transform="rotate(8 120 95)">
          <path d="M79 53c17-12 65-12 82 0l14 63H65Z" fill={paint} />
          <ellipse cx="120" cy="54" rx="41" ry="11" fill="var(--art-color)" />
          <path d="M68 106c27 13 77 13 104 0l26 29c-29 23-128 23-156 0Z" fill={paint} />
          <path
            d="M51 135c28 17 110 17 138 0"
            stroke="var(--art-dark)"
            strokeWidth="3"
            opacity=".4"
          />
          <path
            d="M73 105c25 10 69 10 94 0"
            stroke="var(--art-dark)"
            strokeWidth="2"
            strokeDasharray="3 4"
            opacity=".45"
          />
          <path
            d="M88 67c-3 10-5 18-6 26"
            stroke="var(--art-light)"
            strokeWidth="5"
            strokeLinecap="round"
            opacity=".8"
          />
        </g>
      )}
      {art === "bearFrame" && (
        <g transform="rotate(-5 120 95)">
          <circle cx="76" cy="47" r="23" fill="var(--art-dark)" />
          <circle cx="164" cy="47" r="23" fill="var(--art-dark)" />
          <circle cx="76" cy="46" r="20" fill={paint} />
          <circle cx="164" cy="46" r="20" fill={paint} />
          <circle cx="76" cy="46" r="11" fill="var(--art-light)" />
          <circle cx="164" cy="46" r="11" fill="var(--art-light)" />
          <rect x="56" y="42" width="128" height="111" rx="39" fill="var(--art-dark)" />
          <rect x="56" y="39" width="128" height="111" rx="39" fill={paint} />
          <rect x="74" y="53" width="92" height="67" rx="26" fill="var(--color-surface)" />
          <circle cx="120" cy="77" r="13" fill="var(--color-brand-soft)" />
          <path d="M94 110c0-24 52-24 52 0" fill="var(--color-brand-soft)" />
          <ellipse cx="120" cy="134" rx="19" ry="12" fill="var(--art-light)" />
          <path
            d="M80 126q6 6 12 0m56 0q6 6 12 0"
            stroke="var(--art-dark)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <ellipse cx="81" cy="136" rx="7" ry="4" fill="var(--color-cohort-2)" opacity=".4" />
          <ellipse cx="159" cy="136" rx="7" ry="4" fill="var(--color-cohort-2)" opacity=".4" />
          <path d="M115 129q5-3 10 0l-5 5Z" fill="var(--art-dark)" />
          <path
            d="M120 133v5m-6-1q6 6 12 0"
            stroke="var(--art-dark)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      )}
      {art === "beret" && (
        <g transform="rotate(-12 120 95)">
          <path
            d="M57 109c0-29 26-57 67-57 35 0 62 22 62 46 0 23-36 38-75 38-32 0-54-10-54-27Z"
            fill={paint}
          />
          <path d="M76 121c27 12 66 11 91-4l-4 13c-22 15-63 18-86 2Z" fill="var(--art-dark)" />
          <path d="m125 53 2-12" stroke="var(--art-dark)" strokeWidth="9" strokeLinecap="round" />
          <path
            d="M75 98c6-16 21-25 40-28"
            stroke="var(--art-light)"
            strokeWidth="6"
            strokeLinecap="round"
            opacity=".65"
          />
        </g>
      )}
      {art === "cap" && (
        <g transform="rotate(-10 120 95)">
          <path d="M66 112V99c0-35 21-54 52-54 31 0 50 23 50 57v14Z" fill={paint} />
          <path
            d="M67 111c34-12 80-8 116 12 14 8 15 17 0 19-33 4-58-13-82-16l-34-3Z"
            fill="var(--art-dark)"
          />
          <path
            d="M119 48c-13 15-17 34-17 53"
            stroke="var(--art-light)"
            strokeWidth="3"
            opacity=".65"
          />
          <circle cx="118" cy="46" r="5" fill="var(--art-dark)" />
        </g>
      )}
      {art === "bag" && (
        <g transform="rotate(-10 120 95)">
          <path d="M84 94V69c0-30 66-31 66 0v27" stroke="var(--art-dark)" strokeWidth="14" />
          <rect x="62" y="82" width="115" height="66" rx="20" fill={paint} />
          <path
            d="M64 96c25 30 82 31 111 0"
            stroke="var(--art-dark)"
            strokeWidth="3"
            opacity=".5"
          />
          <rect x="110" y="108" width="19" height="18" rx="5" fill="var(--color-warning-soft)" />
        </g>
      )}
      {art === "coffee" && (
        <g transform="rotate(8 120 95)">
          <path
            d="m88 60 10 86c1 9 45 10 46 0l10-86"
            fill="var(--color-warning-soft)"
            stroke="var(--color-warning)"
            strokeOpacity=".25"
            strokeWidth="2"
          />
          <path d="m94 95 5 49c1 6 43 6 44 0l6-49Z" fill="var(--color-warning)" opacity=".75" />
          <rect
            x="80"
            y="55"
            width="82"
            height="13"
            rx="6"
            fill="var(--color-surface)"
            stroke="var(--color-line-strong)"
            strokeWidth="2"
          />
          <path
            d="m126 88 8-55h22"
            stroke="var(--color-brand-ink)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="104"
            y="83"
            width="18"
            height="15"
            rx="4"
            fill="var(--color-surface)"
            opacity=".65"
            transform="rotate(12 104 83)"
          />
          <rect
            x="124"
            y="98"
            width="17"
            height="16"
            rx="4"
            fill="var(--color-surface)"
            opacity=".55"
            transform="rotate(-12 124 98)"
          />
        </g>
      )}
      {art === "book" && (
        <g transform="rotate(-14 120 95)">
          <path d="M77 51h84v99H80c-10 0-14-8-14-15V65c0-8 4-14 11-14Z" fill="var(--art-dark)" />
          <path d="M78 127h83v17H78c-10 0-10-17 0-17Z" fill="var(--color-surface)" />
          <rect x="77" y="43" width="89" height="87" rx="5" fill={paint} />
          <path
            d="M96 67h43M96 78h29"
            stroke="var(--color-surface)"
            strokeWidth="5"
            strokeLinecap="round"
            opacity=".8"
          />
          <path d="M136 103v40l8-6 8 6v-40" fill="var(--color-brand)" />
        </g>
      )}
      {art === "glasses" && (
        <g transform="rotate(-12 120 95)">
          <path
            d="m63 92-13-28h21m103 28 13-28h-20"
            stroke="var(--color-ink)"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <rect x="54" y="84" width="54" height="40" rx="15" fill="var(--color-ink)" />
          <rect x="132" y="84" width="54" height="40" rx="15" fill="var(--color-ink)" />
          <path d="M105 96c10-8 20-8 30 0" stroke="var(--color-ink)" strokeWidth="7" />
          <path
            d="m66 92 19 21m60-21 19 21"
            stroke="var(--color-surface)"
            strokeWidth="5"
            opacity=".25"
          />
        </g>
      )}
      {art === "frame" && (
        <g>
          <rect
            x="70"
            y="35"
            width="100"
            height="112"
            rx="36"
            fill="var(--color-surface)"
            stroke={paint}
            strokeWidth="13"
          />
          <circle cx="120" cy="77" r="19" fill="var(--art-light)" />
          <path d="M88 126c1-30 63-30 64 0" fill="var(--art-light)" />
          <path d="m169 28 6 13 14 5-14 6-6 14-5-14-14-6 14-5Z" fill="var(--color-cohort-5)" />
          <path d="m65 116 4 9 10 4-10 4-4 10-4-10-10-4 10-4Z" fill="var(--art-color)" />
        </g>
      )}
      {art === "title" && (
        <g transform="rotate(-8 120 95)">
          <path d="m93 103-11 42 24-9 15 16 10-43" fill="var(--color-brand)" />
          <path d="m132 105 13 43 13-18 25 6-16-43" fill="var(--color-brand-strong)" />
          <circle
            cx="122"
            cy="80"
            r="44"
            fill={paint}
            stroke="var(--color-cohort-5)"
            strokeWidth="5"
          />
          <path
            d="m122 55 7 15 17 2-13 12 4 17-15-8-15 8 3-17-12-12 17-2Z"
            fill="var(--color-cohort-5)"
          />
        </g>
      )}
    </svg>
  );
}
