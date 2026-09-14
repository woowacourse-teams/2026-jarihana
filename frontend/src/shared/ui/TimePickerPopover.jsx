import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

const PERIODS = [
  { label: "오전", value: "am" },
  { label: "오후", value: "pm" }
];
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = [0, 10, 20, 30, 40, 50];

function pad(value) {
  return String(value).padStart(2, "0");
}

function splitTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  const hour24 = match ? Number(match[1]) : 0;
  return {
    hour: hour24 % 12 || 12,
    minute: match ? Number(match[2]) : 0,
    period: hour24 < 12 ? "am" : "pm"
  };
}

function combineTime(period, hour, minute) {
  const hour24 = period === "pm" ? (hour % 12) + 12 : hour % 12;
  return `${pad(hour24)}:${pad(minute)}`;
}

function TimeOptionList({ id, label, onClose, onSelect, options, selectedValue }) {
  const optionReferences = useRef([]);
  const enabledIndexes = options.reduce((indexes, option, index) => {
    if (!option.disabled) indexes.push(index);
    return indexes;
  }, []);
  const selectedIndex = options.findIndex(
    (option) => option.value === selectedValue && !option.disabled
  );
  const initialIndex = selectedIndex >= 0 ? selectedIndex : enabledIndexes[0];

  useEffect(() => {
    optionReferences.current[initialIndex]?.focus();
  }, [initialIndex]);

  function moveFocus(event, direction) {
    const currentIndex = optionReferences.current.indexOf(event.currentTarget);
    const enabledPosition = enabledIndexes.indexOf(currentIndex);
    const nextPosition =
      (enabledPosition + direction + enabledIndexes.length) % enabledIndexes.length;
    optionReferences.current[enabledIndexes[nextPosition]]?.focus();
  }

  return (
    <div
      aria-label={label}
      className="ui-time-picker__options"
      id={id}
      role="listbox"
    >
      {options.map((option, index) => (
        <button
          aria-selected={option.value === selectedValue}
          className="ui-time-picker__option"
          disabled={option.disabled}
          key={option.value}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              moveFocus(event, event.key === "ArrowDown" ? 1 : -1);
            }
            if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              const index = event.key === "Home" ? enabledIndexes[0] : enabledIndexes.at(-1);
              optionReferences.current[index]?.focus();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }
          }}
          onClick={() => onSelect(option.value)}
          ref={(node) => {
            optionReferences.current[index] = node;
          }}
          role="option"
          tabIndex={index === initialIndex ? 0 : -1}
          type="button"
        >
          <span>{option.label}</span>
          {option.value === selectedValue ? <Check aria-hidden="true" size={16} /> : null}
        </button>
      ))}
    </div>
  );
}

function PeriodSelect({ disabled = false, onChange, options, value }) {
  const listId = useId();
  const triggerReference = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    triggerReference.current?.focus();
  }, []);

  return (
    <div
      className="ui-time-picker__select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
      <button
        aria-controls={listId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="오전 오후"
        className="ui-time-picker__select-trigger"
        disabled={disabled}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        ref={triggerReference}
        type="button"
      >
        <span>{selected?.label}</span>
        <ChevronDown aria-hidden="true" size={18} />
      </button>
      {isOpen ? (
        <TimeOptionList
          id={listId}
          label="오전 오후 선택"
          onClose={() => {
            setIsOpen(false);
            triggerReference.current?.focus();
          }}
          onSelect={(nextValue) => {
            onChange(nextValue);
            setIsOpen(false);
            triggerReference.current?.focus();
          }}
          options={options}
          selectedValue={value}
        />
      ) : null}
    </div>
  );
}

function TimePartInput({ disabled = false, label, maximum, minimum, onCommit, options, value }) {
  const listId = useId();
  const inputReference = useRef(null);
  const [isOpen, setIsOpen] = useState(false);

  function commit(control = inputReference.current) {
    if (!control) return false;
    const rawValue = control.value.trim();
    const nextValue = Number(rawValue);
    const isInvalid =
      rawValue === "" ||
      !Number.isInteger(nextValue) ||
      nextValue < minimum ||
      nextValue > maximum;

    control.setCustomValidity(
      isInvalid ? `${minimum}부터 ${maximum} 사이의 ${label}을 입력해 주세요.` : ""
    );
    if (!control.reportValidity()) return false;
    onCommit(nextValue, control);
    control.value = pad(nextValue);
    return true;
  }

  return (
    <div
      className="ui-time-picker__part"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
      <div className="ui-time-picker__combobox">
        <input
          aria-label={`${label} 직접 입력`}
          defaultValue={pad(value)}
          disabled={disabled}
          inputMode="numeric"
          key={`time-part-${value}`}
          maxLength={2}
          onBlur={(event) => commit(event.currentTarget)}
          onChange={(event) => {
            if (!/^\d{0,2}$/.test(event.currentTarget.value)) {
              event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 2);
            }
            event.currentTarget.setCustomValidity("");
          }}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          ref={inputReference}
          required
          type="text"
        />
        <button
          aria-controls={listId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={`${label} 목록 열기`}
          className="ui-time-picker__list-trigger"
          disabled={disabled || options.length === 0}
          onClick={() => setIsOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setIsOpen(true);
            }
          }}
          type="button"
        >
          <ChevronDown aria-hidden="true" size={18} />
        </button>
      </div>
      {isOpen ? (
        <TimeOptionList
          id={listId}
          label={`${label} 선택`}
          onClose={() => {
            setIsOpen(false);
            inputReference.current?.focus();
          }}
          onSelect={(nextValue) => {
            onCommit(nextValue, inputReference.current);
            inputReference.current.value = pad(nextValue);
            setIsOpen(false);
            inputReference.current?.focus();
          }}
          options={options.map((option) => ({
            label: pad(option),
            value: option
          }))}
          selectedValue={value}
        />
      ) : null}
    </div>
  );
}

export function TimePickerPopover({ label, minimum, onChange, value }) {
  const selected = useMemo(() => splitTime(value), [value]);

  function isUnavailable(period, hour, minute = 59) {
    if (minimum === null) return true;
    return typeof minimum === "string" && combineTime(period, hour, minute) < minimum;
  }

  function changePart(period, hour, minute) {
    const nextTime = combineTime(period, hour, minute);
    if (minimum === null) return;
    onChange(typeof minimum === "string" && nextTime < minimum ? minimum : nextTime);
  }

  function commitPart(part, nextValue, control) {
    const hour = part === "hour" ? nextValue : selected.hour;
    const minute = part === "minute" ? nextValue : selected.minute;

    if (isUnavailable(selected.period, hour, minute)) {
      control.setCustomValidity("모집 시작 시간 이후로 설정해 주세요.");
      control.reportValidity();
      return;
    }
    changePart(selected.period, hour, minute);
  }

  const availableHours = HOURS.filter(
    (hour) => !isUnavailable(selected.period, hour)
  );
  const availableMinutes = MINUTES.filter(
    (minute) => !isUnavailable(selected.period, selected.hour, minute)
  );

  return (
    <div aria-label={label} className="ui-time-picker" role="dialog">
      <div className="ui-time-picker__controls">
        <PeriodSelect
          disabled={minimum === null}
          onChange={(nextPeriod) => {
            changePart(nextPeriod, selected.hour, selected.minute);
          }}
          options={PERIODS.map((period) => ({
            ...period,
            disabled: HOURS.every((hour) => isUnavailable(period.value, hour))
          }))}
          value={selected.period}
        />

        <TimePartInput
          disabled={minimum === null}
          label="시"
          maximum={12}
          minimum={1}
          onCommit={(nextValue, control) => commitPart("hour", nextValue, control)}
          options={availableHours}
          value={selected.hour}
        />

        <span aria-hidden="true" className="ui-time-picker__colon">:</span>

        <TimePartInput
          disabled={minimum === null}
          label="분"
          maximum={59}
          minimum={0}
          onCommit={(nextValue, control) => commitPart("minute", nextValue, control)}
          options={availableMinutes}
          value={selected.minute}
        />
      </div>
    </div>
  );
}
