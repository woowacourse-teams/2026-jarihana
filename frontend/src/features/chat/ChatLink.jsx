import { Link, useLocation } from "react-router";

export function chatLocation(location, roomId) {
  const search = new URLSearchParams(location.search);
  search.set("chat", roomId ? String(roomId) : "inbox");
  return { pathname: location.pathname, search: `?${search}`, hash: location.hash };
}

export function ChatLink({ roomId, children, ...props }) {
  const location = useLocation();
  return <Link {...props} to={chatLocation(location, roomId)} state={location.state}
    viewTransition={new URLSearchParams(location.search).has("chat")}
    replace={new URLSearchParams(location.search).has("chat")} preventScrollReset>{children}</Link>;
}
