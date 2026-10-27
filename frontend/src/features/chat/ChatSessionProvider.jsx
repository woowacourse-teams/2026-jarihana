import { createContext, useCallback, useContext, useState } from "react";
import { useAuth } from "../auth";
import { useChat } from "./hooks";

const ChatSessionContext = createContext(null);

export function ChatSessionProvider({ children }) {
  const auth = useAuth();
  if (auth.status !== "authenticated" || auth.logoutPending || auth.member?.id == null) {
    return <ChatSessionContext.Provider value={null}>{children}</ChatSessionContext.Provider>;
  }
  return <AuthenticatedChatSession key={`${auth.member.id}:${auth.sessionVersion}`}>{children}</AuthenticatedChatSession>;
}

function AuthenticatedChatSession({ children }) {
  const [roomId, selectRoom] = useState(undefined);
  const chat = useChat(roomId);
  const [viewing, setViewing] = useState(null);
  const onViewingLatestChange = useCallback((id, latest) => {
    setViewing((current) => current?.id === id && current.latest === latest ? current : { id, latest });
  }, []);
  return <ChatSessionContext.Provider value={{ chat, roomId, selectRoom, viewing, onViewingLatestChange }}>
    {children}
  </ChatSessionContext.Provider>;
}

export function useChatSession() {
  return useContext(ChatSessionContext);
}
