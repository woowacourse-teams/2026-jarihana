import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";

import { useGroup, useInfiniteGroups } from "../../src/features/group/index.js";
import { useInfiniteGroupMembers } from "../../src/features/member/index.js";
import { useInfiniteRecruitments, useRecruitment } from "../../src/features/recruitment/index.js";
import {
  registrationKeys,
  useDecideRegistration,
  useInfiniteMyRegistrations,
  useInfiniteRegistrations,
  useRegistrationSummary
} from "../../src/features/registration/index.js";

const mockInvalidateQueries = jest.fn();

jest.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: jest.fn((options) => options),
  useMutation: jest.fn((options) => options),
  useQuery: jest.fn((options) => options),
  useQueryClient: jest.fn(() => ({ invalidateQueries: mockInvalidateQueries }))
}));

describe("infinite query cursor guards", () => {
  beforeEach(() => {
    useInfiniteQuery.mockClear();
  });

  it.each([
    ["groups", () => useInfiniteGroups()],
    ["members", () => useInfiniteGroupMembers("1")],
    ["recruitments", () => useInfiniteRecruitments("1")],
    ["registrations", () => useInfiniteRegistrations("1")],
    ["my registrations", () => useInfiniteMyRegistrations()]
  ])("stops %s when the backend repeats a cursor", (_name, useDomainQuery) => {
    // Given
    const pages = [
      { items: [{ id: 1 }], nextCursor: "same", hasNext: true },
      { items: [{ id: 2 }], nextCursor: "same", hasNext: true }
    ];

    // When
    const options = useDomainQuery();
    const nextCursor = options.getNextPageParam(pages[1], pages);

    // Then
    expect(nextCursor).toBeUndefined();
  });
});

describe("identifier query guards", () => {
  beforeEach(() => {
    useInfiniteQuery.mockClear();
    useQuery.mockClear();
    useMutation.mockClear();
    mockInvalidateQueries.mockClear();
  });

  it.each([
    ["group", () => useGroup("")],
    ["members", () => useInfiniteGroupMembers(0)],
    ["recruitment group", () => useRecruitment("", "2")],
    ["recruitment", () => useRecruitment("1", "")],
    ["recruitment list", () => useInfiniteRecruitments(0)],
    ["registration list", () => useInfiniteRegistrations("")]
  ])("disables the %s query for a falsey identifier", (_name, useDomainQuery) => {
    // Given
    const expectedEnabled = false;

    // When
    const options = useDomainQuery();

    // Then
    expect(options.enabled).toBe(expectedEnabled);
  });

  it("uses focused polling only for the registration summary query", () => {
    // Given
    const groupId = "17";

    // When
    const options = useRegistrationSummary(groupId);

    // Then
    expect(options).toEqual(
      expect.objectContaining({
        enabled: true,
        queryKey: registrationKeys.groupSummary(groupId),
        refetchInterval: 30000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: true
      })
    );
  });

  it("invalidates registration summaries after a leader decision", async () => {
    // Given
    const options = useDecideRegistration("23");

    // When
    await options.onSuccess();

    // Then
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: registrationKeys.groupSummaries()
    });
  });
});
