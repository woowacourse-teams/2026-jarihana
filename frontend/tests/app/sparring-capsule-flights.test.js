import { createCapsules } from '../../public/sparring-arena/src/capsules.js';
jest.mock('../../public/sparring-arena/src/capsule-batch.js', () => ({ createCapsuleBatch: () => ({ draw() {}, hide() {}, pick: () => 0 }) }));
const post = { id: 'one', side: 'a', name: '나', text: '새 한마디' };
it('새 한마디를 지난 대화 출력 큐에 중복 등록하지 않고 말풍선을 추적한다', () => {
  const clock = jest.spyOn(performance, 'now').mockReturnValue(0);
  try {
    const capsules = createCapsules({}, jest.fn(), jest.fn());
    capsules.updateState([post], { a: 1, b: 1, total: 2, ratio: 0.5 });
    capsules.launch(post, { reduced: true });
    expect(capsules.stats().queuedId).toBeNull();
    expect(capsules.presentation().tracking.map(entry => entry.post.id)).toEqual(['one']);
    capsules.setPaused(true);
    clock.mockReturnValue(4501);
    expect(capsules.presentation().tracking).toHaveLength(0);
  } finally { clock.mockRestore(); }
});
