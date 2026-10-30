import * as THREE from 'three';
import { createCapsuleReveals } from '../../public/sparring-arena/src/capsule-reveals.js';

jest.mock('three', () => jest.requireActual('../../public/sparring-arena/vendor/three.module.js'), { virtual: true });

it('파이프에서 나온 새 한마디 말풍선을 누르면 해당 의견을 받아치기로 선택한다', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
  const container = document.createElement('div');
  document.body.append(container);
  const selectReply = jest.fn();
  const reveals = createCapsuleReveals(container, selectReply);
  const post = { id: 'post-1', name: '가온', text: '같이 기다리자', side: 'a' };
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld();
  try {
    reveals.update([], [{ post, body: { position: new THREE.Vector3(0, 0, -1) } }], camera);
    const bubble = container.querySelector('.capsule-flight-tag');
    expect(bubble.tagName).toBe('BUTTON');
    expect(bubble).toHaveAttribute('data-ph-capture-attribute-action', 'sparring_reply_start');
    expect(bubble).toHaveAccessibleName('방금 · 가온: 같이 기다리자. 눌러서 받아치기');
    bubble.click();
    expect(selectReply).toHaveBeenCalledWith('post-1');
  } finally {
    reveals.dispose(); container.remove();
    if (original) Object.defineProperty(window, 'matchMedia', original);
    else delete window.matchMedia;
  }
});
