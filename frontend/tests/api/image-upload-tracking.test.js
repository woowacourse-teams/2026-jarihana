/** @jest-environment node */

import { uploadImage } from "../../src/features/image-upload/api";
import { apiRequest } from "../../src/shared/api";
import { startRequestTracking } from "../../src/shared/analytics";

jest.mock("../../src/shared/api", () => ({ apiRequest: jest.fn() }));
jest.mock("../../src/shared/analytics", () => ({ startRequestTracking: jest.fn() }));

const file = { name: "private-file-name.png", type: "image/png", size: 1024 };
const upload = {
  id: "upload-id",
  imageKey: "groups/private-image-key",
  uploadUrl: "https://storage.test/private-file-name.png?signature=private-token",
  expiresAt: "2026-09-15"
};
let finish;

beforeEach(() => {
  jest.clearAllMocks();
  finish = jest.fn();
  apiRequest.mockResolvedValue(upload);
  startRequestTracking.mockReturnValue({ finish });
});

test("Given a direct image upload, when it succeeds, then only the storage operation is tracked", async () => {
  const fetcher = jest.fn().mockResolvedValue({ ok: true, status: 200 });

  await expect(uploadImage(file, { fetcher })).resolves.toBe(upload);

  expect(fetcher).toHaveBeenCalledWith(upload.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    credentials: "omit",
    body: file
  });
  expect(startRequestTracking).toHaveBeenCalledTimes(1);
  expect(startRequestTracking).toHaveBeenCalledWith({
    endpoint: "storage_upload",
    method: "PUT",
    attempt: 1,
    is_auth_refresh: false
  });
  expect(finish).toHaveBeenCalledTimes(1);
  expect(finish).toHaveBeenCalledWith({ status: 200, outcome: "success" });
});

test.each([
  ["network failure", () => Promise.reject(new Error("private URL")), 0, "network_error"],
  ["storage rejection", () => Promise.resolve({ ok: false, status: 403 }), 403, "api_error"]
])(
  "Given %s, when upload fails, then one failure without storage details is tracked",
  async (_label, fetcher, status, outcome) => {
    await expect(uploadImage(file, { fetcher })).rejects.toMatchObject({
      code: "IMAGE_UPLOAD_FAILED",
      status
    });

    expect(startRequestTracking).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith({ status, outcome, error_code: "IMAGE_UPLOAD_FAILED" });
  }
);

test("Given an invalid file, when validation fails, then no storage attempt is tracked", async () => {
  const fetcher = jest.fn();

  await expect(uploadImage({ ...file, type: "text/plain" }, { fetcher })).rejects.toMatchObject({
    code: "IMAGE_CONTENT_TYPE_NOT_ALLOWED"
  });

  expect(apiRequest).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(startRequestTracking).not.toHaveBeenCalled();
});

test("Given the upload URL request fails, when preparation stops, then no storage attempt is tracked", async () => {
  const error = new Error("upload preparation failed");
  apiRequest.mockRejectedValue(error);

  await expect(uploadImage(file)).rejects.toBe(error);

  expect(startRequestTracking).not.toHaveBeenCalled();
});
