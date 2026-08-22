import { Link } from "react-router";

export function AccountLayout({ eyebrow, title, description, children, compact = false }) {
  return (
    <div className={`account-page${compact ? " account-page--compact" : ""}`}>
      <header className="account-heading">
        {eyebrow ? <p className="account-eyebrow">{eyebrow}</p> : null}
        <h1 className="account-heading__title">{title}</h1>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </div>
  );
}

export function AccountNav({ active }) {
  return (
    <nav aria-label="내 자리 메뉴" className="account-tabs">
      <Link aria-current={active === "groups" ? "page" : undefined} to="/my/groups">
        내 모임
      </Link>
      <Link aria-current={active === "registrations" ? "page" : undefined} to="/my/registrations">
        내 신청
      </Link>
    </nav>
  );
}
