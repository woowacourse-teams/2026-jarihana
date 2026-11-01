import { createRequestId } from '../../public/sparring-arena/src/request-id.js';

it('사설 IP의 HTTP 환경에서도 유효하고 고유한 UUID를 생성한다', () => {
  const descriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
  try {
    const ids = Array.from({ length: 32 }, createRequestId);
    expect(new Set(ids).size).toBe(32);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    if (descriptor) Object.defineProperty(crypto, 'randomUUID', descriptor);
    else delete crypto.randomUUID;
  }
});
