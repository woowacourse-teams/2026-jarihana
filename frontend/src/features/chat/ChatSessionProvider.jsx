import { createContext, memo, useCallback, useContext, useLayoutEffect, useState } from "react";
import { useAuth } from "../auth";
import { useChat } from "./hooks";

const ChatSessionContext = createContext(null);

export function ChatSessionProvider({ children }) {
  const auth = useAuth();
  const sessionKey = auth.status === "authenticated" && !auth.logoutPending && auth.member?.id != null
    ? `${auth.member.id}:${auth.sessionVersion}` : null;
  const [roomId, selectRoom] = useState(undefined);
  const [chatState, setChatState] = useState(null);
  const [viewing, setViewing] = useState(null);
  const onViewingLatestChange = useCallback((id, latest) => {
    setViewing((current) => current?.sessionKey === sessionKey && current.id === id && current.latest === latest
      ? current : { sessionKey, id, latest });
  }, [sessionKey]);
  if (chatState && chatState.sessionKey !== sessionKey) {
    setChatState(null);
    setViewing(null);
  }
  const value = sessionKey ? {
    chat: chatState?.sessionKey === sessionKey ? chatState.chat : null,
    roomId, selectRoom, viewing: viewing?.sessionKey === sessionKey ? viewing : null, onViewingLatestChange
  } : null;
  return <ChatSessionContext.Provider value={value}>
    {sessionKey && <AuthenticatedChatSession key={sessionKey} sessionKey={sessionKey} roomId={roomId} setChatState={setChatState} />}
    {children}
  </ChatSessionContext.Provider>;
}

const AuthenticatedChatSession = memo(function AuthenticatedChatSession({ sessionKey, roomId, setChatState }) {
  const chat = useChat(roomId);
  useLayoutEffect(() => { setChatState({ sessionKey, chat }); });
  return null;
});

export function useChatSession() {
  return useContext(ChatSessionContext);
}
