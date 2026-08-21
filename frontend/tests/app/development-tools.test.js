import { enableDevelopmentTools, shouldLoadDevelopmentTools } from "../../src/app/developmentTools";

it("enables inspection tools only in an explicitly enabled development build", () => {
  // Given / When / Then
  expect(shouldLoadDevelopmentTools("development", "0")).toBe(true);
  expect(shouldLoadDevelopmentTools("development", "1")).toBe(false);
  expect(shouldLoadDevelopmentTools("production", "0")).toBe(false);
});

it("does not resolve development modules when tooling is disabled", async () => {
  // Given
  const loadGrab = jest.fn();
  const loadScan = jest.fn();

  // When
  await enableDevelopmentTools({
    disabled: "1",
    environment: "development",
    loadGrab,
    loadScan
  });

  // Then
  expect(loadGrab).not.toHaveBeenCalled();
  expect(loadScan).not.toHaveBeenCalled();
});

it("starts supported development modules when tooling is enabled", async () => {
  // Given
  const instrument = jest.fn();
  const loadGrab = jest.fn().mockResolvedValue({});
  const loadScan = jest.fn().mockResolvedValue({ instrument });

  // When
  await enableDevelopmentTools({
    disabled: "0",
    environment: "development",
    loadGrab,
    loadScan
  });

  // Then
  expect(loadGrab).toHaveBeenCalledTimes(1);
  expect(loadScan).toHaveBeenCalledTimes(1);
  expect(instrument).toHaveBeenCalledWith();
});
