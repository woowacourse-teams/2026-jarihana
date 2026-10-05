import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "../auth";
import { disarmPush, pushEnvironment, syncBrowserPush } from "../push/browser";

export function NotificationSessionBoundary() {
  const { member, sessionVersion = 0, status } = useAuth();
  const client = useQueryClient();
  useEffect(() => {
    const previousSession = (query) => query.queryKey[0] === "notifications"
      && (query.queryKey[1] !== member?.id || query.queryKey[2] !== sessionVersion);
    void client.cancelQueries({ predicate: previousSession });
    client.removeQueries({ predicate: previousSession });
  }, [client, member?.id, sessionVersion, status]);
  useEffect(() => {
    const environment = pushEnvironment();
    if (status === "anonymous") {
      void disarmPush(null).catch(() => undefined);
      return undefined;
    }
    if (status !== "authenticated" || !environment.supported || environment.installRequired) return undefined;
    const sync = () => { void syncBrowserPush(member.id).catch(() => undefined); };
    sync();
    const changed = (event) => {
      if (event.data?.type === "PUSH_STATE_CHANGED") {
        void client.invalidateQueries({ queryKey: ["notifications", member.id, sessionVersion, "count"] });
      }
    };
    window.addEventListener("focus", sync);
    navigator.serviceWorker.addEventListener("message", changed);
    return () => { window.removeEventListener("focus", sync); navigator.serviceWorker.removeEventListener("message", changed); };
  }, [client, member?.id, sessionVersion, status]);
  return null;
}
