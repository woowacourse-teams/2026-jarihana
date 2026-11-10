// 피드 반응의 빨간 하트(heart.webp)와 같은 색과 광택을 SVG로 그린 아이콘.
export function HeartIcon({ className, size = 12 }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      height={size}
      viewBox="0 0 24 22"
      width={size}
    >
      <path
        d="M12 21.2C5.6 16.3 1.5 12.6 1.5 7.6 1.5 4.3 4 1.8 7.2 1.8c2 0 3.7 1 4.8 2.6 1.1-1.6 2.8-2.6 4.8-2.6 3.2 0 5.7 2.5 5.7 5.8 0 5-4.1 8.7-10.5 13.6z"
        fill="#f5231c"
      />
      <path
        d="M12 21.2c6.4-4.9 10.5-8.6 10.5-13.6 0-1-.2-1.9-.6-2.7-.6 4.9-4.6 8.7-9.9 12.7-5.3-4-9.3-7.8-9.9-12.7-.4.8-.6 1.7-.6 2.7 0 5 4.1 8.7 10.5 13.6z"
        fill="#d0140f"
      />
      <ellipse cx="7.3" cy="6.5" fill="#ffffff" opacity="0.42" rx="2.6" ry="1.5" transform="rotate(-32 7.3 6.5)" />
    </svg>
  );
}
