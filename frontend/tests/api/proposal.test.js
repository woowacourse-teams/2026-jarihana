import {
  hasInterestConditions,
  proposalDetailSchema,
  proposalPageSchema,
  validateProposalForm
} from "../../src/entities/proposal/index.js";
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
} from "../../src/features/proposal/api.js";
import { apiRequest } from "../../src/shared/api/index.js";

jest.mock("../../src/shared/api/index.js", () => ({ apiRequest: jest.fn() }));

describe("proposal API", () => {
  beforeEach(() => apiRequest.mockReset());

  it("requests proposals with the optional category and cursor", async () => {
    await fetchProposals({ category: "CULTURE", cursor: "next" });
    await fetchProposals();

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      "proposals",
      expect.objectContaining({ searchParams: { category: "CULTURE", cursor: "next", size: 20 } })
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "proposals",
      expect.objectContaining({ searchParams: { size: 20 } })
    );
  });

  it("creates, reads and hides one proposal through its resource routes", async () => {
    const values = { category: "STUDY", content: "같이 리뷰해요", moodOptions: [], title: "코드 리뷰" };

    await createProposal(values);
    await fetchProposal(42);
    await deleteProposal(42);

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      "proposals",
      expect.objectContaining({ json: values, method: "post" })
    );
    expect(apiRequest).toHaveBeenNthCalledWith(2, "proposals/42", expect.objectContaining({ schema: expect.any(Object) }));
    expect(apiRequest).toHaveBeenNthCalledWith(3, "proposals/42", { method: "delete" });
  });

  it("sends an empty interest from the list and full conditions from the detail page", async () => {
    await saveProposalInterest(42);
    await saveProposalInterest(42, { meetingModes: ["ONLINE"], moodIndexes: [1], timeSlots: ["WEEKDAY_EVENING"] });
    await removeProposalInterest(42);

    expect(apiRequest).toHaveBeenNthCalledWith(1, "proposals/42/interest", {
      json: { meetingModes: [], moodIndexes: [], timeSlots: [] },
      method: "put"
    });
    expect(apiRequest).toHaveBeenNthCalledWith(2, "proposals/42/interest", {
      json: { meetingModes: ["ONLINE"], moodIndexes: [1], timeSlots: ["WEEKDAY_EVENING"] },
      method: "put"
    });
    expect(apiRequest).toHaveBeenNthCalledWith(3, "proposals/42/interest", { method: "delete" });
  });

  it("reads and writes comments through the proposal comment routes", async () => {
    await fetchProposalComments({ cursor: "c1", proposalId: 42 });
    await createProposalComment(42, "평일 저녁이면 좋아요");
    await deleteProposalComment(7);

    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      "proposals/42/comments",
      expect.objectContaining({ searchParams: { cursor: "c1", size: 20 } })
    );
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      "proposals/42/comments",
      expect.objectContaining({ json: { content: "평일 저녁이면 좋아요" }, method: "post" })
    );
    expect(apiRequest).toHaveBeenNthCalledWith(3, "proposal-comments/7", { method: "delete" });
  });
});

describe("proposal schemas", () => {
  it("parses a list page and a detail with condition counts", () => {
    const page = proposalPageSchema.parse({
      hasNext: false,
      items: [
        {
          authorAvatarUrl: "https://avatars.githubusercontent.com/u/1",
          authorNickname: "모카",
          category: "CULTURE",
          commentCount: 1,
          content: "완독하지 않아도 괜찮아요.",
          createdAt: "2026-10-27T10:00:00",
          id: 42,
          interestCount: 3,
          interested: true,
          title: "독서 모임"
        }
      ],
      nextCursor: null
    });
    const detail = proposalDetailSchema.parse({
      authorAvatarUrl: null,
      authorNickname: "모카",
      canDelete: false,
      category: "CULTURE",
      commentCount: 0,
      content: "본문",
      createdAt: "2026-10-27T10:00:00",
      id: 42,
      interestCount: 2,
      meetingModeCounts: [
        { count: 1, meetingMode: "ONLINE" },
        { count: 0, meetingMode: "OFFLINE" }
      ],
      moodCounts: [1, 0],
      moodOptions: ["자유 도서", "지정 도서"],
      myInterest: { meetingModes: [], moodIndexes: [], timeSlots: [] },
      timeSlotCounts: [{ count: 2, timeSlot: "WEEKDAY_EVENING" }],
      title: "독서 모임"
    });

    expect(page.items[0].interested).toBe(true);
    expect(detail.moodCounts).toEqual([1, 0]);
    expect(hasInterestConditions(detail.myInterest)).toBe(false);
    expect(hasInterestConditions({ meetingModes: [], moodIndexes: [0], timeSlots: [] })).toBe(true);
  });
});

describe("validateProposalForm", () => {
  it("trims values and drops blank mood options", () => {
    const { errors, values } = validateProposalForm({
      category: "SPORT",
      content: "  아침에 같이 뛰어요  ",
      moodOptions: [" 걷뛰 섞어서 ", "  "],
      title: "  아침 러닝  "
    });

    expect(errors).toEqual({});
    expect(values).toEqual({
      category: "SPORT",
      content: "아침에 같이 뛰어요",
      moodOptions: ["걷뛰 섞어서"],
      title: "아침 러닝"
    });
  });

  it("reports the same limits the server enforces", () => {
    const { errors } = validateProposalForm({
      category: null,
      content: " ",
      moodOptions: ["같은 말", "같은 말"],
      title: "가".repeat(51)
    });

    expect(errors).toEqual({
      category: "분야를 골라 주세요.",
      content: "내용을 입력해 주세요.",
      moodOptions: "분위기 선택지가 서로 겹치지 않아야 해요.",
      title: "제목은 50자 이하여야 해요."
    });
  });
});
