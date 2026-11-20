import { useEffect, useState } from "react";
import "./room-connection-toast.css";

export function RoomConnectionToast({ status, layoutPending = false, layoutError }) {
  const [previous, setPrevious] = useState(status.status);
  const [recovered, setRecovered] = useState(false);
  if (previous !== status.status) {
    setPrevious(status.status);
    setRecovered(status.status === "connected" && previous === "reconnecting");
  }
  useEffect(() => {
    if (!recovered) return undefined;
    const timer = setTimeout(() => setRecovered(false), 3500);
    return () => clearTimeout(timer);
  }, [recovered]);

  let message = "";
  if (status.status === "error") message = status.error?.message || "아지트에 연결하지 못했어요.";
  else if (status.status === "reconnecting") message = "연결이 잠시 끊겼어요 · 자동으로 다시 연결 중";
  else if (status.status === "syncing") message = "아지트 상태를 맞추고 있어요";
  else if (status.status === "connecting") message = "아지트에 연결 중";
  else if (layoutPending) message = "새 가구 배치를 불러오는 중";
  else if (layoutError) message = layoutError;
  else if (recovered) message = "다시 연결됐어요";
  return <div className="room-connection-toast" role="status" aria-live="polite" aria-atomic="true"
    data-visible={Boolean(message)} data-state={status.status}>
    {message && <><span className="room-connection-toast__dot" aria-hidden="true" /><span>{message}</span></>}
  </div>;
}
