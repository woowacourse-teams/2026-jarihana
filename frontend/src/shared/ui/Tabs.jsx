import { useId, useLayoutEffect, useRef, useState } from "react";

export function Tabs({ animated = false, defaultValue, items, onValueChange, value }) {
  const generatedId = useId();
  const [internalValue, setInternalValue] = useState(defaultValue || items[0]?.value);
  const indicatorReference = useRef(null);
  const listReference = useRef(null);
  const references = useRef([]);
  const controlled = value !== undefined;
  const selectedValue = controlled ? value : internalValue;

  useLayoutEffect(() => {
    if (!animated) return undefined;

    const updateIndicator = () => {
      const selectedIndex = items.findIndex((item) => item.value === selectedValue);
      const selectedTab = references.current[selectedIndex];
      const indicator = indicatorReference.current;
      if (!selectedTab || !indicator) return;

      indicator.style.setProperty("--ui-tabs-indicator-x", `${selectedTab.offsetLeft}px`);
      indicator.style.setProperty("--ui-tabs-indicator-scale", `${selectedTab.offsetWidth}`);
    };

    updateIndicator();
    const list = listReference.current;
    const observer =
      list && typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateIndicator) : null;
    observer?.observe(list);
    window.addEventListener("resize", updateIndicator);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [animated, items, selectedValue]);

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
    <div className={animated ? "ui-tabs ui-tabs--animated" : "ui-tabs"}>
      <div
        aria-label="콘텐츠 보기"
        className="ui-tabs__list"
        ref={listReference}
        role="tablist"
      >
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
        {animated ? (
          <span
            aria-hidden="true"
            className="ui-tabs__indicator"
            ref={indicatorReference}
          />
        ) : null}
      </div>
      {items.map((item) => {
        const selected = item.value === selectedValue;
        return (
          <div
            aria-labelledby={`${generatedId}-${item.value}-tab`}
            className={animated ? "ui-tabs__panel ui-tabs__panel--animated" : "ui-tabs__panel"}
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
