import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation } from "react-router";

import "./group-transition.css";

const GroupTransitionContext = createContext(null);

export function isPlainLinkClick(event) {
  return !event.defaultPrevented && event.button === 0 &&
    !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function groupTransitionOrigin(state) {
  const origin = state?.groupTransition?.origin;
  return typeof origin === "string" && /^(?:\/|\/groups)(?:[?#]|$)/.test(origin)
    ? origin
    : null;
}

export function GroupTransitionProvider({ children }) {
  const location = useLocation();
  const [selection, setSelection] = useState(() => location.state?.groupTransition ?? null);
  const source = location.state?.groupTransition ?? selection;
  const previousPath = useRef(location.pathname);

  if (location.state?.groupTransition && location.state.groupTransition !== selection) {
    setSelection(location.state.groupTransition);
  }

  useLayoutEffect(() => {
    const returning = /^\/groups\/\d+$/.test(previousPath.current) &&
      (location.pathname === "/" || location.pathname === "/groups");
    previousPath.current = location.pathname;
    if (!returning || !source) return;

    const frame = window.requestAnimationFrame(() => {
      const card = [...document.querySelectorAll("[data-group-source]")]
        .find((element) => element.dataset.groupSource === source.key);
      card?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, source]);

  return (
    <GroupTransitionContext.Provider value={{
      source,
      setSelection,
      returningSource: source?.originKey === location.key ? source : null
    }}>
      {children}
    </GroupTransitionContext.Provider>
  );
}

export function useGroupTransitionSource() {
  return useContext(GroupTransitionContext)?.returningSource ?? null;
}

export function GroupDetailLink({ groupId, source, carouselIndex, ...properties }) {
  const context = useContext(GroupTransitionContext);
  if (!context) return <Link {...properties} to={`/groups/${groupId}`} />;
  return <TransitionLink {...properties} carouselIndex={carouselIndex} context={context} groupId={groupId} source={source} />;
}

function TransitionLink({ context, groupId, source, onClick, state, carouselIndex, ...properties }) {
  const location = useLocation();
  const selection = {
    key: `${location.key}:${source}:${groupId}`,
    source,
    groupId,
    carouselIndex,
    origin: `${location.pathname}${location.search}${location.hash}`,
    originKey: location.key
  };

  function handleClick(event) {
    onClick?.(event);
    if (!isPlainLinkClick(event) || (properties.target && properties.target !== "_self")) return;
    flushSync(() => context.setSelection(selection));
  }

  return (
    <Link
      {...properties}
      data-group-source={selection.key}
      data-group-transition-source={context.source?.key === selection.key || undefined}
      onClick={handleClick}
      state={{ ...state, groupTransition: selection }}
      to={`/groups/${groupId}`}
      viewTransition
    />
  );
}
