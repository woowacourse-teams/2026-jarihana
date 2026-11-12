const mockThree = jest.requireActual("three");

jest.mock("three", () => {
  return { ...mockThree, WebGLRenderer: jest.fn(() => {
    let renderedKind;
    return {
      domElement: { toDataURL: jest.fn(() => `data:image/png;${renderedKind}`) },
      setSize: jest.fn(),
      setPixelRatio: jest.fn(),
      render: jest.fn((scene) => { renderedKind = scene.children.find((child) => child.isMesh)?.name; }),
      dispose: jest.fn(),
      forceContextLoss: jest.fn()
    };
  }) };
});
jest.mock("./roomModels", () => {
  const { Mesh, BoxGeometry, MeshBasicMaterial } = mockThree;
  return {
    createFurniture: jest.fn((kind) => {
      const object = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
      object.name = kind;
      return object;
    }),
    disposeObject: jest.fn()
  };
});
jest.mock("./roomState", () => ({
  ...jest.requireActual("./roomState"),
  CATALOG: ["sofa", "table", "plant"].map((kind) => ({ kind }))
}));

let createFurnitureThumbnails;
let WebGLRenderer;
let createFurniture;
let disposeObject;

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  ({ createFurnitureThumbnails } = require("./roomScene"));
  ({ WebGLRenderer } = require("three"));
  ({ createFurniture, disposeObject } = require("./roomModels"));
});
afterEach(() => { jest.useRealTimers(); });

test("resumes an aborted catalog from completed kinds and reuses the finished cache without a renderer", async () => {
  const controller = new AbortController();
  const first = createFurnitureThumbnails(controller.signal);
  await jest.advanceTimersByTimeAsync(16);
  controller.abort();
  await jest.runAllTimersAsync();
  const partial = await first;
  expect(partial).toEqual({ sofa: "data:image/png;sofa" });

  const resumed = createFurnitureThumbnails(new AbortController().signal);
  await jest.runAllTimersAsync();
  const complete = await resumed;
  expect(complete).toEqual({
    sofa: "data:image/png;sofa", table: "data:image/png;table", plant: "data:image/png;plant"
  });
  expect(createFurniture.mock.calls).toEqual([["sofa"], ["table"], ["plant"]]);
  expect(disposeObject).toHaveBeenCalledTimes(3);
  expect(partial).toEqual({ sofa: "data:image/png;sofa" });
  expect(WebGLRenderer).toHaveBeenCalledTimes(2);
  for (const { value: renderer } of WebGLRenderer.mock.results) {
    expect(renderer.setSize).toHaveBeenCalledWith(180, 140);
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1);
    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
  }

  const cached = createFurnitureThumbnails();
  expect(WebGLRenderer).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
  await expect(cached).resolves.toEqual(complete);
});

test("an already aborted request does not create a renderer or schedule work", async () => {
  const controller = new AbortController();
  controller.abort();
  const pending = createFurnitureThumbnails(controller.signal);
  await jest.runAllTimersAsync();
  await expect(pending).resolves.toEqual({});
  expect(WebGLRenderer).not.toHaveBeenCalled();
  expect(createFurniture).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test("aborting before the first thumbnail stops work and disposes the renderer", async () => {
  const controller = new AbortController();
  const pending = createFurnitureThumbnails(controller.signal);
  controller.abort();
  await jest.runAllTimersAsync();
  await expect(pending).resolves.toEqual({});
  expect(createFurniture).not.toHaveBeenCalled();
  const renderer = WebGLRenderer.mock.results[0].value;
  expect(renderer.render).not.toHaveBeenCalled();
  expect(renderer.dispose).toHaveBeenCalledTimes(1);
  expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
});
