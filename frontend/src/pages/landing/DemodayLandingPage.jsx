import logo from "../../shared/assets/brand/jarihana-favicon.png";
import { LandingPage } from "./LandingPage";
import "./landing-demoday.css";

const contributors = [
  { name: "이삭", github: "5jonyuk", chairPosition: "0%" },
  { name: "요크", github: "Sauter001", chairPosition: "33.3333%" },
  { name: "파도", github: "choubung", chairPosition: "66.6667%" },
  { name: "에덴", github: "RealTake", chairPosition: "100%" }
];

function GitHubMark() {
  return (
    <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
    </svg>
  );
}

function DemodayTeam() {
  return (
    <section aria-labelledby="demoday-team-title" className="landing-demoday landing-container">
      <h2 id="demoday-team-title">자리하나?를 만든 사람들</h2>
      <ul className="landing-demoday__team">
        {contributors.map(({ name, github, chairPosition }) => (
          <li key={github}>
            <div aria-hidden="true" className="landing-demoday__chair" style={{ "--chair-position": chairPosition }} />
            <p>BE {name}</p>
            <a
              aria-label={`${name} GitHub 프로필`}
              data-ph-capture-attribute-action="landing_team_github_open"
              href={`https://github.com/${github}`}
              rel="noreferrer"
              target="_blank"
            >
              <GitHubMark />
              <span>GitHub</span>
            </a>
          </li>
        ))}
      </ul>
      <a
        className="landing-demoday__repository"
        data-ph-capture-attribute-action="landing_repository_open"
        href="https://github.com/woowacourse-teams/2026-jarihana"
        rel="noreferrer"
        target="_blank"
      >
        <GitHubMark />
        <span>팀 GitHub</span>
      </a>
    </section>
  );
}

function DemodayBrandRow() {
  return (
    <div className="landing-container landing-demoday-brand-row">
      <p className="landing-demoday-brand-row__name">
        <img alt="" height="28" src={logo} width="28" />
        자리하나?
      </p>
      <p>함께 꾸미고 어울리는 우리만의 자리</p>
    </div>
  );
}

export function DemodayLandingPage() {
  return (
    <LandingPage
      footer={<footer className="landing-demoday-footer"><DemodayBrandRow /></footer>}
      header={<header className="landing-demoday-header"><DemodayBrandRow /></header>}
      isDemoday
    >
      <DemodayTeam />
      <section aria-labelledby="demoday-invite-title" className="landing-demoday-invite">
        <div className="landing-container">
          <h2 id="demoday-invite-title">어서 우리만의 자리 하나 만들고 아지트 꾸미러가요</h2>
          <a
            className="landing-button landing-button--large"
            data-ph-capture-attribute-action="landing_explore"
            href="https://jarihana.com/home"
          >
            자리하나? 바로가기
          </a>
        </div>
      </section>
    </LandingPage>
  );
}
