import { useEffect, useRef, useState } from "react";
import { ChatLink } from "../../features/chat/ChatLink";
import { LockKeyhole, Search } from "lucide-react";
import { GroupImage } from "../../shared/ui";

import { messageTime } from "./format.js";

export function ChatRoomList({ rooms, selectedId, loading, error, onRetry }) {
  const [search, setSearch] = useState("");
  const previousRoom = useRef(selectedId);
  const listRef = useRef(null);
  const visibleRooms = rooms.filter((room) => room.name.includes(search.trim()));

  useEffect(() => {
    if (!selectedId && previousRoom.current) {
      const links = listRef.current?.querySelectorAll("a");
      [...(links ?? [])].find((link) => link.dataset.roomId === previousRoom.current)?.focus();
    }
    previousRoom.current = selectedId;
  }, [selectedId]);

  return (
    <aside aria-label="모임 채팅 목록" className="chat-sidebar" id="chat-sidebar">
      <div className="chat-sidebar__heading">
        <div>
          <h1>채팅</h1>
        </div>
      </div>
      <div className="chat-search">
        <label className="ui-sr-only" htmlFor="chat-room-search">
          모임 검색
        </label>
        <Search aria-hidden="true" />
        <input
          id="chat-room-search"
          type="search"
          placeholder="모임 검색"
          value={search}
          data-ph-capture-attribute-action="chat_room_search"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="chat-sidebar__section">
        <h2>내 모임</h2>
        <span>{rooms.length}</span>
      </div>
      <nav aria-label="내 모임 대화" className="chat-room-scroll" ref={listRef}>
        <ul className="chat-room-list">
          {visibleRooms.map((room) => {
            const last = room.lastMessage;
            return (
              <li key={room.id}>
                <ChatLink
                  aria-current={selectedId === room.id ? "page" : undefined}
                  className={`chat-room-row chat-room-row--${room.type.toLowerCase()}${room.status === "ENDED" ? " chat-room-row--ended" : ""}`}
                  roomId={room.id}
                  data-room-id={room.id}
                  data-ph-capture-attribute-action="chat_room_open"
                >
                  <span className="chat-room-row__cover"><GroupImage group={room} alt="" width="64" height="64" loading="lazy" /></span>
                  <div className="chat-room-row__body">
                    <div className="chat-room-row__title">
                      <strong>{room.name}</strong>
                      {last && <time dateTime={last.createdAt}>{messageTime(last.createdAt)}</time>}
                    </div>
                    <div className="chat-room-row__preview">
                      <p>{last?.content ?? "첫 이야기를 나눠보세요"}</p>
                      {room.unreadCount > 0 && <span className="chat-unread" aria-label={`안 읽은 메시지 ${room.unreadCount}개`}>{room.unreadCount > 99 ? "99+" : room.unreadCount}</span>}
                    </div>
                    <span className="chat-room-row__meta">
                      {room.status === "ENDED" ? <span className="chat-room-ended"><LockKeyhole aria-hidden="true" />종료</span> : <><span className="chat-room-type">{room.type === "SESSION" ? "같이해요" : room.type === "STUDY" ? "스터디" : "동아리"}</span><span>참여자 {room.memberCount}명</span></>}
                    </span>
                  </div>
                </ChatLink>
              </li>
            );
          })}
        </ul>
        {visibleRooms.length === 0 && (
          <div className="chat-search-empty" role="status">
            <Search aria-hidden="true" />
            <p>{loading ? "대화를 불러오는 중이에요" : error ? "연결을 확인해 주세요" : "찾는 모임이 없어요"}</p>
            <span>{loading || error ? "잠시 후 자동으로 갱신해요." : "다른 이름으로 검색해 보세요."}</span>
          </div>
        )}
      </nav>
      {error && <button type="button" data-ph-capture-attribute-action="chat_list_retry" onClick={onRetry}>목록 다시 불러오기</button>}
    </aside>
  );
}
