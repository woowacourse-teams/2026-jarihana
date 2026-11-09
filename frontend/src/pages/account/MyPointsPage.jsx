import { ArrowLeft, ChevronRight, CirclePlus, Clock3, Coins, DoorOpen, Image, ReceiptText, Trophy, UsersRound } from "lucide-react";
import { Link } from "react-router";
import { usePointHistory, usePointSummary } from "../../features/points/hooks";
import signatureChair from "../../shared/assets/landing/landing-hero-chair.webp";
import { Button, Card, Skeleton, StatusBadge } from "../../shared/ui";
import { AccountLayout } from "./AccountLayout";
import "./points.css";

const number = new Intl.NumberFormat("ko-KR");
const date = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: "Asia/Seoul" });
const formatDate = (value) => date.format(new Date(`${value}+09:00`));

const descriptions = {
  GROUP_CREATED: { label: "모임 만들기", icon: CirclePlus },
  GROUP_FIRST_MEMBER: { label: "만든 모임에 첫 구성원 합류", icon: UsersRound },
  FIRST_GROUP_JOIN: { label: "첫 모임 합류", icon: DoorOpen },
  ACTIVITY_POST: { label: "사진 활동기록 게시", icon: Image },
  GOMOKU_WIN: { label: "오목 승리", icon: Trophy }
};
const exclusions = {
  ALREADY_REWARDED: "이 보상은 이미 등록됐어요.",
  WEEKLY_LIMIT: "활동한 주의 적립 한도에 도달했어요.",
  SAME_OPPONENT: "대국한 날 같은 상대와의 적립 한도에 도달했어요.",
  SAME_ACTIVITY_DATE: "같은 모임과 활동 날짜에 이미 보상을 받았어요.",
  TOO_FEW_MOVES: "기권과 시간초과 승리는 두 사람이 각각 5수 이상 놓아야 적립돼요."
};
const states = { COMPLETED: "적립 완료", PENDING: "처리 중", SKIPPED: "미적립", NEEDS_REVIEW: "지급 확인 중" };
const stateTones = { COMPLETED: "success", PENDING: "warning", SKIPPED: "neutral", NEEDS_REVIEW: "warning" };

function PointAmount({ value }) {
  return <strong className="points-amount">{number.format(value)}<span> P</span></strong>;
}

function PointsError({ retry, action }) {
  return (
    <div className="points-error">
      <p role="alert">포인트 정보를 불러오지 못했어요.</p>
      <Button data-ph-capture-attribute-action={action} variant="secondary" onClick={() => void retry()}>
        다시 시도
      </Button>
    </div>
  );
}

export function PointBalanceCard() {
  const summary = usePointSummary();
  if (summary.isError && !summary.data) {
    return (
      <Button
        data-ph-capture-attribute-action="my_points_balance_retry"
        variant="secondary"
        onClick={() => void summary.refetch()}
      >
        포인트 다시 불러오기
      </Button>
    );
  }
  if (summary.data?.enabled !== true) return null;
  return (
    <Link
      aria-label={`포인트 ${number.format(summary.data.balance)} P, 내역 보기`}
      className="points-wallet-link"
      data-ph-capture-attribute-action="my_points_open"
      to="/my/points"
    >
      <div className="points-wallet-link__value">
        <h2><Coins size={19} aria-hidden="true" />포인트</h2>
        <PointAmount value={summary.data.balance} />
      </div>
      <span className="points-wallet-link__action">
        <span>내역 보기</span><ChevronRight aria-hidden="true" size={16} />
      </span>
    </Link>
  );
}

function Quota({ title, quota }) {
  return (
    <div className="points-quota">
      <div className="points-quota__label">
        <h3>{title}</h3>
        <span><strong>{quota.remaining}회</strong> 남음</span>
      </div>
      <div aria-hidden="true" className="points-quota__track">
        {quota.completed > 0 ? <span data-quota="completed" style={{ flex: quota.completed }} /> : null}
        {quota.pending > 0 ? <span data-quota="pending" style={{ flex: quota.pending }} /> : null}
        {quota.remaining > 0 ? <span data-quota="remaining" style={{ flex: quota.remaining }} /> : null}
      </div>
      <p className="points-muted">{quota.limit}회 중 {quota.completed}회 적립{quota.pending > 0 ? `, ${quota.pending}회 처리 중` : ""}</p>
    </div>
  );
}

function PointHistory({ history }) {
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  if (history.isPending) return <Skeleton aria-label="포인트 내역 불러오는 중" />;
  if (history.isError && !history.data) {
    return <PointsError retry={history.refetch} action="my_points_history_retry" />;
  }
  if (items.length === 0) {
    return (
      <div className="points-history-empty">
        <span><ReceiptText aria-hidden="true" size={22} /></span>
        <strong>아직 적립 내역이 없어요.</strong>
        <p className="points-muted">첫 모임을 만들거나 오목에서 이기면 적립돼요.</p>
      </div>
    );
  }

  return (
    <>
      <ul className="points-history">
        {items.map((item) => {
          const { icon: Icon, label } = descriptions[item.reason] ?? { icon: Coins, label: item.label ?? "포인트 활동" };
          return (
            <li key={item.id}>
              <span className="points-history__icon"><Icon aria-hidden="true" size={18} /></span>
              <div className="points-history__activity">
                <strong>{label}</strong>
                <time dateTime={`${item.occurredAt}+09:00`}>{formatDate(item.occurredAt)}</time>
              </div>
              <div className="points-history__result">
                {item.status !== "SKIPPED" ? <strong>+{number.format(item.amount)} P</strong> : null}
                <StatusBadge tone={stateTones[item.status]}>{states[item.status]}</StatusBadge>
              </div>
              {item.skipReason ? (
                <p className="points-history__note">{exclusions[item.skipReason] ?? "적립 조건에 해당하지 않아요."}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {history.isFetchNextPageError ? <p role="alert">다음 내역을 불러오지 못했어요.</p> : null}
      {history.hasNextPage ? (
        <Button
          data-ph-capture-attribute-action="my_points_history_load_more"
          onClick={() => void history.fetchNextPage()}
          pending={history.isFetchingNextPage}
          variant="secondary"
        >
          내역 더 보기
        </Button>
      ) : null}
    </>
  );
}

export function MyPointsPage() {
  const summary = usePointSummary();
  const history = usePointHistory(summary.data?.enabled === true, summary.data?.processing === true);
  return (
    <AccountLayout
      className="points-page"
      title="포인트"
      visuallyHideTitle
      eyebrow={(
        <Link className="points-back-link" data-ph-capture-attribute-action="my_points_back" to="/my">
          <ArrowLeft aria-hidden="true" size={16} />마이페이지로 돌아가기
        </Link>
      )}
    >
      <div className="points-detail">
        {summary.isPending ? <Skeleton aria-label="포인트 잔액 불러오는 중" /> : null}
        {summary.isError ? <PointsError retry={summary.refetch} action="my_points_summary_retry" /> : null}
        {summary.data?.enabled === false ? <p>포인트를 준비하고 있어요.</p> : null}
        {summary.data?.enabled ? (
          <>
            <div className="points-overview">
              <Card as="section" className="points-balance-hero">
                <div className="points-balance-hero__content">
                  <h2>보유 포인트</h2>
                  <PointAmount value={summary.data.balance} />
                </div>
                <div aria-hidden="true" className="points-balance-hero__art">
                  <img alt="" decoding="async" src={signatureChair} />
                </div>
              </Card>
              <Card as="section" className="points-card points-weekly">
                <h2>이번 주 적립 한도</h2>
                {summary.data.weeklyQuotas.map(({ reason, label, quota }) => (
                  <Quota key={reason} title={label} quota={quota} />
                ))}
                <p className="points-reset points-muted">
                  <Clock3 aria-hidden="true" size={14} />
                  <span>다음 초기화 {formatDate(summary.data.resetsAt)}</span>
                </p>
              </Card>
            </div>
            <Card as="section" className="points-card">
              <h2>적립 내역</h2>
              <PointHistory history={history} />
            </Card>
          </>
        ) : null}
      </div>
    </AccountLayout>
  );
}
