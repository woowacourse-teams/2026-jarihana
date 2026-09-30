import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import * as registrationHooks from "../../../src/features/registration/index.js";
import { MyRegistrationsPage } from "../../../src/pages/account/MyRegistrationsPage.jsx";
import { ToastProvider } from "../../../src/shared/ui/Toast.jsx";

jest.mock("../../../src/features/registration/index.js", () => ({
  useInfiniteMyRegistrations: jest.fn(),
  useWithdrawRegistration: jest.fn()
}));
jest.mock("react-router", () => ({
  Link: ({ children, to, ...props }) => (
    <a href={typeof to === "string" ? to : "/"} {...props}>
      {children}
    </a>
  )
}));

const pendingRegistration = {
  id: 88,
  group: { id: 12, name: "알고리즘 스터디", representativeImageUrl: null },
  recruitmentId: 45,
  message: null,
  status: "PENDING",
  registeredAt: "2026-08-21T10:00:00",
  rejectReason: null,
  decidedAt: null,
  decidedBy: null
};

function renderRegistrations(items) {
  registrationHooks.useInfiniteMyRegistrations.mockReturnValue({
    data: { pages: [{ items, nextCursor: null, hasNext: false }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn()
  });
  return render(
    <ToastProvider>
      <MyRegistrationsPage />
    </ToastProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  registrationHooks.useWithdrawRegistration.mockReturnValue({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false
  });
});

it("shows withdrawal for an open pending application", async () => {
  const user = userEvent.setup();
  renderRegistrations([{ ...pendingRegistration, canWithdraw: true }]);

  await user.click(screen.getByRole("button", { name: "신청 철회" }));
  expect(screen.getByRole("button", { name: "철회하기" })).toHaveAttribute(
    "data-ph-capture-attribute-action",
    "registration_withdraw_confirm"
  );
  await user.click(screen.getByRole("button", { name: "철회하기" }));

  expect(registrationHooks.useWithdrawRegistration().mutateAsync).toHaveBeenCalledWith(88);
});

it("hides withdrawal for an approved application", () => {
  renderRegistrations([{ ...pendingRegistration, status: "APPROVED", canWithdraw: true }]);

  expect(screen.queryByRole("button", { name: "신청 철회" })).not.toBeInTheDocument();
});

it("hides withdrawal for a closed pending application", () => {
  renderRegistrations([{ ...pendingRegistration, canWithdraw: false }]);

  expect(screen.getByRole("link", { name: "알고리즘 스터디" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "신청 철회" })).not.toBeInTheDocument();
});
