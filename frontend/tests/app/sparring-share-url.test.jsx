import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { SparringDetailPage } from "../../src/pages/sparring/SparringDetailPage";

jest.mock("react-router", () => {
  const { dirname, join } = require("node:path");
  const packageRoot = dirname(require.resolve("react-router/package.json"));
  return {
    ...jest.requireActual(join(packageRoot, "dist/production/lib/components.js")),
    ...jest.requireActual(join(packageRoot, "dist/production/lib/hooks.js")),
    Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>
  };
});

jest.mock("../../src/features/auth", () => ({
  useAuth: () => ({ status: "loading", member: null, login: jest.fn() })
}));

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output aria-label="current address">{location.pathname}{location.search}{location.hash}</output>
    <output aria-label="navigation state">{JSON.stringify(location.state)}</output>
    <button onClick={() => navigate(-1)}>back</button>
  </>;
}

function mount(search, hash = "") {
  return render(
    <MemoryRouter initialEntries={["/sparring", {
      pathname: "/sparring/12", search, hash, state: { from: "shared-link" }
    }]} initialIndex={1}>
      <LocationProbe />
      <Routes>
        <Route path="/sparring" element={<p>discussion list</p>} />
        <Route path="/sparring/:topicId" element={<SparringDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

test("removes the internal preview flag so the copied URL can receive debate metadata again", async () => {
  mount("?preview=1");
  await waitFor(() => expect(screen.getByLabelText("current address")).toHaveTextContent(/^\/sparring\/12$/));
  fireEvent.click(screen.getByRole("button", { name: "back" }));
  expect(await screen.findByText("discussion list")).toBeInTheDocument();
});

test("preserves attribution, other query parameters, hash and navigation state", async () => {
  mount("?preview=1&promotion_id=debate_share&chat=inbox", "#discussion");
  await waitFor(() => expect(screen.getByLabelText("current address"))
    .toHaveTextContent("/sparring/12?promotion_id=debate_share&chat=inbox#discussion"));
  expect(screen.getByLabelText("navigation state")).toHaveTextContent('{"from":"shared-link"}');
});

test.each(["", "?preview=0", "?preview=1&preview=0"])("leaves a non-preview URL unchanged: %s", search => {
  mount(search);
  expect(screen.getByLabelText("current address")).toHaveTextContent(`/sparring/12${search}`);
});
