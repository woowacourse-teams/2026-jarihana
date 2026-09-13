import { ExternalLink } from "lucide-react";
import { Link } from "react-router";
import { useGroup } from "../../features/group/index.js";
import "./manage.css";

export function ManagementContext({ active, groupId, recruitmentId }) {
  const groupQuery = useGroup(groupId);
  const groupName = groupQuery.data?.name ?? `모임 #${groupId}`;
  const links = [
    { key: "overview", label: "모임 수정", to: `/groups/${groupId}/manage` },
    {
      key: "recruitments",
      label: "모집 관리",
      to: `/groups/${groupId}/manage/recruitments`
    },
    {
      key: "history",
      label: "모집 이력",
      to: `/groups/${groupId}/manage/recruitments/history`
    },
    {
      key: "registrations",
      label: "신청 관리",
      to: recruitmentId
        ? `/groups/${groupId}/manage/recruitments/${recruitmentId}/registrations`
        : `/groups/${groupId}/manage/registrations`
    },
    { key: "members", label: "멤버 관리", to: `/groups/${groupId}/manage/members` }
  ];

  return (
    <header className="manage-context">
      <div className="manage-context__title-row">
        <h1>{groupName}</h1>
        <Link
          className="manage-context__detail-link"
          to={`/groups/${groupId}`}
        >
          <span>모임 상세 보기</span>
          <ExternalLink aria-hidden="true" size={16} strokeWidth={2.25} />
        </Link>
      </div>
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
            {link.label}
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
