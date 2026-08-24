import faviconImage from "../shared/assets/brand/jarihana-favicon.png";

export function AppFooter() {
  return (
    <footer aria-labelledby="footer-origin-title" className="app-footer">
      <div className="app-footer__copy">
        <a aria-label="자리하나 홈" className="app-footer__brand" href="/">
          <img alt="" className="app-footer__brand-mark" src={faviconImage} />
          <h2 className="app-footer__brand-title">자리 하나?</h2>
        </a>

        <p className="app-footer__tagline">우테코에서 만난 인연들이 함께 만든 자리를 찾아보세요.</p>

        <section aria-labelledby="footer-origin-title" className="app-footer__origin">
          <h2 id="footer-origin-title">왜 &quot;자리&quot;인가?</h2>
          <p>
            우테코 8기 13층에 거주했던 뽀롱마을, 둠바족 사람들은 사람들을 모을 때 &quot;자리하나?&quot;라고 한답니다.
            <br />주로 회식 모임을 구할 때 많이 쓰죠.
          </p>
          <p>
            그걸 변형해서 이 서비스를 통해 동아리나 스터디도 <br />
            이젠 사람들을 모을 수 있도록 하기 위해 &quot;자리&quot;라고 하게 되었습니다!
          </p>
        </section>
      </div>

      <nav aria-label="외부 링크" className="app-footer__social-links">
        <a
          aria-label="GitHub 저장소 열기"
          className="app-footer__social-link"
          href="https://github.com/woowacourse-teams/2026-jarihana.git"
          rel="noreferrer"
          target="_blank"
        >
          <svg
            aria-hidden="true"
            fill="currentColor"
            height="26"
            viewBox="0 0 24 24"
            width="26"
          >
            <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.05c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.2.09 1.83 1.23 1.83 1.23 1.07 1.83 2.8 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.62-2.8 5.64-5.48 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z" />
          </svg>
        </a>
      </nav>
    </footer>
  );
}
