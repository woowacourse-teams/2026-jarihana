import { roomSkyPalette } from "./roomSkyPalette";
import "./room-sky.css";

export function roomSkyColor(outdoors) {
  return roomSkyPalette(outdoors)[0];
}

export function RoomSky({ outdoors }) {
  if (!outdoors) return null;
  const { phase, weather } = outdoors;
  const [top, middle, horizon] = roomSkyPalette(outdoors);
  return <div aria-hidden="true" className="room-sky" data-phase={phase} data-weather={weather}
    style={{ "--sky-top": top, "--sky-middle": middle, "--sky-horizon": horizon }}>
    {(weather === "rain" || weather === "snow") && <div className="room-sky__precipitation" />}
  </div>;
}
