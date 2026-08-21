import { forwardRef } from "react";

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

export const Button = forwardRef(function Button(
  {
    "aria-label": ariaLabel,
    block = false,
    children,
    className,
    disabled = false,
    pending = false,
    pendingLabel = "처리 중",
    size = "md",
    type = "button",
    variant = "primary",
    ...properties
  },
  reference
) {
  const accessibleLabel = pending ? `${String(children)} ${pendingLabel}` : ariaLabel;

  return (
    <button
      {...properties}
      aria-busy={pending || undefined}
      aria-label={accessibleLabel}
      className={classes(
        "ui-button",
        `ui-button--${variant}`,
        `ui-button--${size}`,
        block && "ui-button--block",
        className
      )}
      disabled={disabled || pending}
      ref={reference}
      type={type}
    >
      {pending ? <span aria-hidden="true" className="ui-spinner" /> : null}
      <span>{children}</span>
    </button>
  );
});

export const IconButton = forwardRef(function IconButton(
  { children, className, label, ...properties },
  reference
) {
  return (
    <Button
      {...properties}
      aria-label={label}
      className={classes("ui-icon-button", className)}
      ref={reference}
    >
      <span aria-hidden="true">{children}</span>
    </Button>
  );
});
