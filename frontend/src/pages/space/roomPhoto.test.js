import { prepareRoomPhoto } from "./roomPhoto";

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
beforeEach(() => {
  URL.createObjectURL = jest.fn(() => "blob:local-photo");
  URL.revokeObjectURL = jest.fn();
});
afterEach(() => {
  jest.restoreAllMocks();
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

test("rejects unsupported and oversized images before decoding", async () => {
  await expect(prepareRoomPhoto({ type: "image/svg+xml", size: 20 })).rejects.toThrow("JPG, PNG, WebP");
  await expect(prepareRoomPhoto({ type: "image/jpeg", size: 6 * 1024 * 1024 })).rejects.toThrow("5MB");
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test("decodes locally, shrinks proportionally, and releases the temporary URL", async () => {
  const context = { fillRect: jest.fn(), drawImage: jest.fn() };
  jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  const encode = jest.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,YWJj");
  jest.spyOn(window, "Image").mockImplementation(() => ({
    naturalWidth: 1280, naturalHeight: 640,
    set src(_value) { this.onload(); }
  }));
  const result = await prepareRoomPhoto({ type: "image/png", size: 1000 });
  expect(result).toBe("data:image/jpeg;base64,YWJj");
  expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 640, 320);
  expect(encode).toHaveBeenCalledWith("image/jpeg", 0.82);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-photo");
});

test("decode failure reports a usable error and releases the temporary URL", async () => {
  jest.spyOn(window, "Image").mockImplementation(() => ({
    set src(_value) { this.onerror(); }
  }));
  await expect(prepareRoomPhoto({ type: "image/png", size: 1000 })).rejects.toThrow("사진을 읽지 못했어요");
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-photo");
});
