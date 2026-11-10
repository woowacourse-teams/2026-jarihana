import { useEffect, useRef } from "react";
import { createGomokuAudio } from "./audio";
import { gomokuSounds } from "./soundAssets";

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
    if (
      ["WAITING", "FINISHED"].includes(before.status) &&
      room.status === "PLAYING" &&
      room.gameNumber > before.gameNumber &&
      room.ply === 0
    ) audio.current?.play("start");
  }, [room]);
}
