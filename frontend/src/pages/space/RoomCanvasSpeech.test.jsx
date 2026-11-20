import { act, render } from "@testing-library/react";
import { RoomCanvas } from "./RoomCanvas";
import { createRoomScene, createFurnitureThumbnails } from "./roomScene";
import { createInitialRoom } from "./roomState";

jest.mock("./roomScene", () => ({ createRoomScene: jest.fn(), createFurnitureThumbnails: jest.fn() }));

afterEach(() => { jest.useRealTimers(); jest.resetAllMocks(); });

test("received speech is removed from the runtime after eight seconds without another server event", async () => {
  jest.useFakeTimers({ now: 1000 });
  const runtime = { update: jest.fn(), setSpeech: jest.fn(), dispose: jest.fn() };
  createRoomScene.mockReturnValue(runtime);
  createFurnitureThumbnails.mockReturnValue({});
  const message = { id: 4, memberId: 2, memberName: "모임원", content: "곧 도착해요", expiresAt: 9000 };
  let rendered;
  await act(async () => {
    rendered = render(<RoomCanvas room={createInitialRoom()} selectedId={null} view="perspective" zoom={1}
      onSelect={jest.fn()} onMove={jest.fn()} onInvalid={jest.fn()} onThumbnails={jest.fn()}
      speechMessages={[message]} />);
  });
  expect(runtime.setSpeech).toHaveBeenLastCalledWith([message]);
  act(() => jest.advanceTimersByTime(7999));
  expect(runtime.setSpeech).toHaveBeenLastCalledWith([message]);
  act(() => jest.advanceTimersByTime(1));
  expect(runtime.setSpeech).toHaveBeenLastCalledWith([]);
  rendered.unmount();
  expect(runtime.dispose).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
