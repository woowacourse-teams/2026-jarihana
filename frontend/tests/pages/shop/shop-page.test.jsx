import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createDemoShopClient } from "../../../src/features/shop/demoClient.js";
import { ShopPreview } from "../../../src/pages/shop/ShopPage.jsx";

jest.mock("react-router", () => ({
  Link: ({ to, children, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  )
}));
jest.mock("../../../src/features/auth/index.js", () => ({
  useAuth: () => ({ member: null, sessionVersion: 0 })
}));
jest.mock("../../../src/features/shop/ShopAvatarPreview.jsx", () => ({
  ShopAvatarPreview: ({ appearance }) => (
    <div data-testid="avatar-preview">{JSON.stringify(appearance)}</div>
  )
}));

async function setup(client = createDemoShopClient()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ShopPreview client={client} />
    </QueryClientProvider>
  );
  await screen.findByRole("heading", { name: "득템하나?" });
  return { client, user: userEvent.setup() };
}

const details = () => screen.getByRole("region", { name: "선택한 상품" });
const dialog = () => screen.getByRole("dialog", { name: "이 아이템을 구매할까요?" });

it("구매 취소는 차감하지 않고 확정 후 상점에서 보유·잔액·착용 상태를 갱신한다", async () => {
  const { client, user } = await setup();
  const product = screen.getByRole("button", { name: "민트 베레모 상세 보기" });
  expect(product).toHaveTextContent("300 P");
  await user.click(within(details()).getByRole("button", { name: "구매하기" }));
  expect(dialog()).toHaveTextContent("900 P");
  await user.click(within(dialog()).getByRole("button", { name: "돌아가기" }));
  expect((await client.getPointBalance()).balance).toBe(1200);
  await user.click(within(details()).getByRole("button", { name: "구매하기" }));
  await user.click(within(dialog()).getByRole("button", { name: "300 P 구매 확정" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByLabelText("체험 포인트 900 P")).toBeInTheDocument();
  expect(product).toHaveTextContent("보유 중");
  expect(product).not.toHaveTextContent("300 P");
  expect(details()).not.toHaveTextContent("300 P");
  expect(within(details()).queryByRole("button", { name: "구매하기" })).not.toBeInTheDocument();
  await user.click(within(details()).getByRole("button", { name: "체험 캐릭터에 착용" }));
  expect(await within(details()).findByRole("button", { name: "착용 해제" })).toBeEnabled();
  expect((await client.getOwnedItems()).equipped).toEqual({ hat: "demo-item-beret" });
  await user.click(within(details()).getByRole("button", { name: "착용 해제" }));
  await waitFor(() =>
    expect(within(details()).getByRole("button", { name: "체험 캐릭터에 착용" })).toBeEnabled()
  );
  expect((await client.getOwnedItems()).items.map((item) => item.itemId)).toContain(
    "demo-item-beret"
  );
});

it("구매 결과를 잃어도 재시도는 같은 요청 키를 사용해 중복 차감을 막는다", async () => {
  const client = createDemoShopClient();
  const original = client.purchaseProduct;
  client.purchaseProduct = jest
    .fn()
    .mockImplementationOnce(async (request) => {
      await original(request);
      throw new Error("response lost");
    })
    .mockImplementation(original);
  const { user } = await setup(client);
  await user.click(within(details()).getByRole("button", { name: "구매하기" }));
  await user.click(within(dialog()).getByRole("button", { name: "300 P 구매 확정" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("같은 요청의 결과");
  await user.click(within(dialog()).getByRole("button", { name: "구매 결과 다시 확인" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(client.purchaseProduct.mock.calls[0][0]).toEqual(client.purchaseProduct.mock.calls[1][0]);
  expect((await client.getPointBalance()).balance).toBe(900);
  expect(screen.getByLabelText("체험 포인트 900 P")).toBeInTheDocument();
});

it("포인트 부족과 판매 종료를 구분하고 카테고리로 상품을 찾는다", async () => {
  const { user } = await setup();
  await user.click(screen.getByRole("button", { name: "반짝이는 내 자리 상세 보기" }));
  expect(within(details()).getByRole("button", { name: "포인트 부족" })).toBeDisabled();
  expect(details()).toHaveTextContent("600 P 더 필요해요");
  await user.click(screen.getByRole("button", { name: "여름의 선글라스 상세 보기" }));
  expect(within(details()).getByRole("button", { name: "판매 종료" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "프로필 꾸미기 2" }));
  expect(screen.getAllByRole("button", { name: /상세 보기/ })).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "아바타 꾸미기 9" }));
  expect(screen.getByRole("button", { name: "시원한 커피 한 잔 상세 보기" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /나의 소지품/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "전체 상품 11" }));
  expect(screen.getAllByRole("button", { name: /상세 보기/ })).toHaveLength(11);
});

it("가격 변경은 창 안에 안내하고 변경된 조건을 새로 확인하게 한다", async () => {
  const client = createDemoShopClient();
  client.purchaseProduct = jest.fn().mockRejectedValue({ code: "TERMS_CHANGED" });
  const { user } = await setup(client);
  await user.click(within(details()).getByRole("button", { name: "구매하기" }));
  await user.click(within(dialog()).getByRole("button", { name: "300 P 구매 확정" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("새 조건");
  expect(within(dialog()).getByRole("button", { name: "300 P 구매 확정" })).toBeDisabled();
  await user.click(within(dialog()).getByRole("button", { name: "돌아가기" }));
  expect((await client.getPointBalance()).balance).toBe(1200);
});

it("실제 클릭 요소에 고정 분석 식별자를 전달한다", async () => {
  await setup();
  for (const element of [...screen.getAllByRole("button"), ...screen.getAllByRole("link")]) {
    expect(element.getAttribute("data-ph-capture-attribute-action")).toMatch(/^shop_[a-z_]+$/);
  }
});

it("판매 목록이 비어 있으면 보유 아이템을 상품으로 표시하지 않는다", async () => {
  const client = createDemoShopClient();
  const getCatalog = client.getShopProducts;
  client.getShopProducts = async () => ({ ...(await getCatalog()), products: [] });
  await setup(client);
  expect(screen.getByText("표시할 상품이 없어요.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /상세 보기/ })).not.toBeInTheDocument();
  expect((await client.getOwnedItems()).items).toHaveLength(1);
});

it("확정 버튼 연타와 처리 중 Escape로 구매가 중복되거나 확인창이 닫히지 않는다", async () => {
  const client = createDemoShopClient();
  const original = client.purchaseProduct;
  let finish;
  client.purchaseProduct = jest.fn(
    (request) =>
      new Promise((resolve) => {
        finish = () => original(request).then(resolve);
      })
  );
  const { user } = await setup(client);
  await user.click(within(details()).getByRole("button", { name: "구매하기" }));
  await user.dblClick(within(dialog()).getByRole("button", { name: "300 P 구매 확정" }));
  await user.keyboard("{Escape}");
  expect(dialog()).toBeInTheDocument();
  expect(client.purchaseProduct).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect((await client.getPointBalance()).balance).toBe(900);
});

it("조회 실패를 안내하고 재시도로 상점을 연다", async () => {
  const client = createDemoShopClient();
  const original = client.getShopProducts;
  client.getShopProducts = jest
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockImplementation(original);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ShopPreview client={client} />
    </QueryClientProvider>
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("상점을 불러오지 못했어요");
  await userEvent.setup().click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(await screen.findByRole("heading", { name: "득템하나?" })).toBeInTheDocument();
});

it("모바일에서 상품을 미리 본 뒤 선택했던 상품으로 돌아간다", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: true })
  });
  try {
    const { user } = await setup();
    const coffee = screen.getByRole("button", { name: "시원한 커피 한 잔 상세 보기" });
    await user.click(coffee);
    expect(screen.getByLabelText("상품 미리보기")).toHaveFocus();
    expect(
      within(details()).getByRole("heading", { name: "시원한 커피 한 잔" })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "상품 목록" }));
    expect(coffee).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "프로필 꾸미기 2" }));
    await user.click(screen.getByRole("button", { name: "상품 목록" }));
    expect(screen.getByRole("button", { name: "꾸벅 곰돌이 프레임 상세 보기" })).toHaveFocus();
  } finally {
    Object.defineProperty(window, "matchMedia", descriptor);
  }
});

it("실제 구매에서는 내 포인트 차감을 안내하고 서버 보유 상태를 표시한다", async () => {
  const client = { ...createDemoShopClient(), isLive: true };
  const { user } = await setup(client);
  expect(screen.getByLabelText("내 포인트 1,200 P")).toBeInTheDocument();
  expect(screen.queryByText("체험 상점")).not.toBeInTheDocument();
  await user.click(within(details()).getByRole("button", { name: "구매하기" }));
  expect(dialog()).toHaveTextContent("내 포인트가 차감되고");
  await user.click(within(dialog()).getByRole("button", { name: "300 P 구매 확정" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByLabelText("내 포인트 900 P")).toBeInTheDocument();
  expect(details()).toHaveTextContent("구매 완료 · 보유 중");
  expect(
    within(details()).queryByRole("button", { name: "체험 캐릭터에 착용" })
  ).not.toBeInTheDocument();
});

it("새 비니와 버킷햇을 입어보면 지원하는 모자와 색 조합을 전달한다", async () => {
  const { user } = await setup();
  await user.click(screen.getByRole("button", { name: "딸기우유 비니 상세 보기" }));
  expect(JSON.parse(screen.getByTestId("avatar-preview").textContent)).toMatchObject({
    hat: "beanie",
    hatColor: "coral"
  });
  await user.click(screen.getByRole("button", { name: "버터 버킷햇 상세 보기" }));
  expect(JSON.parse(screen.getByTestId("avatar-preview").textContent)).toMatchObject({
    hat: "bucket",
    hatColor: "cream"
  });
});


it("실제 상점에서 보유 프레임을 프로필에 적용하고 해제한다", async () => {
  const client = {
    ...createDemoShopClient({ initialItemIds: ["demo-item-sleepy-bear-frame"] }),
    isLive: true
  };
  const { user } = await setup(client);
  await user.click(screen.getByRole("button", { name: "꾸벅 곰돌이 프레임 상세 보기" }));
  await user.click(within(details()).getByRole("button", { name: "프로필에 적용" }));
  expect(await within(details()).findByRole("button", { name: "적용 해제" })).toBeInTheDocument();
  await user.click(within(details()).getByRole("button", { name: "적용 해제" }));
  expect(await within(details()).findByRole("button", { name: "프로필에 적용" })).toBeInTheDocument();
});
