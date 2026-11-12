import * as THREE from 'three';
import { createDetailAsset } from './detailAssets';
import { createStudyPhotoAsset } from './studyPhotoAssets';
import { createDiningBandAsset } from './diningBandAssets';
import { createRoomLighting } from './roomLighting';
import { DEFAULT_ATMOSPHERE } from './roomState';

const fixtures = [
  ['trackLight', () => createDetailAsset('trackLight')],
  ['pictureLight', () => createDetailAsset('pictureLight')],
  ['hangingLamp', () => createDetailAsset('hangingLamp')],
  ['propLamp', () => createDetailAsset('propLamp')],
  ['softbox', () => createStudyPhotoAsset('softbox')],
  ['stageLight', () => createDiningBandAsset('stageLight')]
];

function dispose(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
    if (object.isLight) object.dispose();
  });
}

test.each(fixtures)('%s emits through its diffuser and follows dimming after rotation', (kind, create) => {
  const scene = new THREE.Scene();
  const update = createRoomLighting(scene);
  const fixture = create();
  scene.add(fixture);
  fixture.rotation.y = Math.PI / 2;
  scene.updateMatrixWorld(true);
  const lamps = fixture.children.filter((object) => object.userData.roomLamp);
  const diffusers = fixture.children.filter((object) => object.userData.roomBulb);
  try {
    expect(lamps.length).toBeGreaterThan(0);
    for (const lamp of lamps) {
      expect(lamp.isSpotLight).toBe(true);
      expect(lamp.target.parent).toBe(fixture);
      const direction = lamp.target.getWorldPosition(new THREE.Vector3())
        .sub(lamp.getWorldPosition(new THREE.Vector3())).normalize();
      const diffuser = diffusers.reduce((closest, candidate) =>
        candidate.position.distanceTo(lamp.position) < closest.position.distanceTo(lamp.position) ? candidate : closest);
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(diffuser.matrixWorld);
      expect(direction.dot(normal)).toBeCloseTo(1);
      expect(lamp.position.distanceTo(diffuser.position)).toBeLessThan(0.03);
      expect(lamp.angle).toBeLessThan(Math.PI / 2);
      expect(lamp.penumbra).toBeGreaterThanOrEqual(0.85);
    }
    update({ ...DEFAULT_ATMOSPHERE, lamps: 0 }, fixture);
    expect(lamps.every((lamp) => lamp.intensity === 0)).toBe(true);
    expect(diffusers.every((diffuser) => diffuser.material.emissiveIntensity === 0)).toBe(true);
    update({ ...DEFAULT_ATMOSPHERE, lamps: 50 }, fixture);
    for (const lamp of lamps) expect(lamp.intensity).toBeCloseTo(lamp.userData.roomLampStrength / 2);
    for (const diffuser of diffusers) {
      expect(diffuser.material.emissiveIntensity).toBeCloseTo(diffuser.userData.roomBulbStrength / 2);
      expect(diffuser.material.emissiveIntensity).toBeLessThanOrEqual(0.175);
    }
    if (kind === 'stageLight') {
      expect(lamps[0].color.getHexString()).toBe('c18ce8');
      expect(diffusers[0].material.emissive.getHexString()).toBe('b781df');
    }
  } finally { dispose(scene); }
});

test('the track has four housed diffusers and only two lights in its outer heads', () => {
  const track = createDetailAsset('trackLight');
  try {
    const diffusers = track.children.filter((object) => object.userData.roomBulb);
    const lamps = track.children.filter((object) => object.isLight);
    expect(diffusers.map((object) => object.position.x)).toEqual([-1.5, -0.5, 0.5, 1.5]);
    expect(lamps.map((object) => object.position.x)).toEqual([-1.5, 1.5]);
    expect(diffusers.every((object) => object.material.side === THREE.FrontSide)).toBe(true);
  } finally { dispose(track); }
});
