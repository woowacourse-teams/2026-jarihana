import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSafeNextCursor } from "../../entities/cursor/index.js";
import {
  createProposal,
  createProposalComment,
  deleteProposal,
  deleteProposalComment,
  fetchProposal,
  fetchProposalComments,
  fetchProposals,
  removeProposalInterest,
  saveProposalInterest
} from "./api.js";

export const proposalKeys = {
  all: ["proposals"],
  lists: () => ["proposals", "list"],
  list: ({ category = null, viewerKey = "anonymous" } = {}) => ["proposals", "list", category, viewerKey],
  details: (proposalId) => ["proposals", "detail", String(proposalId)],
  detail: (proposalId, viewerKey = "anonymous") => ["proposals", "detail", String(proposalId), viewerKey],
  comments: (proposalId) => ["proposals", "comments", String(proposalId)],
  commentList: (proposalId, viewerKey = "anonymous") => ["proposals", "comments", String(proposalId), viewerKey]
};

export function useInfiniteProposals({ category = null, viewerKey = "anonymous" } = {}) {
  return useInfiniteQuery({
    queryKey: proposalKeys.list({ category, viewerKey }),
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchProposals({ category, cursor: pageParam }),
    getNextPageParam: getSafeNextCursor,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey?.[3] === viewerKey ? keepPreviousData(previousData) : undefined
  });
}

export function useProposal(proposalId, viewerKey = "anonymous") {
  return useQuery({
    queryKey: proposalKeys.detail(proposalId, viewerKey),
    enabled: Boolean(proposalId),
    queryFn: () => fetchProposal(proposalId)
  });
}

export function useInfiniteProposalComments({ proposalId, viewerKey = "anonymous" }) {
  return useInfiniteQuery({
    queryKey: proposalKeys.commentList(proposalId, viewerKey),
    enabled: Boolean(proposalId),
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchProposalComments({ proposalId, cursor: pageParam }),
    getNextPageParam: getSafeNextCursor
  });
}

export function useCreateProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) => createProposal(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: proposalKeys.lists() })
  });
}

export function useDeleteProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ proposalId }) => deleteProposal(proposalId),
    // 상세 화면이 아직 열려 있으므로 상세 캐시는 지우지 않는다. 지우면 곧바로 다시 조회해 404를 부른다.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: proposalKeys.lists() })
  });
}

function updateListItem(queryClient, proposalId, update) {
  queryClient.setQueriesData({ queryKey: proposalKeys.lists() }, (data) => {
    if (!data?.pages) return data;
    return {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => (item.id === proposalId ? update(item) : item))
      }))
    };
  });
}

function refreshProposal(queryClient, proposalId) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: proposalKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: proposalKeys.details(proposalId) })
  ]);
}

/**
 * 목록의 함께하고 싶어요 버튼이다. `interested`는 누르기 전 상태이며, 화면을 먼저 바꾸고 실패하면 서버 값으로 맞춘다.
 */
export function useToggleProposalInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ proposalId, interested }) =>
      interested ? removeProposalInterest(proposalId) : saveProposalInterest(proposalId),
    onMutate: ({ proposalId, interested }) =>
      updateListItem(queryClient, proposalId, (item) => ({
        ...item,
        interested: !interested,
        interestCount: Math.max(0, item.interestCount + (interested ? -1 : 1))
      })),
    onSettled: (_data, _error, { proposalId }) => refreshProposal(queryClient, proposalId)
  });
}

/** 상세에서 조건과 함께 응답을 저장한다. 이미 응답했다면 조건만 바뀐다. */
export function useSaveProposalInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ proposalId, conditions }) => saveProposalInterest(proposalId, conditions),
    onSuccess: (_data, { proposalId }) => refreshProposal(queryClient, proposalId)
  });
}

export function useRemoveProposalInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ proposalId }) => removeProposalInterest(proposalId),
    onSuccess: (_data, { proposalId }) => refreshProposal(queryClient, proposalId)
  });
}

export function useCreateProposalComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ proposalId, content }) => createProposalComment(proposalId, content),
    onSuccess: (_data, { proposalId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: proposalKeys.comments(proposalId) }),
        refreshProposal(queryClient, proposalId)
      ])
  });
}

export function useDeleteProposalComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }) => deleteProposalComment(commentId),
    onSuccess: (_data, { proposalId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: proposalKeys.comments(proposalId) }),
        refreshProposal(queryClient, proposalId)
      ])
  });
}
