import { ChevronDown } from "lucide-react";
import { forwardRef, useId } from "react";

function describedBy(descriptionId, errorId, description, error) {
  return (
    [description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined
  );
}

function FieldFrame({
  children,
  description,
  descriptionId,
  error,
  errorId,
  inputId,
  label,
  required
}) {
  return (
    <div className="ui-field">
      {label ? (
        <label className="ui-field__label" htmlFor={inputId}>
          {label}
          {required ? (
            <span className="ui-field__required" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      {children}
      {description ? (
        <p className="ui-field__help" id={descriptionId}>
          {description}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function useFieldIds(id) {
  const generated = useId();
  const inputId = id || `field-${generated}`;
  return {
    descriptionId: `${inputId}-description`,
    errorId: `${inputId}-error`,
    inputId
  };
}

function createField(Control, controlClassName) {
  return forwardRef(function Field(
    { children, className, description, error, id, label, required = false, ...properties },
    reference
  ) {
    const ids = useFieldIds(id);
    return (
      <FieldFrame
        {...ids}
        description={description}
        error={error}
        label={label}
        required={required}
      >
        <Control
          {...properties}
          aria-describedby={describedBy(ids.descriptionId, ids.errorId, description, error)}
          aria-invalid={error ? "true" : undefined}
          className={["ui-field__control", controlClassName, className].filter(Boolean).join(" ")}
          id={ids.inputId}
          ref={reference}
          required={required}
        >
          {children}
        </Control>
      </FieldFrame>
    );
  });
}

export const TextField = createField("input");
export const Textarea = createField("textarea", "ui-field__textarea");
export const Select = forwardRef(function Select(
  { children, className, description, error, id, label, required = false, ...properties },
  reference
) {
  const ids = useFieldIds(id);
  return (
    <FieldFrame {...ids} description={description} error={error} label={label} required={required}>
      <span className="ui-select">
        <select
          {...properties}
          aria-describedby={describedBy(ids.descriptionId, ids.errorId, description, error)}
          aria-invalid={error ? "true" : undefined}
          className={["ui-field__control", "ui-select__control", className]
            .filter(Boolean)
            .join(" ")}
          id={ids.inputId}
          ref={reference}
          required={required}
        >
          {children}
        </select>
        <ChevronDown aria-hidden="true" className="ui-select__icon" size={18} />
      </span>
    </FieldFrame>
  );
});

function Choice({ description, error, id, label, type, ...properties }) {
  const ids = useFieldIds(id);
  return (
    <div className="ui-field">
      <label className="ui-check" htmlFor={ids.inputId}>
        <input
          {...properties}
          aria-describedby={describedBy(ids.descriptionId, ids.errorId, description, error)}
          aria-invalid={error ? "true" : undefined}
          id={ids.inputId}
          type={type}
        />
        <span className="ui-check__copy">
          <span className="ui-field__label">{label}</span>
          {description ? (
            <span className="ui-field__help" id={ids.descriptionId}>
              {description}
            </span>
          ) : null}
          {error ? (
            <span className="ui-field__error" id={ids.errorId}>
              {error}
            </span>
          ) : null}
        </span>
      </label>
    </div>
  );
}

export function Checkbox(properties) {
  return <Choice {...properties} type="checkbox" />;
}

export function Radio(properties) {
  return <Choice {...properties} type="radio" />;
}

export const SearchField = forwardRef(function SearchField(properties, reference) {
  return (
    <div className="ui-search">
      <span aria-hidden="true" className="ui-search__icon">
        ⌕
      </span>
      <TextField {...properties} ref={reference} type="search" />
    </div>
  );
});

export function FilterBar({ children, label = "필터", ...properties }) {
  return (
    <fieldset {...properties} className="ui-filter-bar">
      <legend className="ui-filter-bar__legend">{label}</legend>
      {children}
    </fieldset>
  );
}
