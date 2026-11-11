import "./room-sky.css";

const SKY_COLORS = {
  dawn: ["#485579", "#bd8394", "#f5c7a1"],
  day: ["#527fa9", "#9bc6e5", "#e2eef3"],
  dusk: ["#484b78", "#c37f8b", "#f1b489"],
  night: ["#141e3a", "#293752", "#526182"]
};
const OVERCAST_COLORS = {
  dawn: ["#515b75", "#8a8199", "#c8abb3"],
  day: ["#5a7087", "#829aaf", "#c2d0da"],
  dusk: ["#4c546d", "#837887", "#bb9ca5"],
  night: ["#191f34", "#303a50", "#536078"]
};

export function roomSkyColor({ phase, weather }) {
  return (weather === "clear" ? SKY_COLORS : OVERCAST_COLORS)[phase][0];
}

export function RoomSky({ outdoors }) {
  if (!outdoors) return null;
  const { phase, weather } = outdoors;
  const [top, middle, horizon] = (weather === "clear" ? SKY_COLORS : OVERCAST_COLORS)[phase];
  const night = phase === "night";
  return <div aria-hidden="true" className="room-sky" data-phase={phase} data-weather={weather}
    style={{ "--sky-top": top, "--sky-middle": middle, "--sky-horizon": horizon }}>
    <div className="room-sky__details">
      {night && weather === "clear" && <div className="room-sky__stars" />}
      <svg className="room-sky__clouds" viewBox="0 0 1400 400" preserveAspectRatio="xMidYMid slice">
        <path d="M-160 210c44-28 85-30 118-15 31-25 66-31 105-14 23-43 78-55 119-28 44-7 71 3 86 24 43-5 77 9 105 33Z" />
        <path d="M1022 153c19-20 46-27 75-20 29-27 67-29 99-10 31-37 86-44 124-7 41-11 87 2 107 37Z" />
        <path d="M-150 321c74-23 153-16 201-35 45-22 99-21 139 2 60-20 135-17 176 10 93-12 175-4 229 23Zm1025 4c67-29 116-24 164-20 23-26 80-35 133-16 50-28 109-22 154 0 63-19 129-4 171 36Z" />
      </svg>
      {(weather === "rain" || weather === "snow") && <div className="room-sky__precipitation" />}
    </div>
  </div>;
}
