import { useState } from "react";
import { RotateCcw } from "lucide-react";

import hoseDuel from "../../shared/assets/illustrations/sparring-hose-duel.webp";
import capsule from "../../shared/assets/illustrations/sparring-capsule.webp";
import coralCapsule from "../../shared/assets/illustrations/sparring-capsule-coral.webp";
import "./sparring-wide-card.css";

export default function SparringWideCard({ topic }) {
  const [shot, setShot] = useState(0);
  const [isFiring, setIsFiring] = useState(false);
  const firingSide = shot % 2 === 1 ? "mint" : "coral";
  const preview = topic.preview;
  const leftPercent = Number.isFinite(preview?.leftPercent)
    ? Math.max(0, Math.min(100, preview.leftPercent))
    : null;

  return (
    <article className="sparring-wide-card">
      <header className="sparring-wide-card__heading">
        <h2>{topic.title}</h2>
        <span className="sparring-wide-card__example">
          {topic.postCount} 한마디 · {topic.votesA + topic.votesB}명 참여
        </span>
      </header>
      <div className="sparring-wide-card__matchup" aria-label="선택할 수 있는 입장">
        <div className="sparring-wide-card__side sparring-wide-card__side--mint">
          <span className="sparring-wide-card__side-label">민트 편</span>
          <strong>{topic.choices[0]}</strong>
        </div>
        <span className="sparring-wide-card__vs" aria-hidden="true">
          VS
        </span>
        <div className="sparring-wide-card__side sparring-wide-card__side--coral">
          <span className="sparring-wide-card__side-label">코랄 편</span>
          <strong>{topic.choices[1]}</strong>
        </div>
      </div>
      <div
        key={shot}
        className={
          "sparring-wide-card__scene" +
          (shot > 0 ? " sparring-wide-card__scene--" + firingSide : "")
        }
        aria-hidden="true"
      >
        <img
          className="sparring-wide-card__scene-art sparring-wide-card__scene-art--mint"
          src={hoseDuel}
          width="1800"
          height="605"
          alt=""
          loading="lazy"
        />
        <img
          className="sparring-wide-card__scene-art sparring-wide-card__scene-art--coral"
          src={hoseDuel}
          width="1800"
          height="605"
          alt=""
          loading="lazy"
        />
        {!isFiring && (
          <div className="sparring-wide-card__ready-capsules">
            <img
              className="sparring-wide-card__ready-capsule sparring-wide-card__ready-capsule--mint"
              src={capsule}
              alt=""
            />
            <img
              className="sparring-wide-card__ready-capsule sparring-wide-card__ready-capsule--coral"
              src={coralCapsule}
              alt=""
            />
          </div>
        )}
        {isFiring && (
          <div className="sparring-wide-card__flight" onAnimationEnd={() => setIsFiring(false)}>
            <img
              className="sparring-wide-card__flying-capsule"
              src={firingSide === "mint" ? capsule : coralCapsule}
              alt=""
            />
          </div>
        )}
      </div>
      <div className="sparring-wide-card__preview-bar">
        <span className="sparring-wide-card__preview-copy">한마디가 캡슐이 되어 날아가요</span>
        <button
          className="sparring-wide-card__replay"
          type="button"
          aria-label={topic.title + " 캡슐 움직임 미리보기"}
          onClick={() => {
            setShot((current) => current + 1);
            setIsFiring(true);
          }}
          data-ph-capture-attribute-action="sparring_animation_preview"
        >
          <RotateCcw size={14} aria-hidden="true" />
          {shot === 0 ? "캡슐 톡!" : "한 번 더"}
        </button>
        <span className="sparring-wide-card__announcement" role="status">
          {shot > 0 ? (firingSide === "mint" ? "민트" : "코랄") + " 편의 캡슐 발사 미리보기" : ""}
        </span>
      </div>
      <footer className="sparring-wide-card__footer">
        <div className="sparring-wide-card__messages">
          {preview?.leftMessage && (
            <p className="sparring-wide-card__message sparring-wide-card__message--mint">
              “{preview.leftMessage}”
            </p>
          )}
          {preview?.rightMessage && (
            <p className="sparring-wide-card__message sparring-wide-card__message--coral">
              “{preview.rightMessage}”
            </p>
          )}
        </div>
        {leftPercent !== null && (
          <div className="sparring-wide-card__votes">
            <div className="sparring-wide-card__vote-labels">
              <strong className="sparring-wide-card__mint">{leftPercent}%</strong>
              <span>투표 비율</span>
              <strong className="sparring-wide-card__coral">{100 - leftPercent}%</strong>
            </div>
            <div className="sparring-wide-card__vote-track" aria-hidden="true">
              <span style={{ width: leftPercent + "%" }} />
            </div>
          </div>
        )}
      </footer>
    </article>
  );
}
