import { useRef, useState } from "react";
import { useParams } from "react-router";
import { useGroup } from "../../features/group/index.js";
import {
  useCloseRecruitment,
  useCreateRecruitment,
  useInfiniteRecruitments
} from "../../features/recruitment/index.js";
import {
  Button,
  ConfirmDialog,
  CursorList,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
  StatusBadge
} from "../../shared/ui/index.js";
import { errorView, flattenPages, formatDateTime, statusLabel, statusTone } from "./manageUtils.js";
import { ManagementContext, ManagementPageHeading } from "./ManagementContext.jsx";
import "./manage.css";

const initialForm = { capacity: 10, endsAt: "", joinMethod: "AUTO", startsAt: "" };

function dateCopy(value) {
  return value ? formatDateTime(value) : "미정";
}

export function ManageRecruitmentsPage() {
  const { groupId } = useParams();
  const recruitmentsQuery = useInfiniteRecruitments(groupId);
  const groupQuery = useGroup(groupId);
  const createRecruitment = useCreateRecruitment(groupId);
  const closeRecruitment = useCloseRecruitment(groupId);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [closing, setClosing] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const recruitments = flattenPages(recruitmentsQuery.data);
  const isArchived = groupQuery.data?.status === "ENDED";
  const isActiveGroup = groupQuery.data?.status === "ACTIVE";
  const activeRecruitment =
    recruitments.find((recruitment) => recruitment.recruitingStatus !== "CLOSED") ?? null;
  const previewCapacity = Number(activeRecruitment?.capacity ?? form.capacity) || 0;
  const previewApproved = activeRecruitment?.approvedCount ?? 0;
  const progress = previewCapacity
    ? Math.min(100, Math.round((previewApproved / previewCapacity) * 100))
    : 0;

  async function submitCreate(event) {
    event.preventDefault();
    if (!isActiveGroup || creatingRef.current) return;
    if (form.endsAt && form.endsAt <= form.startsAt) {
      setFormError("모집 마감은 시작보다 뒤여야 해요.");
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    setFormError("");
    setMutationError(null);
    try {
      await createRecruitment.mutateAsync({
        capacity: Number(form.capacity),
        ...(form.endsAt ? { endsAt: form.endsAt } : {}),
        joinMethod: form.joinMethod,
        startsAt: form.startsAt
      });
      setForm(initialForm);
    } catch (error) {
      setMutationError(error);
      throw error;
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  async function confirmClose() {
    if (!closing) return;
    setMutationError(null);
    try {
      await closeRecruitment.mutateAsync({
        recruitmentId: closing.id,
        recruitingStatus: "CLOSED"
      });
      setClosing(null);
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
    <div className="manage-page">
      <ManagementContext active="recruitments" groupId={groupId} />
      <ManagementPageHeading
        description="모집 기간과 정원, 가입 방식을 실제 모집 단위로 관리해요."
        title="모집 관리"
      />

      {isActiveGroup ? (
        <section className="manage-summary-grid" aria-label="모집 현황 요약">
          <div className="manage-summary-card">
            <span>모집 상태</span>
            <strong>
              {activeRecruitment
                ? statusLabel(activeRecruitment.recruitingStatus)
                : "진행 중인 모집 없음"}
            </strong>
          </div>
          <div className="manage-summary-card">
            <span>현재 멤버</span>
            <strong>
              {Number.isInteger(groupQuery.data?.memberCount)
                ? `${groupQuery.data.memberCount}명`
                : "확인 중"}
            </strong>
          </div>
          <div className="manage-summary-card">
            <span>승인 인원</span>
            <strong>{activeRecruitment ? `${activeRecruitment.approvedCount}명` : "-"}</strong>
          </div>
          <div className="manage-summary-card">
            <span>모집 정원</span>
            <strong>{activeRecruitment ? `${activeRecruitment.capacity}명` : "-"}</strong>
          </div>
        </section>
      ) : null}

      {mutationError ? <InlineError error={mutationError} /> : null}
      <div
        className={`manage-recruitment-workspace${
          isArchived ? " manage-recruitment-workspace--archived" : ""
        }`}
      >
        <section
          className="manage-panel manage-recruitment-form-panel"
          aria-labelledby="recruitment-create-title"
        >
          <div className="manage-panel-heading">
            <div>
              <h2 id="recruitment-create-title">새 모집 만들기</h2>
              <p className={isArchived ? "manage-archive-note" : undefined}>
                {isArchived
                  ? "아카이빙된 모임은 새 모집을 만들 수 없어요."
                  : "백엔드 API는 모집 생성과 마감만 지원하며, 생성한 조건은 수정할 수 없어요."}
              </p>
            </div>
          </div>
          <form
            aria-labelledby="recruitment-create-title"
            className="manage-form"
            onSubmit={submitCreate}
          >
            <fieldset className="manage-form-fieldset" disabled={!isActiveGroup}>
              <div className="manage-form-grid">
                <label className="manage-field">
                  모집 시작
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
                  모집 마감 (선택)
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
              {formError ? (
                <p className="manage-inline-error" id="recruitment-form-error" role="alert">
                  {formError}
                </p>
              ) : null}
              <div className="manage-api-note">
                <strong>i</strong>
                <span>현재 멤버 수보다 작은 정원은 서버에서 거절될 수 있어요.</span>
              </div>
              <div className="manage-form-actions">
                <Button
                  onClick={() => {
                    setForm(initialForm);
                    setFormError("");
                  }}
                  type="button"
                  variant="secondary"
                >
                  입력 초기화
                </Button>
                <Button pending={createRecruitment.isPending || creating} type="submit">
                  모집 조건 저장
                </Button>
              </div>
            </fieldset>
          </form>
        </section>

        {isActiveGroup ? (
          <aside className="manage-preview-panel" aria-labelledby="recruitment-preview-title">
            <div className="manage-preview-heading">
              <h2 id="recruitment-preview-title">공개 상태</h2>
              <StatusBadge tone={statusTone(activeRecruitment?.recruitingStatus ?? "SCHEDULED")}>
                {activeRecruitment
                  ? statusLabel(activeRecruitment.recruitingStatus)
                  : "새 모집 미리보기"}
              </StatusBadge>
            </div>
            <dl className="manage-preview-list">
              <div>
                <dt>모집 기간</dt>
                <dd>
                  {dateCopy(activeRecruitment?.startsAt ?? form.startsAt)} -{" "}
                  {dateCopy(activeRecruitment?.endsAt ?? form.endsAt)}
                </dd>
              </div>
              <div>
                <dt>남은 자리</dt>
                <dd>{Math.max(0, previewCapacity - previewApproved)}자리</dd>
              </div>
              <div>
                <dt>가입 방식</dt>
                <dd>
                  {(activeRecruitment?.joinMethod ?? form.joinMethod) === "APPROVAL"
                    ? "모임장 승인"
                    : "자동 승인"}
                </dd>
              </div>
            </dl>
            <div className="manage-capacity-meter">
              <span>
                정원 사용률{" "}
                <strong>
                  {previewApproved} / {previewCapacity || 0}명
                </strong>
              </span>
              <div aria-label={`정원 사용률 ${progress}%`} role="progressbar">
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
            {activeRecruitment ? (
              <Button onClick={() => setClosing(activeRecruitment)} variant="danger">
                현재 모집 마감하기
              </Button>
            ) : (
              <p className="manage-muted-copy">왼쪽 조건으로 생성될 모집을 미리 확인할 수 있어요.</p>
            )}
          </aside>
        ) : null}
      </div>

      <section
        className="manage-panel manage-recruitment-history"
        aria-labelledby="recruitment-list-title"
      >
        <h2 id="recruitment-list-title">모집 내역</h2>
        {recruitments.length === 0 ? (
          <EmptyState title="아직 만든 모집이 없어요" />
        ) : (
          <CursorList
            hasNext={Boolean(recruitmentsQuery.hasNextPage)}
            label="모집 더 보기"
            nextCursor={recruitmentsQuery.data?.pages?.at(-1)?.nextCursor ?? null}
            onLoadMore={() => recruitmentsQuery.fetchNextPage()}
            pending={recruitmentsQuery.isFetchingNextPage}
          >
            {recruitments.map((recruitment) => (
              <li className="manage-recruitment-card" key={recruitment.id}>
                <div className="manage-card-main">
                  <div>
                    <StatusBadge tone={statusTone(recruitment.recruitingStatus)}>
                      {statusLabel(recruitment.recruitingStatus)}
                    </StatusBadge>
                  </div>
                  <h3>{recruitment.id}번 모집</h3>
                  <div className="manage-card-meta">
                    <span>
                      {recruitment.joinMethod === "APPROVAL" ? "모임장 승인" : "자동 승인"}
                    </span>
                    <span>
                      {recruitment.approvedCount}/{recruitment.capacity}명
                    </span>
                    <span>
                      {dateCopy(recruitment.startsAt)} - {dateCopy(recruitment.endsAt)}
                    </span>
                  </div>
                </div>
                {isActiveGroup && recruitment.recruitingStatus !== "CLOSED" ? (
                  <div className="manage-card-actions">
                    <Button onClick={() => setClosing(recruitment)} variant="danger">
                      {recruitment.id}번 모집 마감하기
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </CursorList>
        )}
      </section>

      <ConfirmDialog
        cancelLabel="취소"
        confirmLabel="모집 마감하기"
        description="마감한 모집은 다시 열 수 없어요. 현재 대기 중인 신청은 별도로 처리해 주세요."
        onClose={() => setClosing(null)}
        onConfirm={confirmClose}
        open={Boolean(closing)}
        pending={closeRecruitment.isPending}
        title="이 모집을 마감할까요?"
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
