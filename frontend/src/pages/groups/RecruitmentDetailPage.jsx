import { useState } from "react";
import { Link, useParams } from "react-router";

import { useAuth } from "../../features/auth/index.js";
import { useRecruitment } from "../../features/recruitment/index.js";
import { useCreateRegistration } from "../../features/registration/index.js";
import { toUserMessage } from "../../shared/api/index.js";
import {
  Button,
  ConfirmDialog,
  ErrorState,
  PageContainer,
  Skeleton,
  StatusBadge,
  Textarea
} from "../../shared/ui/index.js";
import {
  formatLocalDateTime,
  publicErrorCopy,
  recruitmentStatusLabel,
  statusTone
} from "./pageUtils.js";
import "./groups.css";

export function RecruitmentDetailPage() {
  const { groupId, recruitmentId } = useParams();
  const auth = useAuth();
  const query = useRecruitment(groupId, recruitmentId);
  const registration = useCreateRegistration(recruitmentId);
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const isAuthenticated = auth.status === "authenticated" || auth.isAuthenticated;
  const recruitment = query.data;

  async function submitRegistration() {
    await registration.mutateAsync({ message: message.trim() || null });
    setConfirmOpen(false);
    setSubmitted(true);
  }

  if (query.isLoading) {
    return (
      <PageContainer>
        <Skeleton className="recruitment-detail-skeleton" />
      </PageContainer>
    );
  }
  if (query.isError || !recruitment) {
    const copy = publicErrorCopy(query.error, "모집");
    return (
      <PageContainer>
        <ErrorState
          title={copy.title}
          description={copy.description}
          action={
            copy.retryable ? (
              <Button onClick={() => query.refetch?.()}>다시 시도</Button>
            ) : (
              <Link
                className="ui-button ui-button--primary ui-button--md"
                to={`/groups/${groupId}`}
              >
                <span>모임으로 돌아가기</span>
              </Link>
            )
          }
        />
      </PageContainer>
    );
  }

  const isOpen = ["OPEN", "ALWAYS_OPEN"].includes(recruitment.recruitingStatus);

  return (
    <PageContainer className="recruitment-detail-page">
      <Link className="group-back" to={`/groups/${groupId}`}>
        ← 모임으로 돌아가기
      </Link>
      <div className="recruitment-detail-grid">
        <div>
          <div className="recruitment-heading">
            <StatusBadge tone={statusTone(recruitment.recruitingStatus)}>
              {recruitmentStatusLabel(recruitment.recruitingStatus)}
            </StatusBadge>
            <h1>{recruitment.group.name} 모집</h1>
            <p>
              {recruitment.joinMethod === "AUTO"
                ? "신청 즉시 함께할 수 있어요."
                : "운영자 승인 후 함께할 수 있어요."}
            </p>
          </div>
          <section
            className="recruitment-information"
            aria-labelledby="recruitment-information-title"
          >
            <h2 id="recruitment-information-title">모집 정보</h2>
            <dl>
              <div>
                <dt>모집 기간</dt>
                <dd>
                  {formatLocalDateTime(recruitment.startsAt)} –{" "}
                  {formatLocalDateTime(recruitment.endsAt)}
                </dd>
              </div>
              <div>
                <dt>모집 인원</dt>
                <dd>
                  {recruitment.approvedCount}/{recruitment.capacity}명
                </dd>
              </div>
              <div>
                <dt>남은 자리</dt>
                <dd>{recruitment.remainingSeats}자리</dd>
              </div>
              <div>
                <dt>가입 방식</dt>
                <dd>{recruitment.joinMethod === "AUTO" ? "자동 가입" : "승인 가입"}</dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className="application-panel" aria-labelledby="application-title">
          <h2 id="application-title">가입 신청</h2>
          {!isOpen && <p className="application-closed">모집이 마감되었어요</p>}
          {isOpen && submitted && (
            <div className="application-success" role="status">
              <strong>신청을 보냈어요.</strong>
              <p>
                {recruitment.joinMethod === "AUTO"
                  ? "바로 모임 멤버가 되었어요."
                  : "운영자의 확인을 기다려주세요."}
              </p>
            </div>
          )}
          {isOpen && !submitted && !isAuthenticated && (
            <div className="application-login">
              <p>로그인하면 이 모집에 신청할 수 있어요.</p>
              <Button onClick={() => auth.login?.()}>GitHub로 로그인</Button>
            </div>
          )}
          {isOpen && !submitted && isAuthenticated && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setConfirmOpen(true);
              }}
            >
              <Textarea
                label="가입 신청 메시지"
                value={message}
                maxLength={1000}
                rows={7}
                onChange={(event) => setMessage(event.target.value)}
                description={`${message.length}/1000자 · 운영자에게 전하고 싶은 내용을 적어주세요.`}
              />
              {registration.error && (
                <p className="application-error" role="alert">
                  {registration.error.code
                    ? toUserMessage(registration.error.code)
                    : "신청을 보내지 못했어요. 다시 시도해주세요."}
                </p>
              )}
              <Button type="submit" variant="primary" pending={registration.isPending}>
                가입 신청하기
              </Button>
            </form>
          )}
        </aside>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="가입 신청을 보낼까요?"
        description="작성한 메시지와 함께 운영자에게 신청이 전달됩니다."
        confirmLabel="신청 확정"
        onClose={() => setConfirmOpen(false)}
        onConfirm={submitRegistration}
        pending={registration.isPending}
      />
    </PageContainer>
  );
}
