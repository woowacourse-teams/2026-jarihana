import { playgroundPeriod, watchPlaygroundSky } from '../../public/sparring-arena/src/playground-sky.js';

describe('행성 놀이터의 서울 시간대', () => {
  it.each([[5, 'night'], [6, 'day'], [16, 'day'], [17, 'sunset'], [19, 'sunset'], [20, 'night'], [0, 'night']])('%시에는 %s 하늘을 쓴다', (hour, expected) => {
    expect(playgroundPeriod(new Date(`2026-11-03T${String(hour).padStart(2, '0')}:00:00+09:00`))).toBe(expected);
  });

  it('시간대가 바뀔 때만 갱신하고 종료 후에는 타이머와 상태를 정리한다', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-03T16:59:30+09:00'));
    const change = jest.fn();
    const stop = watchPlaygroundSky(change);
    try {
      expect(change).toHaveBeenLastCalledWith('day');
      jest.advanceTimersByTime(60000);
      expect(document.documentElement.dataset.playgroundPeriod).toBe('sunset');
      expect(change).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(60000);
      expect(change).toHaveBeenCalledTimes(2);
      stop();
      expect(jest.getTimerCount()).toBe(0);
      expect(document.documentElement.dataset.playgroundPeriod).toBeUndefined();
    } finally { stop(); jest.useRealTimers(); }
  });
});
