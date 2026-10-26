import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { useAuth } from "../../features/auth";
import { ChatLink } from "../../features/chat/ChatLink";
import { ChatModal } from "./ChatModal";

jest.mock("react-router", () => {
  const { dirname, join } = require("node:path");
  const root = dirname(require.resolve("react-router/package.json"));
  const hooks = jest.requireActual(join(root, "dist/production/lib/hooks.js"));
  return {
    ...jest.requireActual(join(root, "dist/production/lib/components.js")),
    ...hooks,
    Link: ({ to, replace, state, preventScrollReset, children, ...props }) => {
      const navigate = hooks.useNavigate();
      return <a {...props} href={`${to.pathname}${to.search}${to.hash}`} onClick={(event) => {
        event.preventDefault();
        navigate(to, { replace, state, preventScrollReset });
      }}>{children}</a>;
    }
  };
});
jest.mock("../../features/auth", () => ({ useAuth: jest.fn() }));
jest.mock("./ChatPage.jsx", () => {
  const { ChatLink } = require("../../features/chat/ChatLink");
  return { ChatContent: ({ roomId }) => <div>선택한 방: {roomId ?? "목록"}<ChatLink roomId="42">방 열기</ChatLink></div> };
});

function Surface() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output aria-label="현재 주소">{location.pathname}{location.search}{location.hash}</output>
    <input aria-label="작성 중인 내용" />
    <ChatLink>채팅 열기</ChatLink>
    <button onClick={() => navigate(-1)}>뒤로</button>
    <ChatModal />
  </>;
}

beforeEach(() => {
  useAuth.mockReturnValue({ status: "authenticated" });
});

test("opens over the current page, keeps its input and filters, and restores opener focus on close", async () => {
  render(<MemoryRouter initialEntries={["/groups?type=STUDY#results"]}><Surface /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("작성 중인 내용"), { target: { value: "남겨 둔 글" } });
  const opener = screen.getByRole("link", { name: "채팅 열기" });
  opener.focus();
  fireEvent.click(opener);
  await screen.findByText("선택한 방: 목록");
  expect(screen.getByLabelText("현재 주소")).toHaveTextContent("/groups?type=STUDY&chat=inbox#results");
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.click(screen.getByRole("link", { name: "방 열기" }));
  expect(screen.getByText("선택한 방: 42")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "채팅 닫기" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByLabelText("현재 주소")).toHaveTextContent("/groups?type=STUDY#results");
  expect(screen.getByLabelText("작성 중인 내용")).toHaveValue("남겨 둔 글");
  expect(opener).toHaveFocus();
  expect(document.body.style.overflow).toBe("");
});

test("back closes the modal in one step even after selecting a room", async () => {
  render(<MemoryRouter initialEntries={["/home"]}><Surface /></MemoryRouter>);
  fireEvent.click(screen.getByRole("link", { name: "채팅 열기" }));
  await screen.findByText("선택한 방: 목록");
  fireEvent.click(screen.getByRole("link", { name: "방 열기" }));
  fireEvent.click(screen.getByRole("button", { name: "뒤로" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByLabelText("현재 주소")).toHaveTextContent("/home");
});

test("a chat query cannot open content for a signed-out visitor", () => {
  useAuth.mockReturnValue({ status: "anonymous" });
  render(<MemoryRouter initialEntries={["/groups?chat=42"]}><Surface /></MemoryRouter>);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
