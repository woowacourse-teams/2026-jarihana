import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation } from "react-router";

import { groupQueryOptions } from "../../features/group/hooks.js";
import { useGroupPhotoTransition } from "./useGroupPhotoTransition.js";

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
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState(() => location.state?.groupTransition ?? null);
  const source = location.state?.groupTransition ?? selection;
  const previousPath = useRef(location.pathname);
  useGroupPhotoTransition(location.pathname, source);

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
      prefetchGroup: (groupId) => {
        void queryClient.prefetchQuery({
          ...groupQueryOptions(String(groupId)),
          retry: false
        });
      },
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

function TransitionLink({
  context,
  groupId,
  source,
  onClick,
  onFocus,
  onPointerDown,
  onPointerEnter,
  state,
  carouselIndex,
  ...properties
}) {
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

  function prefetchGroup(event) {
    if (event.defaultPrevented) return;
    context.prefetchGroup(groupId);
  }

  function handleFocus(event) {
    onFocus?.(event);
    prefetchGroup(event);
  }

  function handlePointerEnter(event) {
    onPointerEnter?.(event);
    if (event.pointerType && event.pointerType !== "mouse") return;
    prefetchGroup(event);
  }

  function handlePointerDown(event) {
    onPointerDown?.(event);
    if (event.pointerType !== "touch") return;
    prefetchGroup(event);
  }

  return (
    <Link
      {...properties}
      data-group-source={selection.key}
      data-group-transition-source={context.source?.key === selection.key || undefined}
      onClick={handleClick}
      onFocus={handleFocus}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      state={{ ...state, groupTransition: selection }}
      to={`/groups/${groupId}`}
      viewTransition
    />
  );
}
