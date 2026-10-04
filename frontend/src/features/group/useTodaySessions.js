import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { groupKeys } from "./hooks.js";
import { fetchTodaySessions, getSeoulDate } from "./todaySessions.js";

export function useTodaySessions() {
  const [date, setDate] = useState(getSeoulDate);

  useEffect(() => {
    const refreshDate = () => setDate(getSeoulDate());
    const timer = window.setInterval(refreshDate, 30_000);
    window.addEventListener("focus", refreshDate);
    document.addEventListener("visibilitychange", refreshDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshDate);
      document.removeEventListener("visibilitychange", refreshDate);
    };
  }, []);

  const query = useQuery({
    queryKey: [...groupKeys.lists(), "today", date],
    queryFn: () => fetchTodaySessions(date),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false
  });

  return { ...query, date };
}
