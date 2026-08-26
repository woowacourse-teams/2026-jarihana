import { Button } from "./Button.jsx";

export function Skeleton({
  "aria-label": ariaLabel,
  className = "",
  count = 1,
  role,
  ...properties
}) {
  const announced = Boolean(ariaLabel || role);
  return Array.from({ length: count }, (_, index) => (
    <span
      {...properties}
      aria-hidden={index > 0 || !announced ? "true" : undefined}
      aria-label={index === 0 ? ariaLabel : undefined}
      className={`ui-skeleton ${className}`}
      key={index}
      role={index === 0 && announced ? role || "status" : undefined}
    />
  ));
}

function State({ action, description, mark, showMark = true, title, tone = "neutral", visual }) {
  return (
    <section className={`ui-state ui-state--${tone}`}>
      {visual ? <div className="ui-state__visual">{visual}</div> : null}
      {showMark ? (
        <span aria-hidden="true" className="ui-state__mark">
          {mark}
        </span>
      ) : null}
      <h2 className="ui-state__title">{title}</h2>
      {description ? <p className="ui-state__description">{description}</p> : null}
      {action ? <div>{action}</div> : null}
    </section>
  );
}

export function EmptyState({
  action,
  description = "조건을 바꾸거나 새 항목을 만들어 보세요.",
  showMark = true,
  title = "아직 내용이 없어요",
  visual
}) {
  return (
    <State
      action={action}
      description={description}
      mark="0"
      showMark={showMark}
      title={title}
      visual={visual}
    />
  );
}

export function ErrorState({
  action,
  description = "잠시 뒤 다시 시도해 주세요.",
  title = "불러오지 못했어요"
}) {
  return <State action={action} description={description} mark="!" title={title} tone="error" />;
}

export function ForbiddenState({
  action,
  description = "접근 권한이 있는 계정으로 다시 확인해 주세요.",
  title = "이 페이지를 볼 권한이 없어요"
}) {
  return <State action={action} description={description} mark="!" title={title} tone="error" />;
}

export function NotFoundState({
  action,
  description = "주소가 바뀌었거나 삭제된 페이지일 수 있어요.",
  title = "페이지를 찾을 수 없어요"
}) {
  return <State action={action} description={description} mark="?" title={title} />;
}

export function CursorList({
  children,
  hasNext = false,
  label = "모임 더 보기",
  nextCursor,
  onLoadMore,
  pending = false
}) {
  return (
    <div className="ui-cursor-list">
      <ul className="ui-cursor-list__items">{children}</ul>
      {hasNext ? (
        <div className="ui-cursor-list__action">
          <Button onClick={() => onLoadMore?.(nextCursor)} pending={pending} variant="secondary">
            {label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
