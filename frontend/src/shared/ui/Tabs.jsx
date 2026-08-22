import { useId, useRef, useState } from "react";

export function Tabs({ defaultValue, items, onValueChange, value }) {
  const generatedId = useId();
  const [internalValue, setInternalValue] = useState(defaultValue || items[0]?.value);
  const references = useRef([]);
  const controlled = value !== undefined;
  const selectedValue = controlled ? value : internalValue;

  function select(nextValue, index) {
    if (!controlled) setInternalValue(nextValue);
    onValueChange?.(nextValue);
    references.current[index]?.focus();
  }

  function handleKeyDown(event, index) {
    const last = items.length - 1;
    let nextIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      nextIndex = index === last ? 0 : index + 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      nextIndex = index === 0 ? last : index - 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = last;
    if (nextIndex === undefined) return;
    event.preventDefault();
    select(items[nextIndex].value, nextIndex);
  }

  return (
    <div className="ui-tabs">
      <div aria-label="콘텐츠 보기" className="ui-tabs__list" role="tablist">
        {items.map((item, index) => {
          const selected = item.value === selectedValue;
          const tabId = `${generatedId}-${item.value}-tab`;
          const panelId = `${generatedId}-${item.value}-panel`;
          return (
            <button
              aria-controls={panelId}
              aria-selected={selected}
              className="ui-tabs__tab"
              id={tabId}
              key={item.value}
              onClick={() => select(item.value, index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(node) => {
                references.current[index] = node;
              }}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => {
        const selected = item.value === selectedValue;
        return (
          <div
            aria-labelledby={`${generatedId}-${item.value}-tab`}
            className="ui-tabs__panel"
            hidden={!selected}
            id={`${generatedId}-${item.value}-panel`}
            key={item.value}
            role="tabpanel"
            tabIndex={0}
          >
            {item.content}
          </div>
        );
      })}
    </div>
  );
}
