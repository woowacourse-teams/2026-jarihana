import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useAuth } from "../../features/auth";
import { fetchGroup } from "../../features/group/api";
import { fetchRecruitment } from "../../features/recruitment/api";
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
  const { member } = useAuth();
  const [readRetry, setReadRetry] = useState(0);
  const navigate = useNavigate();
  const client = useQueryClient();
  const scope = useNotificationScope();
  const validId = /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
  const query = useQuery({ queryKey: [...scope.key, "open", id], enabled: scope.enabled && validId,
    queryFn: async ({ signal }) => {
      const notification = await fetchNotification(id, undefined, signal);
      const group = await fetchGroup(notification.target.groupId);
      await fetchRecruitment(notification.target.groupId, notification.target.recruitmentId);
      if (notification.target.kind === "LEADER_REGISTRATIONS" && group.leader.memberId !== member.id) {
        throw Object.assign(new Error("알림 대상의 접근 권한이 변경되었어요."), { status: 403 });
      }
      return notification;
    }, retry: false, staleTime: 0 });
  const read = useMutation({ mutationFn: () => readNotification(id) });
  const { mutate } = read;
  useEffect(() => {
    if (!query.data || !scope.enabled) return;
    let current = true;
    mutate(undefined, { onSuccess: () => {
      if (!current) return;
      void client.invalidateQueries({ queryKey: scope.key });
      navigate(notificationTargetPath(query.data.target), { replace: true });
    } });
    return () => { current = false; };
  }, [client, mutate, navigate, query.data, scope.enabled, scope.key, readRetry]);
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
