import { GomokuTooltip } from "./GomokuTooltip";

const examples = {
  three: {
    title: "3-3 예시",
    action: "gomoku_double_three_example_open",
    alt: "가운데 민트 테두리 흑돌을 놓으면 가로와 세로에 양쪽이 열린 3개짜리 줄이 동시에 생기는 3-3 예시",
    caption: "가로 3개와 세로 3개가 동시에 생겨요."
  },
  four: {
    title: "4-4 예시",
    action: "gomoku_double_four_example_open",
    alt: "가운데 민트 테두리 흑돌을 놓으면 가로와 세로에 한 돌만 더 놓으면 5개가 되는 줄이 동시에 생기는 4-4 예시",
    caption: "가로 4개와 세로 4개가 동시에 생겨요."
  }
};

export function RuleExampleTooltip({ kind, imageUrl }) {
  const example = examples[kind];
  return (
    <GomokuTooltip
      label={`${example.title} 보기`}
      action={example.action}
      triggerClassName="gomoku-example-trigger"
    >
      <strong>{example.title}</strong>
      <img src={imageUrl} width="512" height="512" alt={example.alt} />
      <span>{example.caption}</span>
      <span className="gomoku-rule-tooltip__legend">민트 고리: 새 돌 / 빈 원: 빈 자리</span>
    </GomokuTooltip>
  );
}
