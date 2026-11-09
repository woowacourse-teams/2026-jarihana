// 헤더의 "반띵 게임" 링크 옆에 두는 막대과자 아이콘이다. 색은 게임 막대 그림과 같은 토큰을 쓴다.
export function PeperoStickIcon() {
  return (
    <svg aria-hidden="true" className="app-header__link-icon pepero-stick-icon" viewBox="0 0 24 24">
      <g transform="rotate(-45 12 12)">
        <rect className="pepero-stick-icon__biscuit" height="3.2" rx="1.6" width="20" x="2" y="10.4" />
        <rect className="pepero-stick-icon__choco" height="4.6" rx="2.3" width="13.2" x="8.6" y="9.7" />
        <line className="pepero-stick-icon__shine" x1="11" x2="19.6" y1="10.9" y2="10.9" />
      </g>
    </svg>
  );
}
