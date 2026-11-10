import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { ShopPage } from "../../../src/pages/shop/ShopPage.jsx";
import { shopApi } from "../../../src/features/shop/api.js";

jest.mock("react-router", () => ({
  Link: ({ to, children, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  )
}));
jest.mock("../../../src/features/auth/index.js", () => ({
  useAuth: () => ({ member: { id: "1" }, sessionVersion: 1, status: "authenticated" })
}));
jest.mock("../../../src/features/points/hooks.js", () => ({
  usePointSummary: () => ({ data: { balance: 85, enabled: false, processing: false } })
}));
jest.mock("../../../src/features/shop/api.js", () => ({
  shopApi: { catalog: jest.fn() },
  createShopClient: jest.fn()
}));
jest.mock("../../../src/features/shop/ShopAvatarPreview.jsx", () => ({ ShopAvatarPreview: () => <div /> }));

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
