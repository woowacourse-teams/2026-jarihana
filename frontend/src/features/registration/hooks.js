import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSafeNextCursor } from "../../entities/cursor/index.js";
import { captureEvent, getPromotionAttribution } from "../../shared/analytics/index.js";
import { groupKeys } from "../group/index.js";
import { recruitmentKeys } from "../recruitment/index.js";
import {
  createRegistration,
  decideRegistration,
  fetchMyRegistrations,
  fetchRegistrationSummary,
  fetchRegistrations,
  markRegistrationsRead,
  withdrawRegistration
} from "./api.js";

export const registrationKeys = {
  all: ["registrations"],
  applicantLists: () => ["registrations", "applicants"],
  applicants: (recruitmentId, filters) => ["registrations", "applicants", recruitmentId, filters],
  groupSummaries: () => ["registrations", "summary"],
  groupSummary: (groupId) => ["registrations", "summary", groupId],
  myLists: () => ["registrations", "my"],
  mine: (filters) => ["registrations", "my", filters]
};

export function useInfiniteRegistrations(recruitmentId, filters = {}) {
  return useInfiniteQuery({
    queryKey: registrationKeys.applicants(recruitmentId, filters),
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      fetchRegistrations(recruitmentId, { ...filters, cursor: pageParam }),
    getNextPageParam: getSafeNextCursor,
    enabled: Boolean(recruitmentId)
  });
}

export function useInfiniteMyRegistrations(filters = {}) {
  return useInfiniteQuery({
    queryKey: registrationKeys.mine(filters),
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchMyRegistrations({ ...filters, cursor: pageParam }),
    getNextPageParam: getSafeNextCursor
  });
}

export function useRegistrationSummary(groupId) {
  return useQuery({
    queryKey: registrationKeys.groupSummary(groupId),
    queryFn: () => fetchRegistrationSummary(groupId),
    enabled: Boolean(groupId),
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    refetchIntervalInBackground: false
  });
}

export function useMarkRegistrationsRead(recruitmentId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (throughRegistrationId) =>
      markRegistrationsRead(recruitmentId, throughRegistrationId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: registrationKeys.groupSummaries() })
  });
}

function invalidateRegistrationViews(queryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: registrationKeys.applicantLists() }),
    queryClient.invalidateQueries({ queryKey: registrationKeys.groupSummaries() }),
    queryClient.invalidateQueries({ queryKey: registrationKeys.myLists() }),
    queryClient.invalidateQueries({ queryKey: recruitmentKeys.all }),
    queryClient.invalidateQueries({ queryKey: groupKeys.all })
  ]);
}

export function useCreateRegistration(recruitmentId, groupId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values) => createRegistration(recruitmentId, values),
    onSuccess: (registration) => {
      const promotionId = getPromotionAttribution(groupId)?.promotion_id;
      captureEvent("registration_submitted", {
        ...(groupId !== undefined ? { group_id: groupId } : {}),
        recruitment_id: recruitmentId,
        registration_id: registration.id,
        status: registration.status,
        ...(promotionId ? { promotion_id: promotionId } : {})
      });
      return invalidateRegistrationViews(queryClient);
    }
  });
}

export function useWithdrawRegistration(recruitmentId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registrationId) => withdrawRegistration(recruitmentId, registrationId),
    onSuccess: (_data, registrationId) => {
      captureEvent("registration_withdrawn", {
        recruitment_id: recruitmentId,
        registration_id: registrationId
      });
      return invalidateRegistrationViews(queryClient);
    }
  });
}

export function useDecideRegistration(recruitmentId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ registrationId, status, rejectReason }) =>
      decideRegistration(recruitmentId, registrationId, {
        status,
        ...(rejectReason ? { rejectReason } : {})
      }),
    onSuccess: (registration, { registrationId }) => {
      captureEvent("registration_decided", {
        recruitment_id: recruitmentId,
        registration_id: registrationId,
        status: registration.status
      });
      return invalidateRegistrationViews(queryClient);
    }
  });
}
