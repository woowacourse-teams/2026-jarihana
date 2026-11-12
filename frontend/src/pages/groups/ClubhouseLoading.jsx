import "./clubhouse-loading.css";

function BuilderFace({ children }) {
  return <g>
    <circle cx="-18" cy="2" r="4.5" fill="#f6be99" />
    <circle cx="18" cy="2" r="4.5" fill="#f6be99" />
    <rect x="-18" y="-19" width="36" height="37" rx="16" fill="#ffdab8" />
    {children}
    <path d="M-7 0v2m14-2v2" fill="none" stroke="#382840" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M-3 8q3 4 6 0" fill="none" stroke="#9f584d" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M-13 6h3m20 0h3" stroke="#ef9c8d" strokeWidth="2" strokeLinecap="round" />
  </g>;
}

export function ClubhouseLoading() {
  return <div className="clubhouse-loading" role="status">
    <svg className="clubhouse-loading__art" viewBox="0 0 420 212" aria-hidden="true" focusable="false">
      <path d="M32 173 270 156 392 181 153 203Z" fill="#604875" opacity=".14" />
      <path d="M30 165 270 149 390 175v8l-238 20-122-30Z" fill="#9f7d8e" />
      <path d="M30 165 270 149 390 175 152 195Z" fill="#e7c99f" />
      <path d="m70 161 123 30m-68-34 126 29m-67-33 125 27m-74-31 124 28" fill="none" stroke="#cda985" strokeWidth="1.5" />
      <path d="m75 179 236-17m-182 29 235-18" fill="none" stroke="#cda985" strokeWidth="1.5" />

      <g strokeLinejoin="round">
        <path d="M136 83 221 62l74 23v71l-83 18-76-18Z" fill="#c69267" stroke="#77566a" strokeWidth="2.5" />
        <path d="M136 83 221 62l74 23-83 20Z" fill="#f5d39c" />
        <path d="M212 105 295 85v71l-83 18Z" fill="#f1bd7e" />
        <path d="m220 119 73-16m-73 31 73-16m-73 31 73-16m-73 31 73-16" stroke="#cb926e" strokeWidth="1.7" />
        <path d="m235 117 38-9v30l-38 9Z" fill="#ffe7aa" stroke="#79566c" strokeWidth="4" />
        <path d="m254 113 0 29m-17-11 35-8" stroke="#79566c" strokeWidth="2.5" />
        <path d="m137 82 33-41 84 17-42 47Z" fill="#d6a1ae" stroke="#77566a" strokeWidth="2.5" />
        <path d="m212 105 42-47 47 24-89 23Z" fill="#f6d5a1" stroke="#77566a" strokeWidth="2.5" />
        <path d="m135 82 35-41 87 16m-66-12-35 43m58-38-37 44m61-39-39 45m-63-17 76 22 89-22" fill="none" stroke="#77566a" strokeWidth="3.5" strokeLinecap="round" />
        <path d="m182 99 0 66m-46-81 0 71m76-50 0 69m83-89 0 71" stroke="#77566a" strokeWidth="5" />
        <path d="m144 143 28 7v15l-28-7Z" fill="#865f72" />
      </g>

      <g transform="translate(104 116)">
        <ellipse cy="54" rx="32" ry="7" fill="#9d775e" opacity=".28" />
        <path d="M-14 44v8m24-8v8" stroke="#434052" strokeWidth="9" strokeLinecap="round" />
        <path d="M-18 21q17-12 34 0l4 24q-20 8-40 0Z" fill="#35a7a0" stroke="#347774" strokeWidth="1.5" />
        <path d="m-10 21 2 15m15-15-2 15" stroke="#a4e4ce" strokeWidth="3" strokeLinecap="round" />
        <BuilderFace>
          <path d="M-18 0q-6-6-1-15 8-14 23-9 15 3 15 20-9-4-13-10-11 11-24 14Z" fill="#483348" />
          <path d="M-23-12q1-15 21-16 17 0 22 15l5 1q2 5-4 6l-42-2q-6-1-2-4Z" fill="#f2b543" stroke="#9e663c" strokeWidth="1.5" />
          <path d="M-8-25q8-4 14 0l3 13H-9Z" fill="#ffda72" />
        </BuilderFace>
        <g className="clubhouse-loading__hammer">
          <path d="m13 27 15-7 6-12" fill="none" stroke="#35a7a0" strokeWidth="9" strokeLinecap="round" />
          <path d="m35 7 8-22" stroke="#986042" strokeWidth="4.5" strokeLinecap="round" />
          <path d="m34-18 16 5-2 7-16-5Z" fill="#7b6489" stroke="#51425d" strokeWidth="1.5" />
          <circle cx="35" cy="7" r="5" fill="#ffdab8" />
        </g>
        <path className="clubhouse-loading__spark" d="m43 2 6-5m0 13 9 0m-13 8 5 4" fill="none" stroke="#be713b" strokeWidth="2.5" strokeLinecap="round" />
      </g>

      <g transform="translate(189 142)">
        <ellipse cy="44" rx="33" ry="6" fill="#9d775e" opacity=".28" />
        <g className="clubhouse-loading__carrier">
          <path d="m-12 33-3 9m26-9 4 9" stroke="#514761" strokeWidth="9" strokeLinecap="round" />
          <path d="M-16 17q16-8 32 0l3 19h-38Z" fill="#e18a83" />
          <BuilderFace>
            <path d="M-18 1q-6-7-2-17 7-13 24-9 16 4 16 21-9-3-16-10-9 8-22 15Z" fill="#654353" />
            <circle cx="11" cy="-25" r="8" fill="#654353" />
            <path d="M-19-9q17-11 38-4" fill="none" stroke="#bd697d" strokeWidth="4" />
          </BuilderFace>
          <path d="m-29 20 49-7 11 5-50 8Z" fill="#f7ce91" stroke="#936b59" strokeWidth="1.5" />
          <path d="m-29 20 10 6 50-8v9l-50 8-10-6Z" fill="#cd9467" stroke="#936b59" strokeWidth="1.5" />
          <path d="m-13 29 9-1m19-3 8-1" stroke="#f0b988" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="-17" cy="27" r="4" fill="#ffdab8" /><circle cx="17" cy="22" r="4" fill="#ffdab8" />
        </g>
      </g>

      <g transform="translate(326 120)">
        <ellipse cy="53" rx="33" ry="7" fill="#9d775e" opacity=".28" />
        <path d="M-12 43v9m22-9v9" stroke="#41405b" strokeWidth="9" strokeLinecap="round" />
        <path d="M-17 20q16-10 33 0l4 24q-20 6-40 0Z" fill="#7773a9" />
        <g className="clubhouse-loading__planner">
          <BuilderFace>
            <path d="M-18 0q-5-4-3-13 2-7 8-9 4-7 13-4 12-3 17 7 5 7 1 16l-5-10Q7-9 1-14-7-8-14-12Z" fill="#493745" />
            <path d="M-16-2h12v8h-12zm20 0h12v8H4zM-4 1h8" fill="none" stroke="#5e4e6b" strokeWidth="1.7" strokeLinejoin="round" />
          </BuilderFace>
        </g>
        <path d="m-25 22 22 5 25-6-4 17-20 6-19-6Z" fill="#d2e6f2" stroke="#55738c" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="m-3 27 1 17m-15-15 9 3m-8 1 6 2m12 2 7-7 6 3" fill="none" stroke="#6990aa" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="-21" cy="31" r="4" fill="#ffdab8" /><circle cx="19" cy="30" r="4" fill="#ffdab8" />
      </g>
    </svg>
    <p>우리 아지트를 만드는 중<span aria-hidden="true">…</span></p>
  </div>;
}
