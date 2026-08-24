import { useCallback, useEffect, useRef, useState } from "react";
import { useBeforeUnload, useNavigate, useParams } from "react-router";
import { useGroup } from "../../features/group/index.js";
import {
  useCloseRecruitment,
  useCreateRecruitment,
  useInfiniteRecruitments
} from "../../features/recruitment/index.js";
import { useInfiniteRegistrations } from "../../features/registration/index.js";
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Select,
  Skeleton,
  StatusBadge
} from "../../shared/ui/index.js";
import myProfileIllustration from "../../shared/assets/figma/my-profile-illustration.png";
import {
  courseLabel,
  errorView,
  flattenPages,
  formatDateTime,
  statusLabel,
  statusTone
} from "./manageUtils.js";
import { ManagementContext, ManagementPageHeading } from "./ManagementContext.jsx";
import "./manage.css";

const initialForm = { capacity: 10, endsAt: "", joinMethod: "AUTO", startsAt: "" };
const currentRecruitmentStatuses = new Set(["OPEN", "ALWAYS_OPEN"]);

function dateCopy(value) {
  return value ? formatDateTime(value) : "미정";
}

function toTimestamp(value) {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? null : timestamp;
}

function isCurrentRecruitment(recruitment, now = Date.now()) {
  if (!currentRecruitmentStatuses.has(recruitment.recruitingStatus)) return false;
  const endsAt = toTimestamp(recruitment.endsAt);
  return endsAt === null || endsAt > now;
}

function isClosedRecruitment(recruitment, now = Date.now()) {
  if (recruitment.recruitingStatus === "CLOSED") return true;
  const endsAt = toTimestamp(recruitment.endsAt);
  return endsAt !== null && endsAt <= now;
}

function selectCurrentRecruitment(recruitments, now = Date.now()) {
  return (
    [...recruitments].sort((first, second) => {
      const firstStartsAt = toTimestamp(first.startsAt) ?? Number.MAX_SAFE_INTEGER;
      const secondStartsAt = toTimestamp(second.startsAt) ?? Number.MAX_SAFE_INTEGER;
      const firstHasStarted = firstStartsAt <= now;
      const secondHasStarted = secondStartsAt <= now;

      if (firstHasStarted !== secondHasStarted) return firstHasStarted ? -1 : 1;
      if (firstStartsAt !== secondStartsAt) return firstStartsAt - secondStartsAt;

      const firstCreatedAt = toTimestamp(first.createdAt) ?? 0;
      const secondCreatedAt = toTimestamp(second.createdAt) ?? 0;
      return secondCreatedAt - firstCreatedAt;
    })[0] ?? null
  );
}

function selectClosedRecruitment(recruitments) {
  return (
    [...recruitments].sort((first, second) => {
      const firstDate = toTimestamp(first.endsAt) ?? Number.NEGATIVE_INFINITY;
      const secondDate = toTimestamp(second.endsAt) ?? Number.NEGATIVE_INFINITY;
      return secondDate - firstDate;
    })[0] ?? null
  );
}

function isSameForm(first, second) {
  return (
    String(first.capacity) === String(second.capacity) &&
    first.endsAt === second.endsAt &&
    first.joinMethod === second.joinMethod &&
    first.startsAt === second.startsAt
  );
}

function RecruitmentEmptyState({ action, title }) {
  return (
    <div className="manage-recruitment-empty" role="status">
      <img alt="" aria-hidden="true" src={myProfileIllustration} />
      <h3>{title}</h3>
      <p>새 자리를 만들어주세요</p>
      {action ? <div className="manage-recruitment-empty__action">{action}</div> : null}
    </div>
  );
}

export function ManageRecruitmentsPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const recruitmentsQuery = useInfiniteRecruitments(groupId);
  const groupQuery = useGroup(groupId);
  const createRecruitment = useCreateRecruitment(groupId);
  const closeRecruitment = useCloseRecruitment(groupId);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = recruitmentsQuery;
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [screen, setScreen] = useState("current");
  const [createError, setCreateError] = useState(null);
  const [closing, setClosing] = useState(null);
  const [currentRecruitmentId, setCurrentRecruitmentId] = useState(null);
  const [createdRecruitment, setCreatedRecruitment] = useState(null);
  const [discardRequested, setDiscardRequested] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [mutationError, setMutationError] = useState(null);

  useEffect(() => {
    if (!recruitmentsQuery.isSuccess || !hasNextPage || isFetchingNextPage) return;
    fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, recruitmentsQuery.isSuccess]);

  const recruitments = flattenPages(recruitmentsQuery.data);
  const isActiveGroup = groupQuery.data?.status === "ACTIVE";
  const currentRecruitments = recruitments.filter(isCurrentRecruitment);
  const queriedCurrentRecruitment =
    currentRecruitments.find(
      (recruitment) => String(recruitment.id) === String(currentRecruitmentId)
    ) ?? selectCurrentRecruitment(currentRecruitments);
  const refreshedCreatedRecruitment = createdRecruitment
    ? currentRecruitments.find(
        (recruitment) => String(recruitment.id) === String(createdRecruitment.id)
      )
    : null;
  const currentRecruitment =
    createdRecruitment && isCurrentRecruitment(createdRecruitment)
      ? { ...createdRecruitment, ...refreshedCreatedRecruitment }
      : queriedCurrentRecruitment;
  const approvedRegistrationsQuery = useInfiniteRegistrations(currentRecruitment?.id, {
    status: "APPROVED"
  });
  const latestClosedRecruitment = selectClosedRecruitment(
    recruitments
      .filter(isClosedRecruitment)
      .filter((recruitment) => toTimestamp(recruitment.endsAt) !== null)
  );
  const hasRecentClosedRecruitment =
    screen === "current" && !currentRecruitment && Boolean(latestClosedRecruitment);
  const isCreateDirty = screen === "create" && !isSameForm(form, initialForm);

  const handleBeforeUnload = useCallback(
    (event) => {
      if (!isCreateDirty || creating) return;
      event.preventDefault();
      event.returnValue = "";
    },
    [creating, isCreateDirty]
  );
  useBeforeUnload(handleBeforeUnload, { capture: true });

  async function refreshRecruitmentState() {
    await Promise.all([recruitmentsQuery.refetch(), groupQuery.refetch()]);
  }

  function openCreateScreen() {
    if (!isActiveGroup) return;
    setForm(initialForm);
    setFormError("");
    setCreateError(null);
    setScreen("create");
  }

  function resetCreateState() {
    setForm(initialForm);
    setFormError("");
    setCreateError(null);
  }

  function closeCreateScreen() {
    resetCreateState();
    setScreen("current");
  }

  function requestCreateExit() {
    if (!isCreateDirty) {
      closeCreateScreen();
      return;
    }
    setDiscardRequested(true);
  }

  function handleNavigationCapture(event) {
    if (!isCreateDirty || creating || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.target === "_blank") return;
    const target = new URL(link.href, window.location.href);
    if (target.origin !== window.location.origin || target.href === window.location.href) return;
    event.preventDefault();
    event.stopPropagation();
    setPendingNavigation(`${target.pathname}${target.search}${target.hash}`);
    setDiscardRequested(true);
  }

  function cancelDiscard() {
    setDiscardRequested(false);
    setPendingNavigation(null);
  }

  function confirmDiscard() {
    resetCreateState();
    setDiscardRequested(false);
    const nextNavigation = pendingNavigation;
    setPendingNavigation(null);

    if (nextNavigation) {
      setScreen("current");
      navigate(nextNavigation);
      return;
    }

    setScreen("current");
  }

  async function submitCreate(event) {
    event.preventDefault();
    if (!isActiveGroup || creatingRef.current) return;
    if (!form.startsAt) {
      setFormError("모집 시작일을 입력해 주세요.");
      return;
    }
    if (form.endsAt && form.endsAt <= form.startsAt) {
      setFormError("모집 마감일은 시작일보다 뒤여야 해요.");
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    setFormError("");
    setCreateError(null);
    try {
      const createdRecruitment = await createRecruitment.mutateAsync({
        capacity: Number(form.capacity),
        ...(form.endsAt ? { endsAt: form.endsAt } : {}),
        joinMethod: form.joinMethod,
        startsAt: form.startsAt
      });
      const immediateRecruitment = {
        ...createdRecruitment,
        approvedCount: 0,
        createdAt: new Date().toISOString()
      };
      resetCreateState();
      setCreatedRecruitment(immediateRecruitment);
      setCurrentRecruitmentId(immediateRecruitment.id);
      setScreen("current");
      await refreshRecruitmentState();
    } catch (error) {
      setCreateError(error);
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  async function confirmClose() {
    if (!closing) return;
    setMutationError(null);
    try {
      await closeRecruitment.mutateAsync({ recruitmentId: closing.id });
      setCurrentRecruitmentId((currentId) =>
        String(currentId) === String(closing.id) ? null : currentId
      );
      setCreatedRecruitment((current) =>
        String(current?.id) === String(closing.id) ? null : current
      );
      setClosing(null);
      setScreen("current");
      await refreshRecruitmentState();
    } catch (error) {
      setMutationError(error);
      throw error;
    }
  }

  if (recruitmentsQuery.isPending) {
    return (
      <div aria-busy="true" className="manage-page">
        <h1>모집 관리</h1>
        <Skeleton count={4} />
      </div>
    );
  }

  if (recruitmentsQuery.isError) {
    const view = errorView(recruitmentsQuery.error);
    return (
      <div className="manage-page">
        <ErrorState
          action={<Button onClick={() => recruitmentsQuery.refetch()}>다시 시도</Button>}
          description={view.description}
          title={view.title}
        />
      </div>
    );
  }

  return (
    <div className="manage-page" onClickCapture={handleNavigationCapture}>
      <ManagementContext active="recruitments" groupId={groupId} />
      <ManagementPageHeading
        description="모집 기간과 정원, 가입 방식을 실제 모집 단위로 관리해요."
        title="모집 관리"
      />

      {isActiveGroup ? (
        <div
          className={
            screen === "create" || hasRecentClosedRecruitment ||
            (screen === "current" && Boolean(currentRecruitment))
              ? "manage-recruitment-focus-layout"
              : undefined
          }
        >
          <section
            aria-labelledby="current-recruitment-title"
            className="manage-panel manage-recruitment-focus"
          >
            {screen === "create" ? (
              <form className="manage-form" onSubmit={submitCreate}>
                <div className="manage-recruitment-focus__heading">
                  <div>
                    <h2 id="current-recruitment-title">새 모집 생성</h2>
                    <p>새로운 모집 조건을 입력해 주세요.</p>
                  </div>
                </div>
                <fieldset className="manage-form-fieldset">
                  <div className="manage-form-grid">
                    <label className="manage-field">
                      모집 시작일
                      <input
                        name="startsAt"
                        onChange={(event) =>
                          setForm((current) => ({ ...current, startsAt: event.target.value }))
                        }
                        required
                        type="datetime-local"
                        value={form.startsAt}
                      />
                    </label>
                    <label className="manage-field">
                      모집 마감일 (선택)
                      <input
                        aria-describedby={formError ? "recruitment-form-error" : undefined}
                        name="endsAt"
                        onChange={(event) =>
                          setForm((current) => ({ ...current, endsAt: event.target.value }))
                        }
                        type="datetime-local"
                        value={form.endsAt}
                      />
                    </label>
                    <label className="manage-field">
                      모집 정원
                      <input
                        min="1"
                        name="capacity"
                        onChange={(event) =>
                          setForm((current) => ({ ...current, capacity: event.target.value }))
                        }
                        required
                        type="number"
                        value={form.capacity}
                      />
                    </label>
                    <Select
                      label="가입 방식"
                      name="joinMethod"
                      onChange={(event) =>
                        setForm((current) => ({ ...current, joinMethod: event.target.value }))
                      }
                      value={form.joinMethod}
                    >
                      <option value="AUTO">자동 승인</option>
                      <option value="APPROVAL">모임장 승인</option>
                    </Select>
                  </div>
                  {createError ? <InlineError error={createError} /> : null}
                  {formError ? (
                    <p className="manage-inline-error" id="recruitment-form-error" role="alert">
                      {formError}
                    </p>
                  ) : null}
                  <div className="manage-form-actions">
                    <Button onClick={requestCreateExit} type="button" variant="secondary">
                      생성 취소
                    </Button>
                    <Button pending={createRecruitment.isPending || creating} type="submit">
                      모집 생성
                    </Button>
                  </div>
                </fieldset>
              </form>
            ) : (
              <>
                <div className="manage-recruitment-focus__heading">
                  <div>
                    <h2 id="current-recruitment-title">현재 모집</h2>
                  </div>
                </div>
                {currentRecruitment ? (
                  <RecruitmentInformation
                    action={
                      <Button onClick={() => setClosing(currentRecruitment)} variant="danger">
                        모집 마감하기
                      </Button>
                    }
                    memberCount={groupQuery.data?.memberCount}
                    recruitment={currentRecruitment}
                  />
                ) : (
                  <RecruitmentEmptyState
                    action={
                      <Button onClick={openCreateScreen} type="button" variant="primary">
                        새 모집 만들기
                      </Button>
                    }
                    title="현재 진행 중인 모집이 없어요"
                  />
                )}
              </>
            )}
          </section>

          {screen === "current" && currentRecruitment ? (
            <ApprovedMembersSnapshot query={approvedRegistrationsQuery} />
          ) : null}

          {hasRecentClosedRecruitment ? (
            <section
              aria-labelledby="latest-closed-recruitment-title"
              className="manage-panel manage-recruitment-recently-closed"
            >
              <div className="manage-recruitment-focus__heading">
                <h2 id="latest-closed-recruitment-title">최근 마감 모집</h2>
              </div>
              <RecruitmentInformation
                memberCount={groupQuery.data?.memberCount}
                recruitment={latestClosedRecruitment}
                showMemberCount={false}
                showStatus={false}
              />
            </section>
          ) : null}

          {screen === "create" ? (
            <RecruitmentPreview form={form} memberCount={groupQuery.data?.memberCount} />
          ) : null}
        </div>
      ) : (
        <section
          aria-labelledby="archived-recruitment-title"
          className="manage-panel manage-recruitment-archive"
        >
          <div>
            <h2 id="archived-recruitment-title">아카이빙된 모임</h2>
            <p>아카이빙된 모임은 새 모집을 만들 수 없어요.</p>
          </div>
          <Button disabled type="button" variant="secondary">
            새 모집 만들기
          </Button>
        </section>
      )}

      {mutationError ? <InlineError error={mutationError} /> : null}

      <ConfirmDialog
        cancelLabel="취소"
        confirmLabel="예"
        description={
          <>
            모집을 마감하면 더 이상 신규 신청을 받을 수 없어요.
            <br />
            다시 신규 신청을 받으려면 새 모집을 생성해야 해요.
            <br />
            현재 모집을 정말로 종료하시겠습니까?
          </>
        }
        onClose={() => setClosing(null)}
        onConfirm={confirmClose}
        open={Boolean(closing)}
        pending={closeRecruitment.isPending}
        title="모집을 마감할까요?"
      />

      <ConfirmDialog
        cancelLabel="취소"
        confirmLabel="예"
        description="입력한 모집 조건은 저장되지 않아요."
        onClose={cancelDiscard}
        onConfirm={confirmDiscard}
        open={discardRequested}
        title="모집 생성을 취소하시겠습니까?"
      />
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

function RecruitmentInformation({
  action,
  memberCount,
  recruitment,
  showMemberCount = true,
  showStatus = true
}) {
  const capacity = Number(recruitment.capacity) || 0;
  const approvedCount = Number(recruitment.approvedCount) || 0;
  const progress = capacity ? Math.min(100, Math.round((approvedCount / capacity) * 100)) : 0;

  return (
    <div className="manage-recruitment-information">
      <dl className="manage-recruitment-facts">
        {showStatus ? (
          <div>
            <dt>모집 상태</dt>
            <dd>
              <StatusBadge tone={statusTone(recruitment.recruitingStatus)}>
                {statusLabel(recruitment.recruitingStatus)}
              </StatusBadge>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>모집 기간</dt>
          <dd>
            {dateCopy(recruitment.startsAt)} - {dateCopy(recruitment.endsAt)}
          </dd>
        </div>
        <div>
          <dt>모집 정원</dt>
          <dd>{recruitment.capacity}명</dd>
        </div>
        {showMemberCount ? (
          <div>
            <dt>현재 멤버 수</dt>
            <dd>{Number.isInteger(memberCount) ? `${memberCount}명` : "확인 중"}</dd>
          </div>
        ) : null}
        <div>
          <dt>승인 인원</dt>
          <dd>{recruitment.approvedCount}명</dd>
        </div>
        <div>
          <dt>가입 방식</dt>
          <dd>{recruitment.joinMethod === "APPROVAL" ? "모임장 승인" : "자동 승인"}</dd>
        </div>
      </dl>
      <div className="manage-capacity-meter">
        <span>
          정원 사용률 <strong>{approvedCount} / {capacity}명</strong>
        </span>
        <div aria-label={`정원 사용률 ${progress}%`} role="progressbar">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
      {action ? <div className="manage-recruitment-information__actions">{action}</div> : null}
    </div>
  );
}

function ApprovedMembersSnapshot({ query }) {
  const registrations = flattenPages(query.data);
  const memberCount = query.hasNextPage
    ? `${registrations.length}명 이상`
    : `${registrations.length}명`;

  return (
    <aside
      aria-labelledby="approved-members-snapshot-title"
      className="manage-recruitment-approved-members"
    >
      <h3 id="approved-members-snapshot-title">이번 모집 승인 멤버 {memberCount}</h3>
      {query.isPending ? <Skeleton count={3} /> : null}
      {query.isError ? (
        <p className="manage-recruitment-approved-members__error" role="status">
          승인 멤버를 불러오지 못했어요.
        </p>
      ) : null}
      {!query.isPending && !query.isError
        ? registrations.length > 0 && (
            <ul className="manage-recruitment-approved-members__list">
              {registrations.slice(0, 4).map((registration) => (
                <li key={registration.id}>
                  <span className="manage-avatar" aria-hidden="true">
                    {registration.member.crewName.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{registration.member.crewName}</strong>
                    <small>
                      {registration.member.generation}기 · {courseLabel(registration.member.course)}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          )
        : null}
      {!query.isPending && !query.isError && registrations.length === 0 ? (
        <p className="manage-recruitment-approved-members__empty">
          이번 모집의 승인 멤버가 없어요.
        </p>
      ) : null}
    </aside>
  );
}

function RecruitmentPreview({ form, memberCount }) {
  const capacity = Number(form.capacity) || 0;

  return (
    <aside className="manage-recruitment-public-status" aria-labelledby="recruitment-preview-title">
      <div className="manage-recruitment-public-status__heading">
        <h2 id="recruitment-preview-title">공개 상태 미리보기</h2>
        <StatusBadge tone="brand">모집 중</StatusBadge>
      </div>
      <dl className="manage-preview-list">
        <div>
          <dt>모집 기간</dt>
          <dd>
            {dateCopy(form.startsAt)} - {dateCopy(form.endsAt)}
          </dd>
        </div>
        <div>
          <dt>모집 정원</dt>
          <dd>{capacity}명</dd>
        </div>
        <div>
          <dt>가입 방식</dt>
          <dd>{form.joinMethod === "APPROVAL" ? "모임장 승인" : "자동 승인"}</dd>
        </div>
        <div>
          <dt>현재 멤버</dt>
          <dd>{Number.isInteger(memberCount) ? `${memberCount}명` : "확인 중"}</dd>
        </div>
      </dl>
      <div className="manage-capacity-meter">
        <span>
          정원 사용률 <strong>0 / {capacity}명</strong>
        </span>
        <div aria-label="정원 사용률 0%" role="progressbar">
          <span style={{ width: "0%" }} />
        </div>
      </div>
      <p className="manage-muted-copy">입력한 조건을 미리 보고 있어요.</p>
    </aside>
  );
}
