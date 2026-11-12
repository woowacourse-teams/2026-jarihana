import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

import joinImage from "../../shared/assets/landing/landing-avatar-join.webp";
import createImage from "../../shared/assets/landing/landing-avatar-create.webp";
import "./landing-core-cards.css";

export function LandingCoreCards({ active }) {
  return (
    <section
      aria-current={active ? "step" : undefined}
      aria-labelledby="core-title"
      className="landing-section landing-core-cards"
      data-guide-chapter="core"
      id="core"
    >
      <div className="landing-container">
        <header className="landing-heading landing-core-cards__heading">
          <p className="landing-eyebrow">함께할 마음이 생겼다면</p>
          <h2 id="core-title">당신을 위한 자리,<br />하나쯤은 있어요.</h2>
        </header>
        <div className="landing-core-cards__grid">
          <article className="landing-path" aria-labelledby="path-join-title">
            <p className="landing-path__eyebrow">함께할 자리를 찾고 싶어요</p>
            <h3 id="path-join-title">여기,<br />자리해도 될까요?</h3>
            <ul className="landing-path__types" aria-label="모임 종류">
              <li>스터디</li>
              <li>동아리</li>
              <li>같이해요</li>
            </ul>
            <div className="landing-path__art">
              <img
                alt="양옆에 아바타가 앉아 있고, 가운데 빈 민트색 의자 위에 짧은 강조선이 있는 모습"
                height="657"
                loading="lazy"
                src={joinImage}
                width="887"
              />
            </div>
            <Link
              className="landing-path__link"
              data-ph-capture-attribute-action="landing_feature_join"
              to="/land/join"
            >
              나에게 맞는 자리 찾기
              <ArrowRight aria-hidden="true" size={20} />
            </Link>
          </article>
          <article className="landing-path landing-path--create" aria-labelledby="path-create-title">
            <p className="landing-path__eyebrow">함께할 자리를 만들고 싶어요</p>
            <h3 id="path-create-title">우리 같이,<br />자리 하나 만들까요?</h3>
            <p className="landing-path__description">함께하고 싶은 일을<br />새로운 모임으로 열어보세요.</p>
            <div className="landing-path__art">
              <img
                alt="아바타가 작은 민트색 의자를 두 손으로 가져오고, 의자 위에 더하기 표시가 떠 있는 모습"
                height="1000"
                loading="lazy"
                src={createImage}
                width="1000"
              />
            </div>
            <Link
              className="landing-path__link"
              data-ph-capture-attribute-action="landing_feature_create"
              to="/land/create"
            >
              새로운 자리 만들기
              <ArrowRight aria-hidden="true" size={20} />
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
