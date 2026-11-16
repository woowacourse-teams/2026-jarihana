import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { ShopPage } from "../../../src/pages/shop/ShopPage.jsx";
import userEvent from "@testing-library/user-event";
import { createShopClient, shopApi } from "../../../src/features/shop/api.js";
import { createDemoShopClient } from "../../../src/features/shop/demoClient.js";

let mockMember;
const mockReload = jest.fn();

jest.mock("react-router", () => ({
  Link: ({ to, children, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  )
}));
jest.mock("../../../src/features/auth/index.js", () => ({
  useAuth: () => ({ member: mockMember, sessionVersion: 1, status: "authenticated", reload: mockReload })
}));
jest.mock("../../../src/features/points/hooks.js", () => ({
  usePointSummary: () => ({ data: { balance: 85, enabled: false, processing: false } })
}));
jest.mock("../../../src/features/shop/api.js", () => ({
  shopApi: { catalog: jest.fn() },
  createShopClient: jest.fn()
}));
jest.mock("../../../src/features/shop/ShopAvatarPreview.jsx", () => ({ ShopAvatarPreview: () => <div /> }));

beforeEach(() => {
  jest.resetAllMocks();
  mockMember = { id: 1 };
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ShopPage />
    </QueryClientProvider>
  );
}

it("적립 중지 여부와 관계없이 실제 잔액을 체험 포인트와 구분해 표시한다", async () => {
  shopApi.catalog.mockResolvedValue({ purchasingEnabled: false, products: [], categories: [] });
  setup();
  expect(await screen.findByRole("heading", { name: "득템하나?" })).toBeInTheDocument();
  expect(screen.getByText("85 P")).toBeInTheDocument();
  expect(screen.getByLabelText("체험 포인트 1,200 P")).toBeInTheDocument();
});

it("상점 서버 오류를 체험 구매로 숨기지 않는다", async () => {
  shopApi.catalog.mockRejectedValue({ status: 500 });
  setup();
  expect(await screen.findByRole("alert")).toHaveTextContent("상점을 불러오지 못했어요");
  expect(screen.queryByRole("button", { name: "구매하기" })).not.toBeInTheDocument();
});

it("계정 변경으로 거절된 구매를 닫고 새 계정의 잔액과 확인 요청을 사용한다", async () => {
  const user = userEvent.setup();
  const original = createDemoShopClient({ initialBalance: 1200 });
  const current = createDemoShopClient({ initialBalance: 750 });
  const purchase = jest.fn()
    .mockRejectedValueOnce({ code: "ACCOUNT_CHANGED" })
    .mockImplementation((request) => current.purchaseProduct(request));
  createShopClient.mockImplementation(() => ({
    ...(mockMember.id === 1 ? original : current),
    isLive: true,
    purchaseProduct: purchase
  }));
  shopApi.catalog.mockResolvedValue({ purchasingEnabled: true });
  mockReload.mockImplementation(async () => { mockMember = { id: 2 }; });

  setup();
  expect(await screen.findByLabelText("내 포인트 1,200 P")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "구매하기" }));
  await user.click(screen.getByRole("button", { name: "300 P 구매 확정" }));

  expect(await screen.findByLabelText("내 포인트 750 P")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mockReload).toHaveBeenCalledTimes(1);
  expect(purchase).toHaveBeenCalledTimes(1);
  expect(purchase.mock.calls[0][0].expectedMemberId).toBe(1);

  await user.click(screen.getByRole("button", { name: "구매하기" }));
  await user.click(screen.getByRole("button", { name: "300 P 구매 확정" }));
  await waitFor(() => expect(screen.getByLabelText("내 포인트 450 P")).toBeInTheDocument());
  expect(purchase.mock.calls[1][0].expectedMemberId).toBe(2);
  expect(purchase.mock.calls[1][0].requestId).not.toBe(purchase.mock.calls[0][0].requestId);
});
