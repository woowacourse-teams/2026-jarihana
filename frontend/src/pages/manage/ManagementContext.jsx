import { Link } from "react-router";
import { useGroup } from "../../features/group/index.js";
import { useRegistrationSummary } from "../../features/registration/index.js";
import "./manage.css";

function registrationManagementPath(groupId, summary, fallbackRecruitmentId) {
  const targetRecruitmentId = summary?.targetRecruitmentId ?? fallbackRecruitmentId;

  return targetRecruitmentId
    ? `/groups/${groupId}/manage/recruitments/${targetRecruitmentId}/registrations`
    : `/groups/${groupId}/manage/registrations`;
}

function RegistrationPendingBadge({ count }) {
  if (!count || count < 1) return null;

  const visibleCount = count > 99 ? "99+" : String(count);

  return (
    <>
      <span aria-hidden="true" className="manage-context__pending-badge">
        {visibleCount}
      </span>
      <span className="manage-visually-hidden">처리 대기 신청 {count}건</span>
    </>
  );
}

export function ManagementContext({ active, groupId, recruitmentId }) {
  const groupQuery = useGroup(groupId);
  const registrationSummaryQuery = useRegistrationSummary(groupId);
  const registrationSummary = registrationSummaryQuery.data;
  const groupName = groupQuery.data?.name ?? `모임 #${groupId}`;
  const links = [
    { key: "overview", label: "모임 수정", to: `/groups/${groupId}/manage` },
    {
      key: "recruitments",
      label: "모집 관리",
      to: `/groups/${groupId}/manage/recruitments`
    },
    {
      key: "registrations",
      label: "신청 관리",
      pendingCount: registrationSummary?.pendingCount ?? 0,
      to: registrationManagementPath(groupId, registrationSummary, recruitmentId)
    },
    { key: "members", label: "멤버 관리", to: `/groups/${groupId}/manage/members` }
  ];

  return (
    <header className="manage-context">
      <h1>{groupName}</h1>
      <nav aria-label="모임 관리 메뉴" className="manage-context__nav">
        {links.map((link) => (
          <Link
            aria-current={active === link.key ? "page" : undefined}
            className={
              active === link.key
                ? "manage-context__link manage-context__link--active"
                : "manage-context__link"
            }
            key={link.key}
            to={link.to}
          >
            <span>{link.label}</span>
            {link.key === "registrations" ? (
              <RegistrationPendingBadge count={link.pendingCount} />
            ) : null}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function ManagementPageHeading({ description, statIcon, statLabel, statValue, title }) {
  const hasStat = statValue !== undefined && statValue !== null;
  const statAriaLabel = [statLabel, statValue].filter(Boolean).join(" ");

  return (
    <div className="manage-heading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {hasStat ? (
        <div
          aria-label={statAriaLabel || undefined}
          className={statIcon ? "manage-stat manage-stat--inline" : "manage-stat"}
        >
          {statIcon ? <span className="manage-stat__icon">{statIcon}</span> : null}
          {statLabel ? <span>{statLabel}</span> : null}
          <strong>{statValue}</strong>
        </div>
      ) : null}
    </div>
  );
}
