import { useEffect, useRef } from "react";

const METERS_PER_CHAIR = 100;
const altitudeFormat = new Intl.NumberFormat("ko-KR");
const windShapes = [
  "M2 33C27 22 42 31 57 35C76 40 94 29 91 17C88 6 75 4 66 11C72 0 87 0 95 9C108 24 95 41 76 44C53 49 37 29 2 33Z",
  "M2 32C28 20 44 31 58 33C81 37 94 25 89 15C85 7 75 7 67 13C72 2 88 2 95 12C105 27 90 41 71 40C45 40 33 26 2 32Z M19 38C43 35 65 54 88 39C76 55 52 48 38 43C29 40 23 39 19 38Z",
  "M2 35C20 18 39 24 52 29C70 35 85 33 101 19C89 39 69 43 49 35C32 29 19 27 2 35Z"
];

function skyAt(altitude) {
  if (altitude >= 1500) return "space";
  if (altitude >= 1000) return "aurora";
  if (altitude >= 500) return "twilight";
  return "day";
}

export function ChairStackSky({ run }) {
  const sky = useRef(null);
  const count = run?.placements.length ?? 0;
  const altitude = count * METERS_PER_CHAIR;
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const element = sky.current;
    const observer = new IntersectionObserver(([entry]) => {
      element.dataset.inView = String(entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sky} className="chair-stack-sky" data-sky={skyAt(altitude)} aria-hidden="true">
        <div className="chair-stack-sky__twilight" />
        <div className="chair-stack-clouds">
          <span className="chair-stack-cloud chair-stack-cloud--left" />
          <span className="chair-stack-cloud chair-stack-cloud--high" />
          <span className="chair-stack-cloud chair-stack-cloud--right" />
        </div>
        <div className="chair-stack-sky__night"><div className="chair-stack-aurora" /></div>
        <div className="chair-stack-sky__space"><div className="chair-stack-stars" /></div>
        <div className="chair-stack-wind">
          {windShapes.map((shape) => (
            <span key={shape} className="chair-stack-wind__gust">
              <svg viewBox="0 0 104 52" focusable="false">
                <path d={shape} />
              </svg>
            </span>
          ))}
        </div>
      </div>
      {run && (
        <p className="chair-stack-altitude">
          <span className="ui-sr-only">높이 </span>
          {altitudeFormat.format(altitude)} m
        </p>
      )}
    </>
  );
}
