import { act, renderHook } from "@testing-library/react";
import { createRoomConnection } from "./connection.js";
import { parseRoomMessage } from "./protocol.js";
import { useRoomRealtime } from "./useRoomRealtime.js";

jest.mock("./connection.js", () => ({ createRoomConnection: jest.fn() }));

test("catalog refresh follows full room generations without requiring a layout revision or polling on movement", () => {
  createRoomConnection.mockReturnValue({ start: jest.fn(), stop: jest.fn(), setLayoutRevision: jest.fn() });
  const onCatalogChange = jest.fn();
  const onLayoutChange = jest.fn();
  const { result } = renderHook(() => useRoomRealtime({ groupId: 41, memberId: 7, enabled: true, layoutRevision: 1, onLayoutChange, onCatalogChange }));
  const store = result.current.runtime.store;
  const snapshot = { protocolVersion: 1, type: "ROOM_SNAPSHOT", roomId: "41", roomEpoch: "epoch",
    connectionGeneration: "first", layoutRevision: 1, controlSeq: 1, frameSeq: 1, serverTime: 1000,
    selfId: "7", participants: [], items: [], assets: {} };
  const apply = message => act(() => { store.apply(parseRoomMessage(JSON.stringify(message))); });
  apply(snapshot);
  expect(onCatalogChange).toHaveBeenCalledTimes(1);

  apply({ ...snapshot, type: "ROOM_STATE", catalogGeneration: 4, controlSeq: 2 });
  apply({ ...snapshot, type: "MOVEMENT_FRAME", controlSeq: 2, frameSeq: 2 });
  apply({ ...snapshot, type: "ROOM_STATE", catalogGeneration: 4, controlSeq: 3 });
  expect(onCatalogChange).toHaveBeenCalledTimes(2);
  expect(onLayoutChange).not.toHaveBeenCalled();

  apply({ ...snapshot, connectionGeneration: "second", catalogGeneration: 4 });
  expect(onCatalogChange).toHaveBeenCalledTimes(3);
});
