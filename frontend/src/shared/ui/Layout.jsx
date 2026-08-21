export function PageContainer({ as: Element = "div", className = "", ...properties }) {
  return <Element {...properties} className={`ui-page-container ${className}`} />;
}

export function PageHeader({ action, description, eyebrow, title }) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header__copy">
        {eyebrow ? <p className="ui-page-header__eyebrow">{eyebrow}</p> : null}
        <h1 className="ui-page-header__title">{title}</h1>
        {description ? <p className="ui-page-header__description">{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}

export function SectionHeader({ action, description, title }) {
  return (
    <header className="ui-section-header">
      <div>
        <h2 className="ui-section-header__title">{title}</h2>
        {description ? <p className="ui-section-header__description">{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}
