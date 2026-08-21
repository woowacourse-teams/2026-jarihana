import { Link, useSearchParams } from "react-router";

import { useInfiniteGroups } from "../../features/group/index.js";
import {
  Button,
  CursorList,
  EmptyState,
  ErrorState,
  Select,
  Skeleton
} from "../../shared/ui/index.js";
import { AccountLayout, AccountNav } from "./AccountLayout.jsx";
import { GroupSummaryCard } from "./AccountCards.jsx";
import { flattenPages } from "./accountUtils.js";

export function MyGroupsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedRole = searchParams.get("role");
  const role = requestedRole === "LEADER" || requestedRole === "MEMBER" ? requestedRole : "";
  const query = useInfiniteGroups({ relation: "JOINED", ...(role ? { role } : {}) });
  const groups = flattenPages(query.data);

  const changeRole = (event) => {
    const next = new URLSearchParams(searchParams);
    if (event.target.value) next.set("role", event.target.value);
    else next.delete("role");
    setSearchParams(next, { replace: true });
  };

  return (
    <AccountLayout
      eyebrow="MY GROUPS"
      title="내 모임"
      description="참여 중인 모임과 직접 이끄는 모임을 확인해요."
    >
      <AccountNav active="groups" />
      <div className="list-toolbar">
        <Select label="모임 역할" name="groupRole" value={role} onChange={changeRole}>
          <option value="">전체</option>
          <option value="LEADER">내가 이끄는 모임</option>
          <option value="MEMBER">멤버로 참여한 모임</option>
        </Select>
        <span>{groups.length}개의 모임</span>
      </div>
      {query.isLoading ? (
        <div className="account-list-grid" role="status" aria-label="내 모임 불러오는 중">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ) : null}
      {query.isError ? (
        <ErrorState
          title="내 모임을 불러오지 못했어요"
          description="연결을 확인하고 다시 시도해 주세요."
          action={<Button onClick={() => query.refetch()}>다시 시도</Button>}
        />
      ) : null}
      {!query.isLoading && !query.isError && groups.length === 0 ? (
        <EmptyState
          title="아직 함께하는 모임이 없어요"
          description="관심 있는 모임에 신청하면 이곳에 표시돼요."
          action={<Link to="/groups">모임 둘러보기</Link>}
        />
      ) : null}
      {!query.isLoading && !query.isError && groups.length > 0 ? (
        <CursorList
          hasNext={Boolean(query.hasNextPage)}
          nextCursor={query.data?.pages.at(-1)?.nextCursor ?? null}
          onLoadMore={() => query.fetchNextPage()}
          pending={query.isFetchingNextPage}
        >
          {groups.map((group) => (
            <li key={group.id}>
              <GroupSummaryCard group={group} />
            </li>
          ))}
        </CursorList>
      ) : null}
    </AccountLayout>
  );
}
