import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createRoomConnection } from "./connection.js";
import { createRoomStore } from "./roomStore.js";

export function useRoomRealtime({ groupId, memberId, enabled, layoutRevision, onLayoutChange }) {
  const runtime = useMemo(() => {
    const store = createRoomStore();
    const connection = createRoomConnection({ groupId, store });
    return { memberId, store, connection };
  }, [groupId, memberId]);
  const status = useSyncExternalStore(runtime.store.subscribeStatus, runtime.store.getStatus, runtime.store.getStatus);
  useEffect(() => {
    if (!enabled || !memberId) return undefined;
    runtime.connection.start();
    return () => runtime.connection.stop();
  }, [runtime, enabled, memberId]);
  useEffect(() => { runtime.connection.setLayoutRevision(layoutRevision); }, [runtime, layoutRevision]);
  useEffect(() => {
    if (status.layoutRevision !== null && status.layoutRevision > layoutRevision) onLayoutChange?.(status.layoutRevision);
  }, [status.layoutRevision, layoutRevision, onLayoutChange]);
  return { runtime, status };
}
