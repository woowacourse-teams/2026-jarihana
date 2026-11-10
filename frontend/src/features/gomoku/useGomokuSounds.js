import { useEffect, useRef } from "react";
import { createGomokuAudio } from "./audio";
import { gomokuSounds } from "./soundAssets";

function hasNewStone(before, room) {
  if (
    before.status !== "PLAYING" ||
    !(room.status === "PLAYING" || (room.status === "FINISHED" && ["FIVE", "DRAW"].includes(room.endReason))) ||
    room.gameNumber !== before.gameNumber || room.ply !== before.ply + 1 ||
    !Number.isInteger(room.lastX) || !Number.isInteger(room.lastY) ||
    room.lastX < 0 || room.lastX >= 15 || room.lastY < 0 || room.lastY >= 15
  ) return false;
  const index = room.lastY * 15 + room.lastX;
  if (before.board[index] !== "0" || room.board[index] !== (before.ply % 2 === 0 ? "1" : "2"))
    return false;
  return [...room.board].every((cell, position) => position === index || cell === before.board[position]);
}

export function useGomokuSounds(room) {
  const audio = useRef(null);
  const previous = useRef(null);
  const roomId = room?.id;
  useEffect(() => {
    if (roomId == null) return undefined;
    const player = createGomokuAudio(gomokuSounds);
    audio.current = player;
    return () => {
      player.dispose();
      audio.current = null;
    };
  }, [roomId]);
  useEffect(() => {
    const before = previous.current;
    if (room && before?.id === room.id && room.revision <= before.revision) return;
    previous.current = room;
    if (!room || before?.id !== room.id) return;
    if (hasNewStone(before, room)) audio.current?.play("stone");
    if (
      ["WAITING", "FINISHED"].includes(before.status) &&
      room.status === "PLAYING" &&
      room.gameNumber > before.gameNumber &&
      room.ply === 0
    ) audio.current?.play("start");
  }, [room]);
}
