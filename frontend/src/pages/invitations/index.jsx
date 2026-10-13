import { Link, useLocation, useNavigate, useParams } from "react-router";
import { isInvitationId, isInvitationToken } from "../../entities/invitation";
import { storeReturnTarget, useAuth } from "../../features/auth";
import { useAcceptInvitation, useDeclineInvitation, useInvitation } from "../../features/invitation/hooks";
import { Button, Card, ConfirmDialog, ErrorState, ForbiddenState, NotFoundState, PageContainer, PageHeader, Skeleton, StatusBadge } from "../../shared/ui";
import "./invitation.css";

const statusCopy = {
  VALID: "수락할 수 있는 초대",
  ACCEPTED: "이미 수락된 초대",
  REJECTED: "거절한 초대",
  EXPIRED: "만료된 초대",
  CANCELED: "취소된 초대",
  GROUP_ENDED: "종료된 모임"
};
const unavailableCopy = {
  REJECTED: "거절한 초대장입니다.",
  EXPIRED: "초대가 만료되었어요. 모임 구성원에게 새 초대를 요청해 주세요.",
  CANCELED: "취소된 초대예요. 모임 구성원에게 새 초대를 요청해 주세요.",
  GROUP_ENDED: "종료된 모임에는 합류할 수 없어요."
};
function RetryButton({ onClick }) {
  return <Button data-ph-capture-attribute-action="invitation_retry" onClick={onClick} variant="secondary">다시 시도</Button>;
}
function GroupLink({ groupId }) {
  return <Link className="ui-button ui-button--primary ui-button--md" data-ph-capture-attribute-action="invitation_group_view" to={`/groups/${groupId}`}>모임으로 이동</Link>;
}
function InvitationContent({ invitationId, token }) {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const query = useInvitation({ invitationId, token });
  const acceptance = useAcceptInvitation();
  const decline = useDeclineInvitation();
  const [declineOpen, setDeclineOpen] = useState(false);
  const valid = token !== undefined ? isInvitationToken(token) : isInvitationId(invitationId);
  const authenticated = auth.status === "authenticated";
  const error = acceptance.error ?? query.error;
  const recoverAuth = () => {
    storeReturnTarget(location.pathname);
    if (auth.status === "signup-required") navigate("/signup");
    else auth.login();
  };
  const authAction = <Button data-ph-capture-attribute-action={auth.status === "signup-required" ? "invitation_signup" : "invitation_login"} onClick={recoverAuth}>
    {auth.status === "signup-required" ? "회원가입 이어하기" : "GitHub로 로그인"}
  </Button>;
  if (!valid) return <NotFoundState title="유효하지 않은 초대예요" description="초대 주소를 다시 확인해 주세요." />;
  if (auth.status === "loading") return <Skeleton aria-label="회원 상태 확인 중" />;
  if (auth.status === "unavailable") return <ErrorState title="로그인 상태를 확인하지 못했어요" action={<RetryButton onClick={() => void auth.retry()} />} />;
  if (token === undefined && !authenticated) return <Card className="invitation-card">
    <p>이 초대는 지정된 회원만 확인하고 수락할 수 있어요.</p>
    <p>로그인·회원가입 후 초대장으로 돌아와 수락해 주세요.</p>
    {authAction}
  </Card>;
  if (acceptance.data) return <Card className="invitation-card">
    <p role="status">{acceptance.data.result === "JOINED" ? "초대를 수락해 모임에 합류했어요." : "이미 참여 중인 모임이에요."}</p>
    <GroupLink groupId={acceptance.data.groupId} />
  </Card>;
  if (error?.status === 403) return <ForbiddenState title="이 계정으로는 초대를 수락할 수 없어요" description="초대를 받은 계정인지 확인해 주세요." />;
  if (error?.status === 404 || error?.code === "INVALID_PARAMETER") return <NotFoundState title="유효하지 않은 초대예요" description="초대가 삭제되었거나 주소가 잘못되었을 수 있어요." />;
  if (error?.status === 401) return <ErrorState title="로그인이 다시 필요해요" description="로그인 후 초대장으로 돌아와 수락해 주세요." action={authAction} />;
  if (query.isPending) return <Skeleton aria-label="초대장 불러오는 중" />;
  if (!query.data) return <ErrorState title="초대장을 불러오지 못했어요" action={<RetryButton onClick={() => void query.refetch()} />} />;
  const invitation = query.data;
  const unavailable = unavailableCopy[invitation.status];
  const blockedError = {
    INVITATION_EXPIRED: unavailableCopy.EXPIRED,
    INVITATION_CANCELED: unavailableCopy.CANCELED,
    INVITATION_REJECTED: unavailableCopy.REJECTED,
    GROUP_ENDED: unavailableCopy.GROUP_ENDED
  }[error?.code];
  return <Card as="section" className="invitation-card" data-ph-private>
    {invitation.status !== "VALID" ? <StatusBadge tone="neutral">{statusCopy[invitation.status]}</StatusBadge> : null}
    <h2>{invitation.group.name}</h2>
    <p className="invitation-card__intro">{invitation.group.introduction}</p>
    <dl className="invitation-card__meta">
      <div><dt>초대한 사람</dt><dd>{invitation.inviter.crewName}</dd></div>
      <div><dt>유효 기간</dt><dd>{invitation.expiresAt ? `${invitation.expiresAt.replace("T", " ").slice(0, 16)}까지 (한국 시간)` : "만료일 없음"}</dd></div>
    </dl>
    {error ? <p role="alert">{blockedError ?? (error.code === "CONCURRENT_MODIFICATION" ? "요청이 겹쳐 수락하지 못했어요. 다시 시도해 주세요." : "수락하지 못했어요. 연결을 확인하고 다시 시도해 주세요.")}</p> : null}
    {unavailable || blockedError ? <p role="status">{unavailable ?? blockedError}</p>
      : invitation.status === "ACCEPTED" || (authenticated && !invitation.canAccept) ? <>
        <p role="status">{invitation.status === "ACCEPTED" ? "이미 수락된 초대예요." : "이미 참여 중인 모임이에요."}</p>
        <GroupLink groupId={invitation.group.id} />
      </> : !authenticated ? <>
        <p>로그인·회원가입 후 이 초대장으로 돌아와 수락해 주세요.</p>{authAction}
      </> : <>
        <p>수락하면 별도의 가입 신청 없이 모임에 바로 합류해요.</p>
        <div className="invitation-card__actions">
          {invitation.type === "DIRECT" ? <Button data-ph-capture-attribute-action="invitation_decline" disabled={acceptance.isPending || decline.isPending} onClick={() => setDeclineOpen(true)} variant="secondary">거절</Button> : null}
          <Button data-ph-capture-attribute-action="invitation_accept" disabled={decline.isPending} onClick={() => acceptance.mutate({ invitationId: invitation.id, token })} pending={acceptance.isPending} pendingLabel="수락 중">수락</Button>
        </div>
        <ConfirmDialog open={declineOpen} onClose={() => setDeclineOpen(false)} title="초대를 거절하시겠어요?"
          description="거절해도 모임장에게 알림이 가지 않아요. 거절한 초대장은 다시 수락할 수 없어요. 정말 거절하시겠어요?"
          actionsClassName="invitation-decline-actions"
          cancelLabel="취소" confirmLabel="거절" cancelAction="invitation_decline_cancel"
          closeAction="invitation_decline_close" confirmAction="invitation_decline_confirm" pending={decline.isPending}
          onConfirm={async () => {
            await decline.mutateAsync({ invitationId: invitation.id });
          }} />
      </>}
  </Card>;
}
export function InvitationPage() {
  const params = useParams();
  const { member, sessionVersion = 0, status } = useAuth();
  return <PageContainer className="invitation-page">
    <PageHeader title="모임 초대장" />
    <InvitationContent key={`${params.invitationId ?? params.token}:${member?.id ?? "guest"}:${sessionVersion}:${status}`} {...params} />
  </PageContainer>;
}
import { useState } from "react";
