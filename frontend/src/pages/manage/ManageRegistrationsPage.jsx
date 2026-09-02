import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { useInfiniteRecruitments, useRecruitment } from "../../features/recruitment/index.js";
import {
  useDecideRegistration,
  useInfiniteRegistrations,
  useMarkRegistrationsRead,
  useRegistrationSummary
} from "../../features/registration/index.js";
import {
  Button,
  ConfirmDialog,
  CursorList,
  EmptyState,
  ErrorState,
  Modal,
  Skeleton,
  StatusBadge
} from "../../shared/ui/index.js";
import {
  courseLabel,
  errorView,
  flattenPages,
  formatDateTime,
  statusLabel,
  statusTone
} from "./manageUtils.js";
import { ManagementContext } from "./ManagementContext.jsx";
import "./manage.css";

const filterOptions = [
  ["", "전체"],
  ["PENDING", "대기"],
  ["APPROVED", "승인"],
  ["REJECTED", "거절"]
];

export function ManageRegistrationsPage() {
  const { groupId, recruitmentId: routeRecruitmentId } = useParams();
  const registrationSummaryQuery = useRegistrationSummary(groupId);
  const targetRecruitmentId = registrationSummaryQuery.data?.targetRecruitmentId;
  const recruitmentsQuery = useInfiniteRecruitments(groupId);
  const currentRecruitment = flattenPages(recruitmentsQuery.data).find(
    (recruitment) => recruitment.recruitingStatus !== "CLOSED"
  );
  const recruitmentId = routeRecruitmentId ?? targetRecruitmentId ?? currentRecruitment?.id;
  const [status, setStatus] = useState("");
  const registrationsQuery = useInfiniteRegistrations(recruitmentId, {
    ...(status ? { status } : {})
  });
  const { mutate: markRegistrationsRead } = useMarkRegistrationsRead(recruitmentId);
  const markedRecruitmentRef = useRef(null);
  const decideRegistration = useDecideRegistration(recruitmentId);
  const recruitmentQuery = useRecruitment(groupId, recruitmentId);
  const [decision, setDecision] = useState(null);
  const reasonRef = useRef(null);
  const [mutationError, setMutationError] = useState(null);
  const registrations = flattenPages(registrationsQuery.data);

  useEffect(() => {
    const latestRegistrationId = registrationSummaryQuery.data?.latestRegistrationId;
    const summaryRecruitmentId = registrationSummaryQuery.data?.targetRecruitmentId;
    const showsUnreadTarget =
      summaryRecruitmentId != null && String(summaryRecruitmentId) === String(recruitmentId);
    if (
      String(markedRecruitmentRef.current) === String(recruitmentId) ||
      !registrationsQuery.isSuccess ||
      !latestRegistrationId ||
      !showsUnreadTarget
    ) {
      return;
    }

    markedRecruitmentRef.current = recruitmentId;
    markRegistrationsRead(latestRegistrationId);
  }, [markRegistrationsRead, recruitmentId, registrationSummaryQuery.data, registrationsQuery.isSuccess]);

  if (!routeRecruitmentId && !targetRecruitmentId && recruitmentsQuery.isPending) {
    return <ManageLoading title="신청 관리" />;
  }

  if (!routeRecruitmentId && !targetRecruitmentId && recruitmentsQuery.isError) {
    const view = errorView(recruitmentsQuery.error);
    return (
      <div className="manage-page manage-page--dashboard manage-page--registrations">
        <ManagementContext active="registrations" groupId={groupId} />
        <ErrorState
          action={<Button onClick={() => recruitmentsQuery.refetch()}>다시 시도</Button>}
          description={view.description}
          title={view.title}
        />
      </div>
    );
  }

  if (!recruitmentId) {
    return (
      <div className="manage-page manage-page--dashboard manage-page--registrations">
        <ManagementContext active="registrations" groupId={groupId} />
        <EmptyState
          description="모집 관리에서 새로운 모집을 만들면 신청을 확인할 수 있어요."
          title="현재 진행 중인 모집이 없습니다"
        />
      </div>
    );
  }

  async function confirmDecision() {
    if (!decision) return;
    setMutationError(null);
    const decisionReason =
      decision.status === "REJECTED" ? reasonRef.current?.value.trim() : undefined;

    const payload = {
      registrationId: decision.registration.id,
      status: decision.status,
      ...(decisionReason ? { decisionReason } : {})
    };
    try {
      await decideRegistration.mutateAsync(payload);
      setDecision(null);
      if (reasonRef.current) reasonRef.current.value = "";
    } catch (error) {
      setMutationError(error);
      throw error;
    }
  }

  function closeDialog() {
    if (decideRegistration.isPending) return;
    setDecision(null);
    if (reasonRef.current) reasonRef.current.value = "";
  }

  if (registrationsQuery.isPending) {
    return (
      <div aria-busy="true" className="manage-page">
        <h1>신청 관리</h1>
        <Skeleton count={4} />
      </div>
    );
  }

  if (registrationsQuery.isError) {
    const view = errorView(registrationsQuery.error);
    return (
      <div className="manage-page">
        <ErrorState
          action={<Button onClick={() => registrationsQuery.refetch()}>다시 시도</Button>}
          description={view.description}
          title={view.title}
        />
      </div>
    );
  }

  return (
    <div className="manage-page manage-page--dashboard manage-page--registrations">
      <ManagementContext active="registrations" groupId={groupId} recruitmentId={recruitmentId} />

      {mutationError ? <InlineError error={mutationError} /> : null}
      <div aria-label="신청 관리 대시보드" className="manage-registration-layout" role="region">
        <section aria-labelledby="applicant-list-title" className="manage-applicant-panel">
          <div className="manage-toolbar">
            <div>
              <h2 id="applicant-list-title">신청자 목록</h2>
            </div>
            <div className="manage-status-filters">
              <label className="manage-status-select">
                <span className="manage-visually-hidden">신청 상태</span>
                <select
                  aria-label="신청 상태"
                  onChange={(event) => setStatus(event.target.value)}
                  value={status}
                >
                  {filterOptions.map(([value, label]) => (
                    <option key={value || "all"} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {registrations.length === 0 ? (
            <EmptyState title={status ? "이 상태의 신청이 없어요" : "아직 신청자가 없어요"} />
          ) : (
            <CursorList
              hasNext={Boolean(registrationsQuery.hasNextPage)}
              label="신청 더 보기"
              nextCursor={registrationsQuery.data?.pages?.at(-1)?.nextCursor ?? null}
              onLoadMore={() => registrationsQuery.fetchNextPage()}
              pending={registrationsQuery.isFetchingNextPage}
            >
              {registrations.map((registration) => (
                <li className="manage-registration-card" key={registration.id}>
                  <div className="manage-applicant-identity">
                    <span className="manage-avatar" aria-hidden="true">
                      {registration.member.crewName.slice(0, 1)}
                    </span>
                    <div className="manage-card-main">
                      <div>
                        <StatusBadge tone={statusTone(registration.status)}>
                          {statusLabel(registration.status)}
                        </StatusBadge>
                      </div>
                      <h3>{registration.member.crewName}</h3>
                      <div className="manage-card-meta">
                        <span>{registration.member.generation}기</span>
                        <span>{courseLabel(registration.member.course)}</span>
                        <span>신청 {formatDateTime(registration.registeredAt)}</span>
                      </div>
                      <p>{registration.message || "남긴 메시지가 없어요."}</p>
                      {registration.decidedAt ? (
                        <div className="manage-decision-note">
                          <span>처리 {formatDateTime(registration.decidedAt)}</span>
                          {registration.decisionReason ? (
                            <span>사유: {registration.decisionReason}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {registration.status === "PENDING" ? (
                    <div className="manage-card-actions">
                      <Button onClick={() => setDecision({ registration, status: "APPROVED" })}>
                        승인
                      </Button>
                      <Button
                        onClick={() => setDecision({ registration, status: "REJECTED" })}
                        variant="secondary"
                      >
                        거절
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </CursorList>
          )}
        </section>

        <OperationsRail recruitmentQuery={recruitmentQuery} />
      </div>

      <ConfirmDialog
        cancelLabel="취소"
        confirmLabel="신청 승인하기"
        description="승인하면 이 지원자는 바로 모임 멤버가 돼요."
        onClose={closeDialog}
        onConfirm={confirmDecision}
        open={decision?.status === "APPROVED"}
        pending={decideRegistration.isPending}
        title="이 신청을 승인할까요?"
      />

      <Modal
        description="거절 사유는 선택 사항이며 지원자의 신청 기록에 남아요."
        onClose={closeDialog}
        open={decision?.status === "REJECTED"}
        title="이 신청을 거절할까요?"
      >
        <div className="manage-form">
          <label className="manage-field">
            거절 사유 (선택)
            <textarea aria-label="거절 사유 (선택)" maxLength="1000" ref={reasonRef} />
            <span className="manage-character-count">최대 1000자</span>
          </label>
          <div className="manage-card-actions">
            <Button
              disabled={decideRegistration.isPending}
              onClick={closeDialog}
              variant="secondary"
            >
              취소
            </Button>
            <Button
              onClick={confirmDecision}
              pending={decideRegistration.isPending}
              variant="danger"
            >
              신청 거절하기
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function OperationsRail({ recruitmentQuery }) {
  const recruitment = recruitmentQuery.data;

  return (
    <aside aria-label="운영 현황" className="manage-side-rail">
      <section className="manage-rail-panel" aria-labelledby="recruitment-snapshot-title">
        <div className="manage-rail-panel__heading">
          <h3 id="recruitment-snapshot-title">모집 상태</h3>
          {recruitment && !recruitmentQuery.isError ? (
            <StatusBadge tone={statusTone(recruitment.recruitingStatus)}>
              {statusLabel(recruitment.recruitingStatus)}
            </StatusBadge>
          ) : null}
        </div>
        {recruitmentQuery.isPending ? <Skeleton count={2} /> : null}
        {recruitmentQuery.isError ? (
          <p className="manage-rail-error" role="status">
            모집 현황을 불러오지 못했어요.
          </p>
        ) : null}
        {recruitment && !recruitmentQuery.isError ? (
          <div className="manage-recruitment-snapshot">
            <strong>
              승인 {recruitment.approvedCount} / 정원 {recruitment.capacity}명
            </strong>
            <span>{recruitment.joinMethod === "APPROVAL" ? "모임장 승인" : "자동 승인"}</span>
          </div>
        ) : null}
      </section>
    </aside>
  );
}

function ManageLoading({ title }) {
  return (
    <div aria-busy="true" className="manage-page">
      <h1>{title}</h1>
      <Skeleton count={4} />
    </div>
  );
}

function InlineError({ error }) {
  const view = errorView(error);
  return (
    <div className="manage-inline-error" role="alert">
      <strong>{view.title}</strong>
      <span>{view.description}</span>
    </div>
  );
}
