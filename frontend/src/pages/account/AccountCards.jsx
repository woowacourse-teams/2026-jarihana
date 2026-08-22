import { ArrowRight, CalendarDays, UsersRound } from "lucide-react";
import { Link } from "react-router";

import { Card, StatusBadge } from "../../shared/ui/index.js";
import { GROUP_TYPE_LABELS, REGISTRATION_STATUS_LABELS, formatKoreanDate } from "./accountUtils.js";

export function GroupSummaryCard({ group }) {
  return (
    <Card
      aria-label={`${group.name} 모임 상세 보기`}
      as={Link}
      className="account-card"
      interactive
      to={`/groups/${group.id}`}
    >
      <div className="account-card__meta">
        <StatusBadge tone="brand">{GROUP_TYPE_LABELS[group.type] ?? group.type}</StatusBadge>
        <span>
          <UsersRound aria-hidden="true" size={15} /> {group.memberCount}명
        </span>
      </div>
      <h3>{group.name}</h3>
      <p>{group.introduction}</p>
      <div className="account-card__footer">
        <span>
          {group.leader
            ? `${group.leader.crewName} · ${group.leader.generation}기`
            : "리더 정보 없음"}
        </span>
        <ArrowRight aria-hidden="true" size={18} />
      </div>
    </Card>
  );
}

export function RegistrationSummaryCard({ registration, action }) {
  const tone =
    registration.status === "APPROVED"
      ? "success"
      : registration.status === "REJECTED"
        ? "danger"
        : "warning";

  return (
    <Card as="article" className="registration-card">
      <div className="account-card__meta">
        <StatusBadge tone={tone}>
          {REGISTRATION_STATUS_LABELS[registration.status] ?? registration.status}
        </StatusBadge>
        <span>
          <CalendarDays aria-hidden="true" size={15} />{" "}
          {formatKoreanDate(registration.registeredAt)}
        </span>
      </div>
      <h3>
        <Link to={`/groups/${registration.group.id}`}>{registration.group.name}</Link>
      </h3>
      {registration.message ? (
        <p>{registration.message}</p>
      ) : (
        <p className="muted-copy">남긴 신청 메시지가 없어요.</p>
      )}
      {registration.decisionReason ? (
        <p className="decision-reason">안내: {registration.decisionReason}</p>
      ) : null}
      {action ? <div className="registration-card__action">{action}</div> : null}
    </Card>
  );
}
