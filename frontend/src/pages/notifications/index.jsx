import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAuth } from "../../features/auth";
import { fetchGroup } from "../../features/group/api";
import { NotificationInbox } from "../../features/notifications/NotificationInbox";
import { fetchNotification, notificationTargetPath, readNotification } from "../../features/notifications/api";
import { useNotificationScope } from "../../features/notifications/hooks";
import { Button, PageContainer } from "../../shared/ui";

export function NotificationsPage() {
  const { key } = useNotificationScope();
  return <PageContainer><section className="notification-page"><h1>알림함</h1><NotificationInbox headingLevel={2} key={key.join(":")} /></section></PageContainer>;
}
export function NotificationOpenPage() {
  const { id } = useParams();
  const [readRetry, setReadRetry] = useState(0);
  const navigate = useNavigate();
  const client = useQueryClient();
  const scope = useNotificationScope();
  const { member } = useAuth();
  const validId = /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
  const query = useQuery({ queryKey: [...scope.key, "open", id], enabled: scope.enabled && validId,
    queryFn: async ({ signal }) => {
      const notification = await fetchNotification(id, undefined, signal);
      const { kind, groupId } = notification.target;
      if (kind !== "MY_PAGE" && kind !== "MY_REGISTRATIONS" && kind !== "MY_GROUPS") {
        const group = await fetchGroup(groupId);
        if ((kind === "LEADER_REGISTRATIONS" || kind === "LEADER_MEMBERS") && group.leader.memberId !== member?.id) {
          throw Object.assign(new Error("Leader access required"), { status: 403 });
        }
      }
      return notification;
    }, retry: false, staleTime: 0 });
  const read = useMutation({ mutationFn: () => readNotification(id) });
  const { mutate } = read;
  useEffect(() => {
    if (!query.data || !scope.enabled) return;
    let current = true;
    mutate(undefined, { onSuccess: async () => {
      if (!current) return;
      await Promise.all([
        client.invalidateQueries({ queryKey: [...scope.key, "list"] }),
        client.invalidateQueries({ queryKey: [...scope.key, "count"] }),
        client.invalidateQueries({ queryKey: ["groups", "list"] }),
        client.invalidateQueries({ queryKey: ["registrations", "my"] })
      ]);
      if (current) navigate(notificationTargetPath(query.data.target, id), { replace: true });
    } });
    return () => { current = false; };
  }, [client, mutate, navigate, query.data, scope.enabled, scope.key, readRetry, id]);
  const error = query.error ?? read.error;
  return <PageContainer><section className="notification-page">
    <h1>알림 확인</h1>
    {!validId || error ? <>
      <p role="alert">{error?.status === 403 || error?.status === 404 || !validId
        ? "이 알림을 확인할 수 없어요. 삭제되었거나 접근 권한이 변경되었을 수 있어요."
        : "알림을 확인하지 못했어요. 다시 시도해 주세요."}</p>
      {validId && error?.status !== 403 && error?.status !== 404 ? <Button data-ph-capture-attribute-action="notification_open_retry" onClick={() => { if (query.error) void query.refetch(); else setReadRetry((value) => value + 1); }}>다시 시도</Button> : null}
      <Link data-ph-capture-attribute-action="notification_inbox_return" to="/notifications">알림함으로 돌아가기</Link>
    </> : <p role="status">알림을 확인하고 관련 화면으로 이동하고 있어요…</p>}
  </section></PageContainer>;
}
