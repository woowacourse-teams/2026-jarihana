import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";

import { useAuth } from "../features/auth";
import { Avatar } from "../shared/ui";

export function ProfileMenu() {
  const { avatarUrl, logout, member } = useAuth();
  const { pathname } = useLocation();
  const [isHovered, setHovered] = useState(false);
  const [isExpanded, setExpanded] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const menuId = useId();
  const isOpen = isHovered || isExpanded;
  const nickname = member?.crewName || "내 계정";
  const isMyPage = ["/my", "/my/groups", "/my/registrations"].includes(pathname);

  const closeMenu = () => {
    setHovered(false);
    setExpanded(false);
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnOutsidePress = (event) => {
      if (!containerRef.current?.contains(event.target)) closeMenu();
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      if (containerRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
      closeMenu();
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
      className="app-header__profile-menu"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) closeMenu();
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse" || event.pointerType === "pen") setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
        if (containerRef.current?.contains(document.activeElement)) setExpanded(true);
      }}
      ref={containerRef}
    >
      <button
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-label={`${nickname} 계정 메뉴`}
        className="app-header__profile"
        data-ph-capture-attribute-action="profile_menu_toggle"
        onClick={() => setExpanded((expanded) => !expanded)}
        ref={triggerRef}
        title={nickname}
        type="button"
      >
        <Avatar
          alt=""
          className="app-header__avatar"
          fallback={member?.crewName?.slice(0, 1) || "?"}
          size="sm"
          src={avatarUrl ?? member?.avatarUrl}
        />
        <span className="app-header__nickname">{nickname}</span>
      </button>
      {isOpen ? (
        <div className="app-header__profile-popover">
          <nav aria-label="계정 메뉴" className="app-header__profile-options" id={menuId}>
            <Link
              aria-current={isMyPage ? "page" : undefined}
              className="app-header__profile-option"
              data-ph-capture-attribute-action="my_page_view"
              onClick={closeMenu}
              to="/my"
            >
              마이페이지
            </Link>
            <button
              className="app-header__profile-option"
              data-ph-capture-attribute-action="logout"
              onClick={() => {
                closeMenu();
                void logout();
              }}
              type="button"
            >
              로그아웃
            </button>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
