import { useEffect, useRef } from "react";

export function positiveFocusId(value) {
  return /^[1-9]\d*$/.test(value ?? "") && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

export function useNotificationFocus({ requested, item, query }) {
  const pending = useRef(false);
  useEffect(() => {
    if (!requested || item || query.isLoading || query.isFetching || query.isError || !query.hasNextPage || pending.current) return;
    pending.current = true;
    Promise.resolve(query.fetchNextPage()).catch(() => undefined).finally(() => { pending.current = false; });
  }, [requested, item, query]);
  if (!requested) return null;
  if (item) return "found";
  if (query.isError) return "error";
  if (query.isLoading || query.isFetching || query.hasNextPage) return "loading";
  return "missing";
}
