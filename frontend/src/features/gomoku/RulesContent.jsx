import { Stone } from "./Stone";
import { RuleExampleTooltip } from "./RuleExampleTooltip";
import { ruleExampleImages } from "./ruleExampleImages";

export function RulesContent({ rule }) {
  const standard = rule === "RENJU";
  return (
    <div className="gomoku-rules-copy">
      <section className="gomoku-rule-section gomoku-rule-hero" aria-label="승리 조건">
        <p className="gomoku-rules-tag">{standard ? "기본 규칙" : "제한 없음"}</p>
        <h3 className="gomoku-rule-hero__headline">
          <span>5</span>개를 이으면 승리
        </h3>
        <p>가로, 세로, 대각선으로 이어보세요.</p>
        <div className="gomoku-rule-winning-line" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((index) => (
            <span
              key={index}
              className="gomoku-rule-winning-stone"
              style={{ "--stone-index": index }}
            >
              <Stone color="BLACK" />
            </span>
          ))}
        </div>
        <dl className="gomoku-win-conditions">
          <div>
            <dt>
              <Stone color="BLACK" /> 흑돌
            </dt>
            <dd>{standard ? "정확히 5개" : "5개 이상"}</dd>
          </div>
          <div>
            <dt>
              <Stone color="WHITE" /> 백돌
            </dt>
            <dd>5개 이상</dd>
          </div>
        </dl>
      </section>
      {standard && (
        <section className="gomoku-rule-section" aria-label="흑돌이 둘 수 없는 수">
          <h3>흑돌이 둘 수 없는 수</h3>

          <ul className="gomoku-rule-list">
            <li>
              <strong className="gomoku-rule-code">3-3</strong>
              <p>한 수로 양쪽이 열린 3개짜리 줄 두 개를 동시에 만들 수 없어요.</p>
              <RuleExampleTooltip kind="three" imageUrl={ruleExampleImages.three} />
            </li>
            <li>
              <strong className="gomoku-rule-code">4-4</strong>
              <p>한 돌만 더 놓으면 5개가 되는 줄 두 개를 한 수로 동시에 만들 수 없어요.</p>
              <RuleExampleTooltip kind="four" imageUrl={ruleExampleImages.four} />
            </li>
          </ul>
        </section>
      )}
      <section className="gomoku-rule-section" aria-label="진행 방법">
        <div className="gomoku-rule-progress-heading">
          <h3>진행 방법</h3>
          <span className="gomoku-rule-time">
            <strong>60</strong>초 / 한 수
          </span>
        </div>
        <ul className="gomoku-rule-basics">
          <li>두 사람 모두 준비한 뒤 방장이 시작해요.</li>
          <li>흑돌부터 번갈아 두세요.</li>
          <li>
            판에서 자리를 선택한 뒤 <strong>&quot;자리하기&quot;</strong>를 눌러 확정하세요.
          </li>
          <li>다시 대결하면 흑백을 바꿔요.</li>
        </ul>
        <p className="gomoku-rule-note">키보드는 화살표로 이동하고 Enter 또는 Space로 선택해요.</p>
        <p className="gomoku-rule-note">
          연결이 끊겨도 시간은 흘러요. 다시 연결하면 최신 판을 불러와요.
        </p>
      </section>
    </div>
  );
}
