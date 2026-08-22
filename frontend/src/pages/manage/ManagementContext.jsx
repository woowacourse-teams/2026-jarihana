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
    ...(recruitmentId
      ? [
          {
            key: "registrations",
            label: "신청 관리",
            to: `/groups/${groupId}/manage/recruitments/${recruitmentId}/registrations`
          }
        ]
      : []),
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
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function ManagementPageHeading({ description, statLabel, statValue, title }) {
  return (
    <div className="manage-heading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {statLabel && statValue ? (
        <div className="manage-stat" aria-label={`${statLabel} ${statValue}`}>
          <span>{statLabel}</span>
          <strong>{statValue}</strong>
        </div>
      ) : null}
    </div>
  );
}
