import { Link, useParams } from "react-router";

import { useAuth } from "../features/auth";
import { useGroup } from "../features/group";
import { Button, ErrorState, ForbiddenState, NotFoundState, Skeleton } from "../shared/ui";
import { AuthGuard } from "./AuthGuard";
import { resolveLeaderAccess } from "./routeAccess";

export function LeaderAuthorityGuard({ children }) {
  const { groupId } = useParams();
  const { member } = useAuth();
  const group = useGroup(groupId);

  if (group.isPending) {
    return (
      <div className="route-loading">
        <Skeleton aria-label="모임장 권한 확인 중" />
      </div>
    );
  }

  if (group.error?.status === 403) {
    return (
      <ForbiddenState
        description="서버에서 현재 계정의 모임장 권한을 확인하지 못했어요."
        title="모임장만 이용할 수 있어요"
      />
    );
  }

  if (group.error?.status === 404) {
    return (
      <NotFoundState
        action={<Link to="/groups">모임 목록으로</Link>}
        description="삭제되었거나 주소가 변경된 모임일 수 있어요."
        title="모임을 찾을 수 없어요"
      />
    );
  }

  if (group.error) {
    return (
      <ErrorState
        action={<Button onClick={() => void group.refetch()}>다시 시도</Button>}
        description="모임 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
        title="권한을 확인할 수 없어요"
      />
    );
  }

  const decision = resolveLeaderAccess(member?.id, group.data?.leader?.memberId);
  if (decision.kind === "forbidden") {
    return (
      <ForbiddenState
        description="서버에서 확인한 현재 모임장만 이 관리 화면에 접근할 수 있어요."
        title="모임장만 이용할 수 있어요"
      />
    );
  }

  return children;
}

export function LeaderGuard({ children }) {
  return (
    <AuthGuard>
      <LeaderAuthorityGuard>{children}</LeaderAuthorityGuard>
    </AuthGuard>
  );
}
