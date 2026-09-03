import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useParams } from "react-router";
import { useInfiniteRecruitments } from "../../features/recruitment/index.js";
import { Button, EmptyState, ErrorState, Skeleton, StatusBadge } from "../../shared/ui/index.js";
import {
  errorView,
  flattenPages,
  formatDate,
  formatDateTime24Hour,
  statusLabel,
  statusTone
} from "./manageUtils.js";
import { ManagementContext, ManagementPageHeading } from "./ManagementContext.jsx";
import "./manage.css";

function timestamp(value) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isHistoryRecruitment(recruitment) {
  return ["SCHEDULED", "OPEN", "ALWAYS_OPEN", "CLOSED"].includes(
    recruitment.recruitingStatus
  );
}

function sortByCreatedAt(recruitments, sortOrder) {
  const direction = sortOrder === "asc" ? 1 : -1;
  return [...recruitments].sort(
    (first, second) => direction * (timestamp(first.createdAt) - timestamp(second.createdAt))
  );
}

export function ManageRecruitmentHistoryPage() {
  const { groupId } = useParams();
  const recruitmentsQuery = useInfiniteRecruitments(groupId);
  const {
    fetchNextPage,
    hasNextPage,
    isError,
    isFetchingNextPage,
    isPending,
    isSuccess
  } = recruitmentsQuery;
  const [createdAtSortOrder, setCreatedAtSortOrder] = useState("desc");

  useEffect(() => {
    if (!isSuccess || !hasNextPage || isFetchingNextPage) return;
    fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isSuccess]);

  if (isPending) {
    return <ManageLoading title="모집 이력" />;
  }

  if (isError) {
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

  const history = flattenPages(recruitmentsQuery.data).filter(isHistoryRecruitment);
  const visibleHistory = sortByCreatedAt(history, createdAtSortOrder);

  return (
    <div className="manage-page">
      <ManagementContext active="history" groupId={groupId} />
      <ManagementPageHeading
        description="지난 모집의 조건과 결과를 한눈에 확인해요."
        title="모집 이력"
      />

      <div
        aria-label={`${history.length}건`}
        className="manage-history-stat manage-stat manage-stat--inline"
      >
        <strong>{history.length}건</strong>
      </div>

      {history.length === 0 ? (
        <EmptyState
          description="모집을 마감하면 이곳에서 조건과 결과를 다시 확인할 수 있어요."
          title="아직 모집 이력이 없어요"
        />
      ) : (
        <section aria-labelledby="recruitment-history-table-title" className="manage-table-panel">
          <h3 className="manage-visually-hidden" id="recruitment-history-table-title">
            모집 이력 목록
          </h3>
          <table aria-label="모집 이력" className="manage-history-table">
            <colgroup>
              <col className="manage-history-table__col--created" />
              <col className="manage-history-table__col--period" />
              <col className="manage-history-table__col--status" />
              <col className="manage-history-table__col--method" />
              <col className="manage-history-table__col--capacity" />
              <col className="manage-history-table__col--approved" />
            </colgroup>
            <thead>
              <tr>
                <th>
                  <span className="manage-history-table__header-content">
                    등록일
                    <CreatedAtSortButtons
                      onChange={setCreatedAtSortOrder}
                      sortOrder={createdAtSortOrder}
                    />
                  </span>
                </th>
                <th>모집 기간</th>
                <th>모집 정원</th>
                <th>승인 인원</th>
                <th>가입 방식</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {visibleHistory.map((recruitment) => (
                <tr
                  aria-label={`${statusLabel(recruitment.recruitingStatus)} 상태, 마감 ${formatDate(
                    recruitment.endsAt
                  )}`}
                  key={recruitment.id}
                >
                  <td data-label="등록일">
                    {formatDate(recruitment.createdAt)}
                  </td>
                  <td data-label="모집 기간">
                    <div className="manage-history-period">
                      <span className="manage-history-period__row">
                        <span className="manage-history-period__label">시작</span>
                        <span>{formatDateTime24Hour(recruitment.startsAt)}</span>
                      </span>
                      <span className="manage-history-period__row">
                        <span className="manage-history-period__label">마감</span>
                        <span>
                          {recruitment.endsAt ? formatDateTime24Hour(recruitment.endsAt) : "-"}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td data-label="모집 정원">{recruitment.capacity}명</td>
                  <td data-label="승인 인원">{recruitment.approvedCount}명</td>
                  <td data-label="가입 방식">
                    {recruitment.joinMethod === "APPROVAL" ? "모임장 승인" : "자동 승인"}
                  </td>
                  <td data-label="상태">
                    <StatusBadge tone={statusTone(recruitment.recruitingStatus)}>
                      {statusLabel(recruitment.recruitingStatus)}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function CreatedAtSortButtons({ onChange, sortOrder }) {
  return (
    <span
      aria-label="등록일 정렬"
      className="manage-history-sort"
      role="group"
    >
      <button
        aria-label="등록일 오름차순 정렬"
        aria-pressed={sortOrder === "asc"}
        onClick={() => onChange("asc")}
        type="button"
      >
        <ChevronUp aria-hidden="true" size={14} strokeWidth={2.5} />
      </button>
      <button
        aria-label="등록일 내림차순 정렬"
        aria-pressed={sortOrder === "desc"}
        onClick={() => onChange("desc")}
        type="button"
      >
        <ChevronDown aria-hidden="true" size={14} strokeWidth={2.5} />
      </button>
    </span>
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
