import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { Link, useLocation } from "react-router";

import browseChair from "../shared/assets/brand/header-chairs/browse.png";
import memoriesChair from "../shared/assets/brand/header-chairs/memories.png";
import proposalChair from "../shared/assets/brand/header-chairs/proposal.png";

const GROUP_LINKS = [
  {
    action: "group_browse",
    description: "함께할 자리 둘러보기",
    icon: browseChair,
    isActive: (pathname) => pathname === "/groups",
    label: "뭐있나?",
    to: "/groups"
  },
  {
    action: "browse_activity_posts",
    description: "사진으로 보는 자리 이야기",
    icon: memoriesChair,
    isActive: (pathname) => pathname === "/activities",
    label: "뭐했나?",
    to: "/activities"
  },
  {
    action: "browse_proposals",
    description: "하고 싶은 자리 제안하기",
    icon: proposalChair,
    isActive: (pathname) => pathname === "/board" || pathname.startsWith("/board/"),
    label: "뭐할래?",
    to: "/board"
  }
];

export function isGroupNavigationActive(pathname) {
  return ["/groups", "/activities", "/board"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function GroupNavigation({ mobile = false, onNavigate = () => {} }) {
  const { pathname } = useLocation();
  const [openMode, setOpenMode] = useState(null);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();
  const isOpen = openMode !== null;

  function closeOnEscape(event) {
    if (event.key !== "Escape" || !isOpen) return;
    event.stopPropagation();
    setOpenMode(null);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnOutsidePress = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpenMode(null);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpenMode(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div
      className={`app-header__group-navigation${mobile ? " app-header__group-navigation--mobile" : ""}`}
      data-active={isGroupNavigationActive(pathname)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpenMode(null);
      }}
      onPointerEnter={(event) => {
        if (!mobile && event.pointerType === "mouse") setOpenMode((mode) => mode ?? "hover");
      }}
      onPointerLeave={(event) => {
        if (mobile || event.pointerType !== "mouse" || event.currentTarget.contains(document.activeElement)) return;
        setOpenMode((mode) => mode === "hover" ? null : mode);
      }}
      ref={containerRef}
    >
      <button
        aria-controls={menuId}
        aria-expanded={isOpen}
        className="app-header__link app-header__group-trigger"
        data-ph-capture-attribute-action="group_navigation_toggle"
        onClick={() => setOpenMode((mode) => mode === "click" ? null : "click")}
        onKeyDown={closeOnEscape}
        ref={triggerRef}
        type="button"
      >
        자리
        <ChevronDown aria-hidden="true" className="app-header__group-caret" />
      </button>
      <div
        aria-hidden={!isOpen}
        className="app-header__group-dropdown"
        data-open={isOpen}
        id={menuId}
        inert={!isOpen}
      >
        <div className="app-header__group-options">
          {GROUP_LINKS.map((link) => (
            <Link
              aria-current={link.isActive(pathname) ? "page" : undefined}
              aria-describedby={`${menuId}-${link.action}-description`}
              aria-labelledby={`${menuId}-${link.action}-label`}
              className="app-header__group-option"
              data-ph-capture-attribute-action={link.action}
              key={link.to}
              onClick={() => {
                setOpenMode(null);
                onNavigate();
              }}
              onKeyDown={closeOnEscape}
              to={link.to}
            >
              <img
                alt=""
                aria-hidden="true"
                className="app-header__group-icon"
                decoding="async"
                height="144"
                src={link.icon}
                width="144"
              />
              <span className="app-header__group-copy">
                <span className="app-header__group-label" id={`${menuId}-${link.action}-label`}>{link.label}</span>
                <span className="app-header__group-description" id={`${menuId}-${link.action}-description`}>{link.description}</span>
              </span>
              <ArrowUpRight aria-hidden="true" className="app-header__group-arrow" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
