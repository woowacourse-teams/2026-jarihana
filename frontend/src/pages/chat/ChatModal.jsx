import { lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "../../features/auth";
import { Modal } from "../../shared/ui";
import "./chat-modal.css";

const ChatContent = lazy(() => import("./ChatPage.jsx").then((module) => ({ default: module.ChatContent })));

export function ChatModal() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const search = new URLSearchParams(location.search);
  const selected = search.get("chat");
  const open = Boolean(selected) && auth.status === "authenticated" && !auth.logoutPending;

  function close() {
    search.delete("chat");
    navigate({ pathname: location.pathname, search: search.size ? `?${search}` : "", hash: location.hash },
      { replace: true, preventScrollReset: true, state: location.state });
  }

  return <Modal open={open} onClose={close} title="모임 채팅" closeLabel="채팅 닫기"
    closeAction="chat_dismiss" panelClassName="chat-modal">
    <Suspense fallback={<p className="chat-modal__loading" role="status">대화를 불러오는 중이에요</p>}>
      <ChatContent roomId={selected === "inbox" ? undefined : selected} />
    </Suspense>
  </Modal>;
}
