import { render, screen } from "@testing-library/react";

import { useToast } from "../../src/shared/ui";
import { createAppQueryClient } from "../../src/app/AppProviders";
import { AppProviders } from "../../src/app/AppProviders";

jest.mock("../../src/features/auth", () => ({
  AuthProvider: ({ children }) => children
}));

it("creates an isolated query client with bounded retries and stable cached content", () => {
  // Given / When
  const client = createAppQueryClient();
  const options = client.getDefaultOptions();

  // Then
  expect(options.queries.retry).toBe(1);
  expect(options.queries.staleTime).toBe(30_000);
  expect(options.queries.refetchOnWindowFocus).toBe(false);
  expect(options.mutations.retry).toBe(0);
});

it("provides the global toast surface to route pages", () => {
  function ToastConsumer() {
    useToast();
    return <p>toast-ready</p>;
  }

  // Given / When
  render(
    <AppProviders>
      <ToastConsumer />
    </AppProviders>
  );

  // Then
  expect(screen.getByText("toast-ready")).toBeInTheDocument();
});
