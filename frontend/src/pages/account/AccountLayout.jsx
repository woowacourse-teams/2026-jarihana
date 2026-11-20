import { Link } from "react-router";

export function AccountLayout({ eyebrow, title, visuallyHideTitle = false, description, headingAside, children, compact = false, className = "" }) {
  return (
    <div className={["account-page", compact && "account-page--compact", className].filter(Boolean).join(" ")}>
      <header className={`account-heading${headingAside ? " account-heading--split" : ""}`}>
        {eyebrow ? <p className="account-eyebrow">{eyebrow}</p> : null}
        <h1 className={`account-heading__title${visuallyHideTitle ? " ui-sr-only" : ""}`}>{title}</h1>
        {description ? <p className="account-heading__description">{description}</p> : null}
        {headingAside ? <div className="account-heading__aside">{headingAside}</div> : null}
      </header>
      <div className={compact ? "account-page__content account-page__content--compact" : "account-page__content"}>
        {children}
      </div>
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
