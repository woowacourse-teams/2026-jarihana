import { useRef, useState } from "react";
import { Link } from "react-router";

import {
  useInfiniteMyRegistrations,
  useWithdrawRegistration
} from "../../features/registration/index.js";
import {
  Button,
  ConfirmDialog,
  CursorList,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
  useToast
} from "../../shared/ui/index.js";
import { AccountLayout, AccountNav } from "./AccountLayout.jsx";
import { RegistrationSummaryCard } from "./AccountCards.jsx";
import { flattenPages } from "./accountUtils.js";

function WithdrawRegistration({ onWithdrawSuccess, registration }) {
  const withdrawal = useWithdrawRegistration(registration.recruitmentId);
  const toast = useToast();

  const withdraw = async () => {
    await withdrawal.mutateAsync(registration.id);
    toast.show({
      title: "신청을 철회했어요",
      description: `${registration.group.name} 신청 내역에서 제거했어요.`,
      tone: "success"
    });
    onWithdrawSuccess();
  };

  return (
    <ConfirmDialog
      confirmLabel="철회하기"
      danger
      description="철회한 신청은 되돌릴 수 없어요. 다시 참여하려면 모집이 열려 있을 때 새로 신청해야 해요."
      onConfirm={withdraw}
      pending={withdrawal.isPending}
      title="신청을 철회할까요?"
      trigger={<Button variant="danger">신청 철회</Button>}
    />
  );
}

export function MyRegistrationsPage() {
  const [status, setStatus] = useState("");
  const listTitleReference = useRef(null);
  const query = useInfiniteMyRegistrations({
    applicant: "me",
    ...(status ? { status } : {})
  });
  const registrations = flattenPages(query.data);

  const focusListAfterWithdrawal = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => listTitleReference.current?.focus());
    });
  };

  return (
    <AccountLayout
      eyebrow="MY APPLICATIONS"
      title="내 신청"
      description="가입 신청의 진행 상태와 모임의 답변을 확인해요."
    >
      <AccountNav active="registrations" />
      <h2 className="list-section-title" ref={listTitleReference} tabIndex={-1}>
        신청 목록
      </h2>
      <div className="list-toolbar">
        <Select
          label="신청 상태"
          name="registrationStatus"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">전체</option>
          <option value="PENDING">검토 중</option>
          <option value="APPROVED">승인</option>
          <option value="REJECTED">거절</option>
        </Select>
        <span>{registrations.length}개의 신청</span>
      </div>
      {query.isLoading ? (
        <div className="registration-list" role="status" aria-label="내 신청 불러오는 중">
          <Skeleton />
          <Skeleton />
        </div>
      ) : null}
      {query.isError ? (
        <ErrorState
          title="내 신청을 불러오지 못했어요"
          description="연결을 확인하고 다시 시도해 주세요."
          action={<Button onClick={() => query.refetch()}>다시 시도</Button>}
        />
      ) : null}
      {!query.isLoading && !query.isError && registrations.length === 0 ? (
        <EmptyState
          title="조건에 맞는 신청이 없어요"
          description="다른 상태를 선택하거나 새 모임을 둘러보세요."
          action={<Link to="/groups">모임 둘러보기</Link>}
        />
      ) : null}
      {!query.isLoading && !query.isError && registrations.length > 0 ? (
        <CursorList
          hasNext={Boolean(query.hasNextPage)}
          nextCursor={query.data?.pages.at(-1)?.nextCursor ?? null}
          onLoadMore={() => query.fetchNextPage()}
          pending={query.isFetchingNextPage}
        >
          {registrations.map((registration) => (
            <li key={registration.id}>
              <RegistrationSummaryCard
                registration={registration}
                action={
                  registration.status === "PENDING" ? (
                    <WithdrawRegistration
                      onWithdrawSuccess={focusListAfterWithdrawal}
                      registration={registration}
                    />
                  ) : null
                }
              />
            </li>
          ))}
        </CursorList>
      ) : null}
    </AccountLayout>
  );
}
