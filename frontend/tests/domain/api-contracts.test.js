import { apiRequest } from "../../src/shared/api/index.js";
import { closeRecruitment, createRecruitment } from "../../src/features/recruitment/index.js";
import {
  createRegistration,
  decideRegistration,
  fetchRegistrationSummary,
  fetchMyRegistrations
} from "../../src/features/registration/index.js";
import {
  fetchGroups,
  removeRecurringSchedule,
  terminateGroup
} from "../../src/features/group/index.js";
import { signupMember, transferLeader } from "../../src/features/member/index.js";

jest.mock("../../src/shared/api/index.js", () => ({ apiRequest: jest.fn() }));

describe("domain API adapters", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue(undefined);
  });

  it("sends only populated group search parameters", async () => {
    // Given
    const filters = { status: "ACTIVE", keyword: " ", cursor: null, recruiting: false };

    // When
    await fetchGroups(filters);

    // Then
    expect(apiRequest).toHaveBeenCalledWith(
      "groups",
      expect.objectContaining({ searchParams: { status: "ACTIVE", recruiting: false } })
    );
  });

  it("sends the exact group termination payload", async () => {
    // Given
    const groupId = 17;

    // When
    await terminateGroup(groupId);

    // Then
    expect(apiRequest).toHaveBeenCalledWith(
      "groups/17",
      expect.objectContaining({ method: "patch", json: { status: "ENDED" } })
    );
  });

  it("does not attach a schema to the 204 schedule removal", async () => {
    // Given
    const groupId = 17;

    // When
    await removeRecurringSchedule(groupId);

    // Then
    expect(apiRequest).toHaveBeenCalledWith("groups/17/recurring-schedule", { method: "delete" });
  });

  it("sends the exact leader transfer payload", async () => {
    // Given
    const groupId = 17;
    const groupMemberId = 31;

    // When
    await transferLeader(groupId, groupMemberId);

    // Then
    expect(apiRequest).toHaveBeenCalledWith(
      "groups/17/leader",
      expect.objectContaining({ method: "put", json: { groupMemberId: 31 } })
    );
  });

  it("keeps member signup out of the access-token refresh path", async () => {
    // Given
    const values = { crewName: "자리", generation: 1, course: "FRONTEND" };

    // When
    await signupMember(values);

    // Then
    expect(apiRequest).toHaveBeenCalledWith(
      "members",
      expect.objectContaining({ method: "post", json: values, skipAuthRefresh: true })
    );
  });

  it("rejects an invalid crew name before member signup reaches HTTP", () => {
    // Given
    const values = { crewName: "seat", generation: 1, course: "FRONTEND" };

    // When
    const signup = () => signupMember(values);

    // Then
    expect(signup).toThrow();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("preserves local date-time strings when creating recruitment", async () => {
    // Given
    const values = {
      joinMethod: "APPROVAL",
      capacity: 5,
      startsAt: "2026-08-21T20:00",
      endsAt: "2026-08-21T22:00"
    };

    // When
    await createRecruitment(17, values);

    // Then
    expect(apiRequest).toHaveBeenCalledWith(
      "groups/17/recruitments",
      expect.objectContaining({ method: "post", json: values })
    );
  });

  it("uses the backend close status field", async () => {
    // Given
    const groupId = 17;
    const recruitmentId = 23;

    // When
    await closeRecruitment(groupId, recruitmentId);

    // Then
    expect(apiRequest).toHaveBeenCalledWith(
      "groups/17/recruitments/23",
      expect.objectContaining({ method: "patch", json: { recruitingStatus: "CLOSED" } })
    );
  });

  it("forces applicant=me for the member registration list", async () => {
    // Given
    const filters = { applicant: "someone-else", status: "PENDING" };

    // When
    await fetchMyRegistrations(filters);

    // Then
    expect(apiRequest).toHaveBeenCalledWith(
      "registrations",
      expect.objectContaining({ searchParams: { applicant: "me", status: "PENDING" } })
    );
  });

  it("uses APPROVED and omits an approval reason", async () => {
    // Given
    const decision = { status: "APPROVED" };

    // When
    await decideRegistration(23, 29, decision);

    // Then
    expect(apiRequest).toHaveBeenCalledWith(
      "recruitments/23/registrations/29",
      expect.objectContaining({ method: "patch", json: decision })
    );
  });

  it("uses the recruitment-scoped registration create path", async () => {
    // Given
    const values = { message: null };

    // When
    await createRegistration(23, values);

    // Then
    expect(apiRequest).toHaveBeenCalledWith(
      "recruitments/23/registrations",
      expect.objectContaining({ method: "post", json: values })
    );
  });

  it("uses the group-scoped registration summary path", async () => {
    // Given
    const groupId = 17;

    // When
    await fetchRegistrationSummary(groupId);

    // Then
    expect(apiRequest).toHaveBeenCalledWith(
      "groups/17/registrations/summary",
      expect.objectContaining({ schema: expect.any(Object) })
    );
  });
});
