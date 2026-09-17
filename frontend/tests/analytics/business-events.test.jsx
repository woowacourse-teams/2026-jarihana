import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";

import { createGroup } from "../../src/features/group/api.js";
import { useCreateGroup } from "../../src/features/group/hooks.js";
import { signupMember } from "../../src/features/member/api.js";
import { useSignupMember } from "../../src/features/member/hooks.js";
import { closeRecruitment, createRecruitment } from "../../src/features/recruitment/api.js";
import { useCloseRecruitment, useCreateRecruitment } from "../../src/features/recruitment/hooks.js";
import {
  createRegistration,
  decideRegistration,
  withdrawRegistration
} from "../../src/features/registration/api.js";
import {
  useCreateRegistration,
  useDecideRegistration,
  useWithdrawRegistration
} from "../../src/features/registration/hooks.js";
import { captureEvent } from "../../src/shared/analytics/index.js";

jest.mock("../../src/shared/analytics/index.js", () => ({
  captureEvent: jest.fn(),
  getPromotionAttribution: jest.fn(() => undefined)
}));
jest.mock("../../src/features/group/api.js");
jest.mock("../../src/features/member/api.js");
jest.mock("../../src/features/recruitment/api.js");
jest.mock("../../src/features/registration/api.js");

const cases = [
  {
    name: "signup_completed",
    useMutationHook: useSignupMember,
    api: signupMember,
    input: { crewName: "private name", memberType: "COACH" },
    response: { id: 42, crewName: "private name", memberType: "COACH" },
    properties: { member_id: 42 }
  },
  {
    name: "group_created",
    useMutationHook: useCreateGroup,
    api: createGroup,
    input: { type: "SESSION", name: "private group", description: "private description" },
    response: { id: 12, status: "ACTIVE" },
    properties: { group_id: 12, group_type: "SESSION", status: "ACTIVE" }
  },
  {
    name: "recruitment_created",
    useMutationHook: () => useCreateRecruitment(12),
    api: createRecruitment,
    input: { joinMethod: "APPROVAL" },
    response: { id: 45, groupId: 12, recruitingStatus: "OPEN" },
    properties: { group_id: 12, recruitment_id: 45, status: "OPEN" }
  },
  {
    name: "recruitment_closed",
    useMutationHook: () => useCloseRecruitment(12),
    api: closeRecruitment,
    input: { recruitmentId: 45 },
    response: { id: 45, recruitingStatus: "CLOSED" },
    properties: { group_id: 12, recruitment_id: 45, status: "CLOSED" }
  },
  {
    name: "registration_submitted",
    useMutationHook: () => useCreateRegistration(45, 12),
    api: createRegistration,
    input: { message: "private application" },
    response: { id: 88, status: "APPROVED" },
    properties: { group_id: 12, recruitment_id: 45, registration_id: 88, status: "APPROVED" }
  },
  {
    name: "registration_withdrawn",
    useMutationHook: () => useWithdrawRegistration(45),
    api: withdrawRegistration,
    input: 88,
    response: undefined,
    properties: { recruitment_id: 45, registration_id: 88 }
  },
  {
    name: "registration_decided",
    useMutationHook: () => useDecideRegistration(45),
    api: decideRegistration,
    input: { registrationId: 88, status: "REJECTED", rejectReason: "private reason" },
    response: { id: 88, status: "REJECTED", rejectReason: "private reason" },
    properties: { recruitment_id: 45, registration_id: 88, status: "REJECTED" }
  }
];

function renderMutation(hook) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const rendered = renderHook(hook, {
    wrapper: ({ children }) => (
      <StrictMode>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </StrictMode>
    )
  });
  return { ...rendered, client };
}

beforeEach(() => jest.clearAllMocks());

describe.each(cases)("$name", ({ name, useMutationHook, api, input, response, properties }) => {
  it("records one success with only safe properties before cache refresh", async () => {
    // Given
    api.mockResolvedValue(response);
    const { result, client, rerender } = renderMutation(useMutationHook);
    const invalidate = jest.spyOn(client, "invalidateQueries");

    // When
    await act(async () => result.current.mutateAsync(input));
    rerender();

    // Then
    expect(captureEvent).toHaveBeenCalledTimes(1);
    expect(captureEvent).toHaveBeenCalledWith(name, properties);
    expect(captureEvent.mock.invocationCallOrder[0]).toBeLessThan(
      invalidate.mock.invocationCallOrder[0]
    );
  });

  it("does not report success when the API rejects the mutation", async () => {
    // Given
    const error = new Error("request failed");
    api.mockRejectedValue(error);
    const { result } = renderMutation(useMutationHook);

    // When
    await act(async () => {
      await expect(result.current.mutateAsync(input)).rejects.toBe(error);
    });

    // Then
    expect(captureEvent).not.toHaveBeenCalled();
  });
});

it("keeps the API success event even when subsequent cache invalidation fails", async () => {
  // Given
  createRegistration.mockResolvedValue({ id: 88, status: "PENDING" });
  const { result, client } = renderMutation(() => useCreateRegistration(45, 12));
  const error = new Error("query refresh failed");
  jest.spyOn(client, "invalidateQueries").mockRejectedValue(error);

  // When
  await act(async () => {
    await expect(result.current.mutateAsync({ message: "private" })).rejects.toBe(error);
  });

  // Then
  expect(captureEvent).toHaveBeenCalledTimes(1);
  expect(captureEvent).toHaveBeenCalledWith("registration_submitted", {
    group_id: 12,
    recruitment_id: 45,
    registration_id: 88,
    status: "PENDING"
  });
});
