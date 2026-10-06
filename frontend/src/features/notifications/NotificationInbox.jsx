import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Button, Drawer } from "../../shared/ui";
import { PushSettings } from "../push/PushSettings";
import { deleteNotification, readAllNotifications } from "./api";
import { useNotificationList, useNotificationScope, useUnreadCount } from "./hooks";
import "./notifications.css";

function timestamp(value) {
  const date = new Date(`${value}+09:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "numeric", minute: "2-digit"
  }).format(date);
}
function NotificationRow({ item, onDeleted, onBusy, onFocusNext, onOpenNotification }) {
  const row = useRef(null);
  const [exiting, setExiting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!exiting) return undefined;
    const timer = setTimeout(() => onDeleted(item.id), window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 240);
    return () => clearTimeout(timer);
  }, [exiting, item.id, onDeleted]);
  async function remove() {
    if (pending || exiting) return;
    const ownedFocus = row.current?.contains(document.activeElement);
    setPending(true); setError(false); onBusy(true);
    try {
      await deleteNotification(item.id);
      onFocusNext(row.current, ownedFocus);
      setExiting(true);
    } catch { setError(true); setPending(false); onBusy(false); }
  }
  return (
    <li className={`notification-row${item.readAt ? " notification-row--read" : ""}${exiting ? " notification-row--exiting" : ""}`} ref={row}>
      <Link className="notification-row__link" data-ph-capture-attribute-action="notification_open"
        aria-disabled={exiting || undefined} tabIndex={exiting ? -1 : undefined} to={`/notifications/open/${item.id}`}
        onClick={(event) => {
          if (exiting) { event.preventDefault(); return; }
          if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onOpenNotification?.();
        }}>
        <span className="notification-row__status ui-sr-only">{item.readAt ? "읽음" : "안 읽음"}</span>
        <strong>{item.title}</strong><span>{item.body}</span><time dateTime={`${item.createdAt}+09:00`}>{timestamp(item.createdAt)}</time>
      </Link>
      <button aria-label={`${item.title} 알림 삭제`} className="notification-row__delete" data-ph-capture-attribute-action="notification_delete"
        disabled={pending || exiting} onClick={() => void remove()} type="button"><Trash2 aria-hidden="true" /></button>
      {pending && !exiting ? <p role="status">삭제 중…</p> : null}
      {error ? <p className="notification-error" role="alert">삭제하지 못했어요. 삭제 버튼으로 다시 시도해 주세요.</p> : null}
    </li>
  );
}
export function NotificationInbox({ headingLevel = 3, onOpenNotification }) {
  const Heading = `h${headingLevel}`;
  const client = useQueryClient();
  const scope = useNotificationScope();
  const [busyRows, setBusyRows] = useState(0);
  const list = useNotificationList(busyRows > 0);
  const count = useUnreadCount();
  const heading = useRef(null);
  const readAll = useMutation({ mutationFn: readAllNotifications,
    onSuccess: () => client.invalidateQueries({ queryKey: scope.key }) });
  const items = [...new Map((list.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [item.id, item])).values()];
  const seenCursors = list.data?.pageParams ?? [];
  const lastPage = list.data?.pages.at(-1);
  const brokenCursor = lastPage?.hasNext && seenCursors.includes(lastPage.nextCursor);
  const deleted = useCallback((id) => {
    client.setQueryData([...scope.key, "list"], (data) => data ? { ...data,
      pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== id) })) } : data);
    setBusyRows((current) => Math.max(0, current - 1));
    void client.invalidateQueries({ queryKey: scope.key });
  }, [client, scope.key]);
  const focusNext = (row, ownedFocus) => {
    if (!row?.contains(document.activeElement) && !(ownedFocus && document.activeElement === document.body)) return;
    (row.nextElementSibling?.querySelector("a") ?? row.previousElementSibling?.querySelector("a") ?? heading.current)?.focus();
  };
  return (
    <div className="notification-inbox">
      <PushSettings headingLevel={headingLevel} />
      <div className="notification-inbox__toolbar">
        <Heading ref={heading} tabIndex={-1}>받은 알림</Heading>
        <Button data-ph-capture-attribute-action="notification_read_all" disabled={busyRows > 0 || !count.data?.unreadCount}
          onClick={() => readAll.mutate()} pending={readAll.isPending} size="sm" variant="tertiary">전체 읽음</Button>
        <Button data-ph-capture-attribute-action="notification_refresh" disabled={busyRows > 0} onClick={() => void client.invalidateQueries({ queryKey: scope.key })}
          size="sm" variant="tertiary">새로고침</Button>
      </div>
      {readAll.isError ? <p className="notification-error" role="alert">읽음 처리하지 못했어요. 다시 시도해 주세요.</p> : null}
      {list.isPending ? <p role="status">알림을 불러오는 중…</p> : null}
      {list.isError || brokenCursor ? <div role="alert"><p>알림을 불러오지 못했어요.</p>
        <Button data-ph-capture-attribute-action="notification_list_retry" onClick={() => void list.refetch()} variant="secondary">다시 시도</Button></div> : null}
      {list.isSuccess && items.length === 0 ? <div className="notification-empty"><Bell aria-hidden="true" /><p>아직 받은 알림이 없어요.</p><span>모임의 새 소식이 여기에 쌓여요.</span></div> : null}
      <ul aria-label="받은 알림 목록" className="notification-list">
        {items.map((item) => <NotificationRow item={item} key={item.id} onBusy={(busy) => setBusyRows((current) => current + (busy ? 1 : -1))}
          onDeleted={deleted} onFocusNext={focusNext} onOpenNotification={onOpenNotification} />)}
      </ul>
      {list.hasNextPage && !brokenCursor ? <Button data-ph-capture-attribute-action="notification_load_more" disabled={busyRows > 0}
        onClick={() => void list.fetchNextPage()} pending={list.isFetchingNextPage} variant="secondary">더 보기</Button> : null}
      {list.isFetchNextPageError ? <p role="alert">다음 알림을 불러오지 못했어요. 더 보기를 다시 눌러 주세요.</p> : null}
    </div>
  );
}
export function NotificationBellTrigger({ open = false, onClick }) {
  const count = useUnreadCount();
  const unread = count.data?.unreadCount;
  return (
      <button aria-expanded={open} aria-haspopup="dialog" aria-label={`알림함${unread ? `, 안 읽은 알림 ${unread}개` : ""}`}
        className="notification-bell" data-ph-capture-attribute-action="notification_inbox_open" onClick={onClick} type="button">
        <Bell aria-hidden="true" />{unread > 0 ? <span aria-hidden="true" className="notification-bell__count">{unread > 99 ? "99+" : unread}</span> : null}
      </button>
  );
}
export function NotificationDrawer({ open, onOpenChange, onOpenNotification = () => onOpenChange(false) }) {
  const { key } = useNotificationScope();
  return <Drawer closeAction="notification_inbox_close" onOpenChange={onOpenChange} open={open} title="알림함">
    <NotificationInbox key={key.join(":")} onOpenNotification={onOpenNotification} />
  </Drawer>;
}
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <NotificationBellTrigger open={open} onClick={() => setOpen(true)} />
      <NotificationDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
