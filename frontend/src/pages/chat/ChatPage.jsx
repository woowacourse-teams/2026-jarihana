import { useRef, useState } from "react";
import { Navigate, useParams } from "react-router";
import { MessageCircle } from "lucide-react";
import { useAuth } from "../../features/auth";
import { useChatSession } from "../../features/chat/ChatSessionProvider";
import { ChatLink, chatLocation } from "../../features/chat/ChatLink";
import { ChatConversation } from "./ChatConversation";
import { ChatRoomList } from "./ChatRoomList";
import { ChatSidebarResizer } from "./ChatSidebarResizer";
import { GroupImage } from "../../shared/ui";
import "./chat.css";

export function ChatPage() {
  const { roomId } = useParams();
  return <Navigate replace to={chatLocation({ pathname: "/home", search: "", hash: "" }, roomId)} />;
}

export function ChatContent({ roomId }) {
  const auth = useAuth();
  const session = useChatSession();
  if (auth.logoutPending) return <p role="status">채팅 연결을 정리하고 있어요.</p>;
  if (!session?.chat) return <p role="status">대화를 불러오는 중이에요.</p>;
  return <ChatSession key={`${auth.member.id}:${auth.sessionVersion}`} roomId={roomId} />;
}

function ChatSession({ roomId }) {
  const { member } = useAuth();
  const { chat, roomId: activeRoomId, viewing, onViewingLatestChange } = useChatSession();
  const [drafts, setDrafts] = useState({});
  const [sidebarWidth, setSidebarWidth] = useState(null);
  const layoutRef = useRef(null);
  const rooms = (chat.rooms.data ?? []).map((room) => ({ ...room, id: room.groupId }));
  const selected = rooms.find((room) => room.id === roomId);
  const room = selected && activeRoomId === roomId && chat.history.data && !chat.history.isError ? {
    ...selected, status: chat.history.data.status,
    messages: chat.history.data.items.map((message) => ({ ...message, at: message.createdAt, text: message.content, mine: message.senderId === String(member.id) }))
  } : null;
  function send() {
    const content = drafts[roomId] ?? "";
    if (!content.trim() || content.length > 2000 || !room || room.status === "ENDED") return;
    setDrafts((old) => ({ ...old, [roomId]: "" }));
    void chat.send(content);
  }
  return <div className={`chat-layout${roomId ? " chat-layout--room" : ""}`} ref={layoutRef}
    style={sidebarWidth === null ? undefined : { "--chat-list-resized-width": `${sidebarWidth}px` }} data-ph-private>
    <ChatRoomList rooms={rooms} selectedId={roomId} viewingLatest={viewing?.id === roomId && viewing?.latest} loading={chat.rooms.isPending} error={chat.rooms.isError} onRetry={chat.sync} />
    <ChatSidebarResizer layoutRef={layoutRef} onResize={setSidebarWidth} />
    <div className="chat-panel">
    {room ? <ChatConversation key={roomId} room={room} draft={drafts[roomId] ?? ""}
      onDraftChange={(value) => setDrafts((old) => ({ ...old, [roomId]: value }))}
      onSend={send} onViewingLatestChange={onViewingLatestChange} onRetry={(message) => chat.send(message.content, message)} onRead={chat.read}
      hasOlder={chat.history.data.hasNext} loadingHistory={chat.loadingHistory} onLoadOlder={chat.loadOlder}
      syncCursor={chat.history.data.syncCursor} connection={chat.connection} error={chat.actionError} /> :
      <section className="chat-welcome" aria-label="대화 선택">
        {rooms.length > 0 && !roomId ? <div className="chat-welcome__photos" aria-hidden="true">{rooms.slice(0, 3).map((item) => <GroupImage key={item.id} group={item} alt="" width="112" height="112" />)}</div> : <span className="chat-welcome__icon"><MessageCircle aria-hidden="true" /></span>}
        <h2>{chat.rooms.isPending || (selected && chat.history.isPending) ? "대화를 불러오는 중이에요" : chat.rooms.isError || chat.history.isError ? "대화를 불러오지 못했어요" : roomId ? "이 채팅방을 찾을 수 없어요" : rooms.length ? "대화할 모임을 선택해 주세요" : "참여 중인 모임이 없어요"}</h2>
        {(chat.rooms.isError || chat.history.isError) && <button className="ui-button ui-button--secondary" type="button" data-ph-capture-attribute-action="chat_refresh" onClick={chat.sync}>다시 불러오기</button>}
        {roomId && <ChatLink data-ph-capture-attribute-action="chat_list_back">채팅 목록으로</ChatLink>}
      </section>}
    </div>
  </div>;
}
