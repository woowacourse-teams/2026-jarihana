import * as THREE from 'three';
import { createRoomShell, disposeObject } from './roomModels';
import { createDetailAsset } from './detailAssets';
import { createSurfaceMaterial } from './architecturalMaterials';
import savedPresets from './fixtures/rooms-v10.json';
import { moveWalker, isWalkablePosition } from './roomNavigation';

function named(root, name) {
  const result=[];root.traverse(object=>{if(object.name===name)result.push(object);});return result;
}

test('each envelope has its own windows and balustrade construction',()=>{
  const features={
    climbing:['climbing-daylight-window',3,'horizontal-safety-rail'],
    band:['band-daylight-window',0,'band-solid-studio-parapet'],
    dining:['dining-daylight-window',4,'arched-window-frame'],
    boardgame:['boardgame-daylight-window',0,'boardgame-booth-paneling'],
    study:['study-daylight-window',4,'study-glass-balustrade'],
    photo:['photo-daylight-window',2,'gallery-picture-rail']
  };
  for(const[template,[window,count,detail]]of Object.entries(features)) {
    const root=createRoomShell({template,version:10});
    try {expect(named(root,window)).toHaveLength(count);expect(root.getObjectByName(detail)).toBeDefined();}
    finally{disposeObject(root);}
  }
});

test('band wall cassettes have real relief and retain user wall-material overrides',()=>{
  const room=createRoomShell({template:'band',version:10,wallColor:'#3b3640',atmosphere:{wallMaterial:'brick'}});
  try {
    const panels=named(room,'band-fabric-wall-cassettes');expect(panels).toHaveLength(3);
    for(const panel of panels){
      expect(panel.isInstancedMesh).toBe(true);expect(panel.count).toBeGreaterThan(80);
      expect(panel.geometry.parameters.depth).toBeCloseTo(0.13);expect(panel.material.name).toBe('pbr-brick');
    }
    expect(room.getObjectByName('band-corner-bass-trap')).toBeDefined();
  }finally{disposeObject(room);}
});

test('foam, fabric and diffuser assets are different physical treatments',()=>{
  const names=['acoustic-wedge-grid','acoustic-fabric-pad','acoustic-diffuser-well'];
  for(let variant=0;variant<3;variant++){
    const model=createDetailAsset('acousticTile',{variant});
    try {expect(model.getObjectByName(names[variant])).toBeDefined();expect(new THREE.Box3().setFromObject(model).max.z).toBeLessThanOrEqual(0.1);}
    finally{disposeObject(model);}
  }
  const fabric=createSurfaceMaterial('acoustic','#444444'),wood=createSurfaceMaterial('woodpanel','#444444');
  expect(fabric.map.image.data).not.toEqual(wood.map.image.data);
  for(const material of [fabric,wood]){for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose();}
});

test('saved v10 band control room is reachable through its door but not through its observation window',()=>{
  const room=savedPresets.band;let position={x:4.2,z:-6,y:0};
  for(const target of [{x:4.2,z:-10.5},{x:4.2,z:-12.3},{x:5,z:-12.3},{x:5,z:-14.1}]){
    position=moveWalker(position,{x:target.x-position.x,z:target.z-position.z},room);
    expect(position.x).toBeCloseTo(target.x);expect(position.z).toBeCloseTo(target.z);
  }
  expect(isWalkablePosition({x:3.1,z:-14,y:0},room)).toBe(false);
  expect(isWalkablePosition({x:7.05,z:-11.35,y:0},room)).toBe(false);
  expect(isWalkablePosition({x:4.15,z:-11.35,y:0},room)).toBe(true);
  position = { x: 4.2, z: -12, y: 0 };
  for (const target of [{ x: 7.6, z: -12 }, { x: 7.6, z: -13.2 }]) {
    position = moveWalker(position, { x: target.x - position.x, z: target.z - position.z }, room);
    expect(position.x).toBeCloseTo(target.x);
    expect(position.z).toBeCloseTo(target.z);
  }
  expect(isWalkablePosition({ x: 4.2, z: -14.5, y: 0 }, room)).toBe(true);
});

test.each([
  ['climbing', [[6.8, -3.3], [6.8, -5.4]]],
  ['dining', [[6, -10.3], [-8.1, -10.3], [-8.1, -13.3]]],
  ['boardgame', [[0, 3.6], [0, -3.6], [2, -3.6], [2, -5.4], [5.2, -5.4], [8.5, -5.4], [8.5, -1.5]]],
  ['study', [[9.8, -5], [9.8, -10.65], [9.5, -10.65], [9.5, -12.3], [9.5, -14.45], [10.95, -14.45]]],
  ['photo', [[0, -8.5], [3, -8.5], [3, -10.8], [2.1, -10.8], [2.1, -14.5]]]
])('%s saved v10 activity area has a usable approach around its partitions', (template, route) => {
  const room = savedPresets[template];
  let position = { x: route[0][0], z: route[0][1], y: 0 };
  expect(isWalkablePosition(position, room)).toBe(true);
  for (const [x, z] of route.slice(1)) {
    position = moveWalker(position, { x: x - position.x, z: z - position.z }, room);
    expect(position.x).toBeCloseTo(x);
    expect(position.z).toBeCloseTo(z);
    expect(position.y).toBe(0);
  }
});
