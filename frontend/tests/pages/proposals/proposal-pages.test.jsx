import { fireEvent, render, screen, within } from "@testing-library/react";
import { useLocation, useParams, useSearchParams } from "react-router";

import { storeReturnTarget, useAuth } from "../../../src/features/auth/index.js";
import {
  useCreateProposal,
  useInfiniteProposalComments,
  useInfiniteProposals,
  useProposal,
  useRemoveProposalInterest,
  useSaveProposalInterest,
  useToggleProposalInterest
} from "../../../src/features/proposal/hooks.js";
import { ProposalBoardPage } from "../../../src/pages/proposals/ProposalBoardPage.jsx";
import { ProposalCreatePage } from "../../../src/pages/proposals/ProposalCreatePage.jsx";
import { ProposalDetailPage } from "../../../src/pages/proposals/ProposalDetailPage.jsx";
import { ToastProvider } from "../../../src/shared/ui/Toast.jsx";

const mockNavigate = jest.fn();

jest.mock("../../../src/features/auth/index.js", () => ({
  storeReturnTarget: jest.fn(),
  useAuth: jest.fn()
}));

jest.mock("react-router", () => ({
  Link: ({ children, state: _state, to, ...properties }) => (
    <a href={typeof to === "string" ? to : "/"} {...properties}>
      {children}
    </a>
  ),
  useLocation: jest.fn(),
  useNavigate: () => mockNavigate,
  useParams: jest.fn(),
  useSearchParams: jest.fn()
}));

jest.mock("../../../src/features/proposal/hooks.js", () => ({
  useCreateProposal: jest.fn(),
  useCreateProposalComment: () => ({ isPending: false, mutate: jest.fn() }),
  useDeleteProposal: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useDeleteProposalComment: () => ({ isPending: false, mutate: jest.fn() }),
  useInfiniteProposalComments: jest.fn(),
  useInfiniteProposals: jest.fn(),
  useProposal: jest.fn(),
  useRemoveProposalInterest: jest.fn(),
  useSaveProposalInterest: jest.fn(),
  useToggleProposalInterest: jest.fn()
}));

const proposal = {
  authorAvatarUrl: null,
  authorNickname: "모카",
  canDelete: false,
  category: "CULTURE",
  commentCount: 0,
  content: "완독하지 않아도 괜찮아요.\n\n일주일에 한 번 문장을 나눠요.",
  createdAt: "2026-10-27T10:00:00",
  id: 42,
  interestCount: 2,
  meetingModeCounts: [
    { count: 2, meetingMode: "ONLINE" },
    { count: 0, meetingMode: "OFFLINE" }
  ],
  moodCounts: [1, 0, 1],
  moodOptions: ["자유 도서", "지정 도서", "초보 환영"],
  myInterest: null,
  timeSlotCounts: [
    { count: 0, timeSlot: "WEEKDAY_MORNING" },
    { count: 2, timeSlot: "WEEKDAY_EVENING" },
    { count: 0, timeSlot: "WEEKEND_MORNING" },
    { count: 1, timeSlot: "WEEKEND_AFTERNOON" }
  ],
  title: "각자 읽고 같이 나누는 독서 모임"
};

function renderWithToast(element) {
  return render(<ToastProvider duration={0}>{element}</ToastProvider>);
}

function authenticated() {
  useAuth.mockReturnValue({ login: jest.fn(), member: { id: 7 }, status: "authenticated" });
}

beforeEach(() => {
  jest.clearAllMocks();
  useLocation.mockReturnValue({ pathname: "/board/42", search: "", state: null });
  useParams.mockReturnValue({ proposalId: "42" });
  useSearchParams.mockReturnValue([new URLSearchParams(), jest.fn()]);
  useInfiniteProposalComments.mockReturnValue({
    data: { pages: [{ hasNext: false, items: [], nextCursor: null }] },
    hasNextPage: false,
    isError: false,
    isLoading: false
  });
});

describe("ProposalBoardPage", () => {
  const toggle = { isPending: false, mutate: jest.fn(), variables: null };

  beforeEach(() => {
    useToggleProposalInterest.mockReturnValue(toggle);
    useInfiniteProposals.mockReturnValue({
      data: {
        pages: [
          {
            hasNext: false,
            items: [
              {
                authorAvatarUrl: null,
                authorNickname: "모카",
                category: "CULTURE",
                commentCount: 1,
                content: proposal.content,
                createdAt: proposal.createdAt,
                id: 42,
                interestCount: 2,
                interested: false,
                title: proposal.title
              }
            ],
            nextCursor: null
          }
        ]
      },
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isError: false,
      isFetchingNextPage: false,
      isLoading: false
    });
  });

  it("opens a proposal as a new page and sends interest in one click", () => {
    authenticated();
    renderWithToast(<ProposalBoardPage />);

    expect(screen.getByRole("link", { name: proposal.title })).toHaveAttribute("href", "/board/42");
    fireEvent.click(screen.getByRole("button", { name: /함께하고 싶어요/ }));

    expect(toggle.mutate).toHaveBeenCalledWith({ interested: false, proposalId: 42 }, expect.any(Object));
  });

  it("asks anonymous visitors to log in and returns them to the board", () => {
    const login = jest.fn();
    useAuth.mockReturnValue({ login, status: "anonymous" });
    renderWithToast(<ProposalBoardPage />);

    fireEvent.click(screen.getByRole("button", { name: /함께하고 싶어요/ }));

    expect(toggle.mutate).not.toHaveBeenCalled();
    expect(storeReturnTarget).toHaveBeenCalledWith("/board/42");
    expect(login).toHaveBeenCalled();
  });

  it("keeps the selected category in the address", () => {
    authenticated();
    const setSearchParams = jest.fn();
    useSearchParams.mockReturnValue([new URLSearchParams("category=CULTURE"), setSearchParams]);
    renderWithToast(<ProposalBoardPage />);

    expect(screen.getByRole("button", { name: "문화" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "스터디" }));

    expect(setSearchParams.mock.calls[0][0].get("category")).toBe("STUDY");
    expect(useInfiniteProposals).toHaveBeenCalledWith({ category: "CULTURE", viewerKey: 7 });
  });
});

describe("ProposalDetailPage", () => {
  const save = { isPending: false, mutate: jest.fn() };
  const remove = { isPending: false, mutate: jest.fn() };

  beforeEach(() => {
    useSaveProposalInterest.mockReturnValue(save);
    useRemoveProposalInterest.mockReturnValue(remove);
  });

  it("shows gathered counts and sends chosen conditions in declaration order", () => {
    authenticated();
    useProposal.mockReturnValue({ data: proposal, isError: false, isLoading: false });
    renderWithToast(<ProposalDetailPage />);

    expect(screen.getByRole("heading", { level: 1, name: proposal.title })).toBeInTheDocument();
    expect(screen.getByText("응답 2명 기준이에요. 여러 개 고른 응답도 있고, 조건 없이 마음만 보낸 사람도 인원에 들어가요.")).toBeInTheDocument();
    const panel = screen.getByRole("complementary", { name: "함께하고 싶어요 응답" });
    expect(within(panel).getByRole("button", { name: /조건 없이 함께하고 싶어요/ })).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "주말 오후" }));
    fireEvent.click(within(panel).getByRole("button", { name: "평일 저녁" }));
    fireEvent.click(within(panel).getByRole("button", { name: "초보 환영" }));
    fireEvent.click(within(panel).getByRole("button", { name: /이 조건이면 함께할래요/ }));

    expect(save.mutate).toHaveBeenCalledWith(
      {
        conditions: { meetingModes: [], moodIndexes: [2], timeSlots: ["WEEKDAY_EVENING", "WEEKEND_AFTERNOON"] },
        proposalId: 42
      },
      expect.any(Object)
    );
  });

  it("asks a member who only sent interest to add conditions and lets them cancel", () => {
    authenticated();
    useProposal.mockReturnValue({
      data: { ...proposal, myInterest: { meetingModes: [], moodIndexes: [], timeSlots: [] } },
      isError: false,
      isLoading: false
    });
    renderWithToast(<ProposalDetailPage />);

    expect(screen.getByRole("heading", { name: "조건도 알려 주실래요?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "응답 취소" }));

    expect(remove.mutate).toHaveBeenCalledWith({ proposalId: 42 }, expect.any(Object));
  });

  it("summarizes a sent response with its conditions", () => {
    authenticated();
    useProposal.mockReturnValue({
      data: {
        ...proposal,
        myInterest: { meetingModes: ["ONLINE"], moodIndexes: [0], timeSlots: ["WEEKDAY_EVENING"] }
      },
      isError: false,
      isLoading: false
    });
    renderWithToast(<ProposalDetailPage />);

    expect(screen.getByRole("heading", { name: "내 응답" })).toBeInTheDocument();
    expect(screen.getByText("평일 저녁", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("자유 도서", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "응답 고치기" })).toBeInTheDocument();
  });

  it("shows a not found state for a deleted proposal", () => {
    authenticated();
    useProposal.mockReturnValue({
      data: undefined,
      error: { code: "PROPOSAL_NOT_FOUND", status: 404 },
      isError: true,
      isLoading: false
    });
    renderWithToast(<ProposalDetailPage />);

    expect(screen.getByText("모임 제안을 찾을 수 없어요")).toBeInTheDocument();
  });
});

describe("ProposalCreatePage", () => {
  it("validates before sending and submits trimmed values", () => {
    const create = { isPending: false, mutate: jest.fn() };
    useCreateProposal.mockReturnValue(create);
    renderWithToast(<ProposalCreatePage />);

    fireEvent.click(screen.getByRole("button", { name: "제안 올리기" }));
    expect(screen.getByText("분야를 골라 주세요.")).toBeInTheDocument();
    expect(create.mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "운동" }));
    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: "  아침 러닝  " } });
    fireEvent.change(screen.getByLabelText(/어떤 모임인가요/), { target: { value: "같이 뛰어요" } });
    fireEvent.click(screen.getByRole("button", { name: /선택지 더하기/ }));
    fireEvent.change(screen.getByLabelText("분위기 선택지 1"), { target: { value: " 초보 환영 " } });
    fireEvent.click(screen.getByRole("button", { name: "제안 올리기" }));

    expect(create.mutate).toHaveBeenCalledWith(
      { category: "SPORT", content: "같이 뛰어요", moodOptions: ["초보 환영"], title: "아침 러닝" },
      expect.any(Object)
    );
  });
});
