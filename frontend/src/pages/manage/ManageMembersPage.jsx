import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { useParams } from "react-router";
import { useInfiniteGroupMembers, useTransferLeader } from "../../features/member/index.js";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusBadge
} from "../../shared/ui/index.js";
import {
  courseLabel,
  errorView,
  flattenPages,
  formatDate,
  roleLabel,
  statusTone
} from "./manageUtils.js";
import { ManagementContext, ManagementPageHeading } from "./ManagementContext.jsx";
import "./manage.css";

export function ManageMembersPage() {
  const { groupId } = useParams();
  const membersQuery = useInfiniteGroupMembers(groupId);
  const transferLeader = useTransferLeader(groupId);
  const [candidate, setCandidate] = useState(null);
  const [mutationError, setMutationError] = useState(null);
  const [search, setSearch] = useState("");
  const [course, setCourse] = useState("");
  const members = flattenPages(membersQuery.data);
  const normalizedSearch = search.trim().toLocaleLowerCase("ko-KR");
  const visibleMembers = members.filter((member) => {
    const matchesCourse = !course || member.course === course;
    const searchable = `${member.crewName} ${member.generation} ${courseLabel(member.course)}`;
    return matchesCourse && searchable.toLocaleLowerCase("ko-KR").includes(normalizedSearch);
  });

  async function confirmTransfer() {
    if (!candidate) return;
    setMutationError(null);
    try {
      await transferLeader.mutateAsync({ groupMemberId: candidate.groupMemberId });
      setCandidate(null);
    } catch (error) {
      setMutationError(error);
      throw error;
    }
  }

  if (membersQuery.isPending) {
    return <ManageLoading title="멤버 관리" />;
  }

  if (membersQuery.isError) {
    const view = errorView(membersQuery.error);
    return (
      <div className="manage-page">
        <ErrorState
          action={<Button onClick={() => membersQuery.refetch()}>다시 시도</Button>}
          description={view.description}
          title={view.title}
        />
      </div>
    );
  }

  return (
    <div className="manage-page">
      <ManagementContext active="members" groupId={groupId} />
      <ManagementPageHeading
        description="승인된 크루와 역할, 가입일을 확인하고 멤버를 관리해요."
        title="멤버 관리"
      />

      {mutationError ? <InlineError error={mutationError} /> : null}
      <section aria-label="전체 멤버 요약" className="manage-member-summary">
        <span>전체 멤버</span>
        <strong>{members.length}명</strong>
      </section>
      <div className="manage-member-controls manage-member-controls--figma">
        <label className="manage-member-search">
          <span className="manage-visually-hidden">멤버 검색</span>
          <Search aria-hidden="true" className="manage-member-search__icon" size={20} />
          <input
            aria-label="멤버 검색"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="닉네임, 과정, 기수 검색"
            type="search"
            value={search}
          />
        </label>
        <div aria-label="과정 필터" className="manage-course-filters" role="group">
          {[
            ["", "전체"],
            ["BACKEND", "백엔드"],
            ["FRONTEND", "프론트엔드"],
            ["ANDROID", "안드로이드"]
          ].map(([value, label]) => (
            <button
              aria-pressed={course === value}
              key={value || "all"}
              onClick={() => setCourse(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <span aria-label="정렬 기준: 최근 가입순" className="manage-member-sort">
          최근 가입순
          <ChevronDown aria-hidden="true" size={18} />
        </span>
      </div>

      {members.length === 0 ? (
        <EmptyState title="아직 함께하는 멤버가 없어요" />
      ) : visibleMembers.length === 0 ? (
        <EmptyState title="검색 조건에 맞는 멤버가 없어요" />
      ) : (
        <section className="manage-table-panel" aria-labelledby="member-table-title">
          <h3 className="manage-visually-hidden" id="member-table-title">
            모임 멤버
          </h3>
          <table aria-label="모임 멤버" className="manage-member-table">
            <colgroup>
              <col className="manage-member-table__col--crew" />
              <col className="manage-member-table__col--course" />
              <col className="manage-member-table__col--generation" />
              <col className="manage-member-table__col--role" />
              <col className="manage-member-table__col--joined" />
              <col className="manage-member-table__col--actions" />
            </colgroup>
            <thead>
              <tr>
                <th>크루</th>
                <th>과정</th>
                <th>기수</th>
                <th>역할</th>
                <th>가입일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {visibleMembers.map((member) => (
                <tr aria-label={`${member.crewName} 멤버`} key={member.groupMemberId}>
                  <td data-label="크루">
                    <div className="manage-member-identity">
                      <span className="manage-avatar" aria-hidden="true">
                        {member.crewName.slice(0, 1)}
                      </span>
                      <strong>{member.crewName}</strong>
                    </div>
                  </td>
                  <td data-label="과정">{courseLabel(member.course)}</td>
                  <td data-label="기수">{member.generation}기</td>
                  <td data-label="역할">
                    <StatusBadge tone={statusTone(member.role)}>
                      {roleLabel(member.role)}
                    </StatusBadge>
                  </td>
                  <td data-label="가입일">{formatDate(member.joinedAt)}</td>
                  <td data-label="관리">
                    {member.role !== "LEADER" ? (
                      <div className="manage-member-actions">
                        <Button
                          className="manage-member-transfer"
                          onClick={() => setCandidate(member)}
                          size="sm"
                          variant="secondary"
                        >
                          {member.crewName}에게 모임장 넘기기
                        </Button>
                        <span
                          className="manage-member-action manage-member-action--unavailable"
                          title="멤버 내보내기 API가 아직 지원되지 않아요."
                        >
                          내보내기
                        </span>
                      </div>
                    ) : (
                      <span className="manage-member-action manage-member-action--leader">
                        모임장
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {membersQuery.hasNextPage ? (
            <div className="manage-pagination">
              <Button
                onClick={() => membersQuery.fetchNextPage()}
                pending={membersQuery.isFetchingNextPage}
                variant="secondary"
              >
                멤버 더 보기
              </Button>
            </div>
          ) : null}
        </section>
      )}

      <ConfirmDialog
        cancelLabel="취소"
        confirmLabel="모임장 넘기기"
        description={
          candidate
            ? `모임장 권한이 ${candidate.crewName}님에게 이전되고, 현재 모임장 권한은 해제돼요. 이 작업은 즉시 반영돼요.`
            : ""
        }
        onClose={() => setCandidate(null)}
        onConfirm={confirmTransfer}
        open={Boolean(candidate)}
        pending={transferLeader.isPending}
        title="모임장을 넘길까요?"
      />
    </div>
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
