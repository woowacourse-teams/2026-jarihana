import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { useImageUpload, validateImageFile } from "../../../src/features/image-upload/index.js";
import { ActivityPostComposer } from "../../../src/pages/activity-posts/ActivityPostComposer.jsx";

jest.mock("../../../src/features/image-upload/index.js", () => ({
  useImageUpload: jest.fn(),
  validateImageFile: jest.fn()
}));

const group = { id: 41, name: "우아한 스터디" };
const post = {
  activityDate: "2026-08-10",
  caption: "함께한 하루",
  group,
  id: 55,
  imageUrl: "https://cdn.example.test/activity.jpg"
};
const originalCreateObjectURL = URL.createObjectURL;

beforeEach(() => {
  useImageUpload.mockReturnValue({
    isPending: false,
    mutateAsync: jest.fn().mockResolvedValue({ imageKey: "groups/tmp/activity.jpg" })
  });
  validateImageFile.mockReset();
});

afterEach(() => {
  if (originalCreateObjectURL) {
    URL.createObjectURL = originalCreateObjectURL;
  } else {
    delete URL.createObjectURL;
  }
});

it("saves edits directly from the editor without a second public confirmation", async () => {
  const onClose = jest.fn();
  const onSave = jest.fn().mockResolvedValue(undefined);

  render(<ActivityPostComposer onClose={onClose} onSave={onSave} open post={post} />);

  expect(screen.getByText("이 기록은 비로그인 방문자를 포함한 모든 사용자에게 공개돼요.")).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "모든 사용자에게 공개됩니다" })).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/활동 날짜/), { target: { value: "2026-08-17" } });
  fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith({
      activityDate: "2026-08-17",
      caption: "함께한 하루",
      groupId: 41,
      imageKey: undefined,
      postId: 55
    });
  });
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog", { name: "모든 사용자에게 공개됩니다" })).not.toBeInTheDocument();
});

it("publishes new posts directly after showing the public visibility notice", async () => {
  const onClose = jest.fn();
  const onSave = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: jest.fn(() => "https://preview.example.test/activity.jpg")
  });

  render(<ActivityPostComposer fixedGroup={group} onClose={onClose} onSave={onSave} open />);
  const upload = useImageUpload.mock.results.at(-1).value.mutateAsync;

  fireEvent.change(document.querySelector("#activity-photo-file"), {
    target: { files: [new File(["photo"], "activity.jpg", { type: "image/jpeg" })] }
  });
  fireEvent.click(screen.getByRole("button", { name: "공개하기" }));

  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(upload).toHaveBeenCalledTimes(1);
  expect(screen.getByText("이 기록은 비로그인 방문자를 포함한 모든 사용자에게 공개돼요.")).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "모든 사용자에게 공개됩니다" })).not.toBeInTheDocument();
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("prevents dismissing the composer until photo upload and save finish", async () => {
  let resolveUpload;
  let resolveSave;
  const uploadPromise = new Promise((resolve) => {
    resolveUpload = resolve;
  });
  const savePromise = new Promise((resolve) => {
    resolveSave = resolve;
  });
  const upload = jest.fn(() => uploadPromise);
  const onClose = jest.fn();
  const onSave = jest.fn(() => savePromise);
  useImageUpload.mockReturnValue({ isPending: false, mutateAsync: upload });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: jest.fn(() => "https://preview.example.test/activity.jpg")
  });

  render(<ActivityPostComposer fixedGroup={group} onClose={onClose} onSave={onSave} open />);
  fireEvent.change(document.querySelector("#activity-photo-file"), {
    target: { files: [new File(["photo"], "activity.jpg", { type: "image/jpeg" })] }
  });
  fireEvent.click(screen.getByRole("button", { name: "공개하기" }));

  expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "저장 중에는 닫을 수 없어요" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("사진을 올리고 있어요. 완료될 때까지 창을 닫을 수 없어요.");
  expect(document.querySelector("form.activity-post-composer")).toHaveAttribute("aria-busy", "true");
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.mouseDown(document.querySelector(".ui-overlay"));
  expect(screen.getByRole("dialog", { name: "활동 기록 남기기" })).toBeVisible();
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => {
    resolveUpload({ imageKey: "groups/tmp/activity.jpg" });
    await uploadPromise;
  });
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  expect(onClose).not.toHaveBeenCalled();

  await act(async () => {
    resolveSave();
    await savePromise;
  });
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(upload).toHaveBeenCalledTimes(1);
});

it("allows dismissing the composer again when saving fails", async () => {
  const onClose = jest.fn();
  const onSave = jest.fn().mockRejectedValue(new Error("저장 실패"));

  render(<ActivityPostComposer onClose={onClose} onSave={onSave} open post={post} />);
  fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));

  expect(screen.getByRole("button", { name: "취소" })).toBeDisabled();
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("입력한 내용을 다시 확인해 주세요."));
  expect(screen.getByRole("button", { name: "취소" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "닫기" })).toBeEnabled();

  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
