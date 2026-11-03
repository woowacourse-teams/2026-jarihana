const seoulHour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' });

export function playgroundPeriod(now = new Date()) {
  const hour = Number(seoulHour.format(now));
  if (hour < 6 || hour >= 20) return 'night';
  return hour < 17 ? 'day' : 'sunset';
}

export function watchPlaygroundSky(onChange) {
  const root = document.documentElement;
  let period;
  function update() {
    if (document.hidden) return;
    const next = playgroundPeriod();
    if (next === period) return;
    period = next;
    root.dataset.playgroundPeriod = next;
    onChange(next);
  }
  update();
  const timer = setInterval(update, 60000);
  document.addEventListener('visibilitychange', update);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', update);
    delete root.dataset.playgroundPeriod;
  };
}
