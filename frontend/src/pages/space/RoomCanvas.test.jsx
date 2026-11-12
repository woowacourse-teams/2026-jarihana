import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RoomCanvas } from "./RoomCanvas";
import { createRoomScene, createFurnitureThumbnails } from "./roomScene";
import { createInitialRoom } from "./roomState";

jest.mock("./roomScene", () => ({ createRoomScene: jest.fn(), createFurnitureThumbnails: jest.fn() }));

function props() { return { room: createInitialRoom(), selectedId: "sofa", view: "perspective", zoom: 1,
  onSelect: jest.fn(), onMove: jest.fn(), onInvalid: jest.fn(), onThumbnails: jest.fn() }; }

beforeEach(() => { jest.resetAllMocks(); createFurnitureThumbnails.mockReturnValue({}); });

test("read-only permission blocks keyboard and drag editing and updates without recreating the scene", async () => {
  createRoomScene.mockReturnValue({ update: jest.fn(), dispose: jest.fn() });
  const callbacks = props();
  const { rerender } = render(<RoomCanvas {...callbacks} editable={false} />);
  await waitFor(() => expect(createRoomScene).toHaveBeenCalledTimes(1));
  expect(createRoomScene.mock.calls[0][1].canEdit()).toBe(false);
  fireEvent.keyDown(screen.getByRole("application"), { key: "ArrowRight" });
  expect(callbacks.onMove).not.toHaveBeenCalled();
  rerender(<RoomCanvas {...callbacks} editable />);
  expect(createRoomScene.mock.calls[0][1].canEdit()).toBe(true);
  expect(createRoomScene).toHaveBeenCalledTimes(1);
});

test("late avatar data and account clearing update the walker without resetting the room", async () => {
  const runtime = { update: jest.fn(), setPlayerAppearance: jest.fn(), dispose: jest.fn() };
  createRoomScene.mockReturnValue(runtime);
  const initial = props();
  const { rerender } = render(<RoomCanvas {...initial} />);
  await waitFor(() => expect(runtime.update).toHaveBeenCalledTimes(1));

  const appearance = { version: 1, hair: "curly" };
  rerender(<RoomCanvas {...initial} avatarAppearance={appearance} />);
  expect(runtime.setPlayerAppearance).toHaveBeenLastCalledWith(appearance);
  rerender(<RoomCanvas {...initial} />);
  expect(runtime.setPlayerAppearance).toHaveBeenLastCalledWith(undefined);
  expect(runtime.update).toHaveBeenCalledTimes(1);
});

test("furniture thumbnails are generated only when the catalog requests them", async () => {
  createRoomScene.mockReturnValue({ update: jest.fn(), dispose: jest.fn() });
  const { onThumbnails, ...previewProps } = props();
  const { rerender } = render(<RoomCanvas {...previewProps} />);
  await waitFor(() => expect(screen.getByRole("application")).toHaveAttribute("data-canvas-status", "ready"));
  expect(createFurnitureThumbnails).not.toHaveBeenCalled();

  rerender(<RoomCanvas {...previewProps} onThumbnails={onThumbnails} />);
  await waitFor(() => expect(onThumbnails).toHaveBeenCalledTimes(1));
  expect(createRoomScene).toHaveBeenCalledTimes(1);
});

test("keyboard movement and Escape are alternatives to dragging", async () => {
  createRoomScene.mockReturnValue({ update: jest.fn(), dispose: jest.fn() });
  const callbacks = props();
  render(<RoomCanvas {...callbacks} />);
  await waitFor(() => expect(createRoomScene).toHaveBeenCalledTimes(1));
  const canvas = screen.getByRole("application");
  fireEvent.keyDown(canvas, { key: "ArrowRight" });
  const sofa = callbacks.room.items.find((item) => item.id === "sofa");
  expect(callbacks.onMove).toHaveBeenCalledWith("sofa", sofa.x + 0.25, sofa.z);
  fireEvent.keyDown(canvas, { key: "Escape" });
  expect(callbacks.onSelect).toHaveBeenCalledWith(null);
});

test("renderer is disposed when leaving the route", async () => {
  const runtime = { update: jest.fn(), dispose: jest.fn() };
  createRoomScene.mockReturnValue(runtime);
  const { unmount } = render(<RoomCanvas {...props()} />);
  await waitFor(() => expect(runtime.update).toHaveBeenCalled());
  unmount();
  expect(runtime.dispose).toHaveBeenCalledTimes(1);
});

test("a graphics initialization error can be retried", async () => {
  createRoomScene.mockImplementationOnce(() => { throw new Error("WebGL unavailable"); });
  createRoomScene.mockReturnValue({ update: jest.fn(), dispose: jest.fn() });
  render(<RoomCanvas {...props()} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("3D 공간을 표시하지 못했어요.");
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  expect(createRoomScene).toHaveBeenCalledTimes(2);
});

test("walking focuses the canvas and keeps movement keys separate from furniture editing", async () => {
  const runtime = { update: jest.fn(), command: jest.fn(), dispose: jest.fn() };
  createRoomScene.mockReturnValue(runtime);
  const callbacks = { ...props(), view: "thirdPerson", onExitWalk: jest.fn(), onWalkPosition: jest.fn() };
  const { rerender } = render(<RoomCanvas {...callbacks} />);
  const canvas = screen.getByRole("application");
  await waitFor(() => expect(canvas).toHaveFocus());
  fireEvent.keyDown(canvas, { key: "ArrowRight" });
  fireEvent.keyDown(canvas, { key: "w" });
  expect(callbacks.onMove).not.toHaveBeenCalled();
  expect(callbacks.onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "시선 조작 시작" }));
  expect(runtime.command).toHaveBeenCalledWith("lockPointer");
  fireEvent.keyDown(canvas, { key: "Escape" });
  expect(callbacks.onExitWalk).not.toHaveBeenCalled();
  const position = { x: 5, z: 2, zone: "휴게실" };
  createRoomScene.mock.calls[0][1].onWalkPosition(position);
  expect(callbacks.onWalkPosition).toHaveBeenCalledWith(position);
  rerender(<RoomCanvas {...callbacks} view="firstPerson" />);
  expect(runtime.update).toHaveBeenLastCalledWith(callbacks.room, "sofa", "firstPerson", 1, "all", 0);
  expect(canvas).toHaveFocus();
  rerender(<RoomCanvas {...callbacks} view="exterior" />);
  fireEvent.keyDown(canvas, { key: "Escape" });
  expect(callbacks.onExitWalk).toHaveBeenCalledTimes(1);
});

test("floor changes reach the existing runtime independently of the camera mode", async () => {
  const runtime = { update: jest.fn(), dispose: jest.fn() };
  createRoomScene.mockReturnValue(runtime);
  const callbacks = { ...props(), room: createInitialRoom("climbing") };
  const { rerender } = render(<RoomCanvas {...callbacks} floorView="ground" />);
  await waitFor(() => expect(runtime.update).toHaveBeenLastCalledWith(callbacks.room, "sofa", "perspective", 1, "ground", 0));
  rerender(<RoomCanvas {...callbacks} floorView="mezzanine" />);
  expect(runtime.update).toHaveBeenLastCalledWith(callbacks.room, "sofa", "perspective", 1, "mezzanine", 0);
  expect(createRoomScene).toHaveBeenCalledTimes(1);
});

test("screen commands reach the runtime once per id and cannot move while editing", async () => {
  const runtime = { update: jest.fn(), command: jest.fn(), dispose: jest.fn() };
  createRoomScene.mockReturnValue(runtime);
  const callbacks = { ...props(), view: "thirdPerson" };
  const { rerender } = render(<RoomCanvas {...callbacks} walkCommand={{ id: 1, action: "forward" }} />);
  await waitFor(() => expect(runtime.command).toHaveBeenCalledWith("forward"));
  rerender(<RoomCanvas {...callbacks} walkCommand={{ id: 1, action: "forward" }} />);
  expect(runtime.command).toHaveBeenCalledTimes(1);
  rerender(<RoomCanvas {...callbacks} walkCommand={{ id: 2, action: "turnLeft" }} />);
  expect(runtime.command).toHaveBeenLastCalledWith("turnLeft");
  rerender(<RoomCanvas {...callbacks} view="perspective" walkCommand={{ id: 3, action: "forward" }} />);
  expect(runtime.command).toHaveBeenCalledTimes(2);
});


test("wheel zoom and repeated reset reach the existing scene with the latest callbacks", async () => {
  const runtime = { update: jest.fn(), dispose: jest.fn() };
  createRoomScene.mockReturnValue(runtime);
  const onZoomChange = jest.fn();
  const nextZoom = jest.fn();
  const callbacks = props();
  const { rerender } = render(<RoomCanvas {...callbacks} zoom={0.7} onZoomChange={onZoomChange} />);
  await waitFor(() => expect(createRoomScene).toHaveBeenCalledTimes(1));
  createRoomScene.mock.calls[0][1].onZoomChange(0.4);
  expect(onZoomChange).toHaveBeenCalledWith(0.4);
  rerender(<RoomCanvas {...callbacks} zoom={0.7} cameraReset={2} onZoomChange={nextZoom} />);
  expect(runtime.update).toHaveBeenLastCalledWith(callbacks.room, "sofa", "perspective", 0.7, "all", 2);
  createRoomScene.mock.calls[0][1].onZoomChange(2.4);
  expect(nextZoom).toHaveBeenCalledWith(2.4);
  expect(onZoomChange).toHaveBeenCalledTimes(1);
  expect(createRoomScene).toHaveBeenCalledTimes(1);
});

test("a static web hero leaves document keys alone and becomes interactive without a new scene", async () => {
  const runtime = { update: jest.fn(), dispose: jest.fn() };
  createRoomScene.mockReturnValue(runtime);
  const callbacks = props();
  const { rerender } = render(<RoomCanvas {...callbacks} view="front" interactive={false} />);
  await waitFor(() => expect(createRoomScene).toHaveBeenCalledTimes(1));
  const preview = screen.getByRole("img", { name: /아지트 미리보기/ });
  expect(preview).not.toHaveAttribute("tabindex");
  fireEvent.keyDown(preview, { key: "ArrowRight" });
  fireEvent.keyDown(preview, { key: "Escape" });
  expect(callbacks.onSelect).not.toHaveBeenCalled();
  expect(callbacks.onMove).not.toHaveBeenCalled();
  expect(createRoomScene.mock.calls[0][1].canInteract()).toBe(false);
  rerender(<RoomCanvas {...callbacks} interactive />);
  expect(screen.getByRole("application")).toBe(preview);
  expect(createRoomScene.mock.calls[0][1].canInteract()).toBe(true);
  expect(createRoomScene).toHaveBeenCalledTimes(1);
});

test("activity authorization reaches the runtime before its first room update and clears without remounting", async () => {
  const runtime = { update: jest.fn(), setActivityExhibit: jest.fn(), dispose: jest.fn() };
  createRoomScene.mockReturnValue(runtime);
  const callbacks = props();
  const loading = { status: "loading", records: [] };
  const { rerender } = render(<RoomCanvas {...callbacks} activityExhibit={loading} />);
  await waitFor(() => expect(runtime.update).toHaveBeenCalled());
  expect(runtime.setActivityExhibit).toHaveBeenCalledWith(loading);
  expect(runtime.setActivityExhibit.mock.invocationCallOrder[0]).toBeLessThan(runtime.update.mock.invocationCallOrder[0]);
  const denied = { status: "denied", records: [] };
  rerender(<RoomCanvas {...callbacks} activityExhibit={denied} />);
  expect(runtime.setActivityExhibit).toHaveBeenLastCalledWith(denied);
  expect(createRoomScene).toHaveBeenCalledTimes(1);
});
