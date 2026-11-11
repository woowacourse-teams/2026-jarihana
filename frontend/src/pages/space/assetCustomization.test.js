import previousRooms from './fixtures/rooms-v9.json';
import * as THREE from 'three';
import { DETAIL_ASSETS, createDetailAsset } from './detailAssets';
import { ASSET_SURFACES, transformAttachedItems } from './assetCustomization';
import { canPlace, createInitialRoom, footprint, placedItemElevation, validateRoom, historyReducer } from './roomState';
import { getRoomLayout, PLAYER } from './roomLayout';
import { moveWalker } from './roomNavigation';
import { disposeObject } from './roomModels';
import { applyAssetAppearance } from './assetAppearance';

const parent={id:'desk',kind:'worktop',x:0,z:0,rotation:0};
const mug={id:'mug',kind:'propCup',x:1,z:0.2,rotation:0,parentId:'desk',surfaceIndex:0};
const sample=()=>({...createInitialRoom('dining'),items:[parent,mug]});

test('a parent move, rotation and resize transform attached props while keeping their real size',()=>{
  const items=transformAttachedItems([parent,mug],'desk',{x:3,z:-2,rotation:1,scaleX:2,scaleY:1.4});
  expect(items[1]).toMatchObject({x:3.2,z:-4,rotation:1,parentId:'desk'});
  expect(placedItemElevation(items[1],{...sample(),items})).toBeCloseTo(0.92*1.4);
  expect(footprint(items[1]).width).toBeCloseTo(0.22);
  expect(canPlace(items[0],items,'dining')).toBe(true);
});
test('save/reload is independent of parent order and preserves all customization',()=>{
  const room=sample();room.items=[{...mug,variant:3,color:'#758d5a'}, {...parent,finish:'walnut',scaleX:1.4}];
  expect(validateRoom(JSON.parse(JSON.stringify(room)))).toEqual(room);
});
test('attachments cannot dangle, cycle, cross floors, escape the surface, overlap peers, or select nonexistent shelves',()=>{
  for(const patch of [{parentId:'missing'},{parentId:'mug'},{level:1},{x:4},{surfaceIndex:4}])
    expect(validateRoom({...sample(),items:[parent,{...mug,...patch}]})).toBeNull();
  expect(validateRoom({...sample(),items:[{...parent,parentId:'mug'},mug]})).toBeNull();
  expect(validateRoom({...sample(),items:[parent,mug,{...mug,id:'second'}]})).toBeNull();
  expect(validateRoom({...sample(),items:[{...mug,parentId:undefined}]})).toBeNull();
});
test('parent resize fails atomically when a child would fall off and undo restores the entire group',()=>{
  const shrunk=transformAttachedItems([parent,{...mug,x:2.2}],'desk',{scaleX:0.25});
  expect(canPlace(shrunk[0],shrunk,'dining')).toBe(false);
  const before=sample(),after={...before,items:transformAttachedItems(before.items,'desk',{x:3})};
  const state=historyReducer({past:[],present:before,future:[]},{type:'change',room:after});
  expect(historyReducer(state,{type:'undo'}).present).toEqual(before);
});
test('shelf slots place different contents above one another without false floor collisions',()=>{
  const shelf={id:'shelf',kind:'openDisplayShelf',x:0,z:0,rotation:0};
  const props=ASSET_SURFACES.openDisplayShelf.map((_,i)=>({...mug,id:`cup-${i}`,parentId:'shelf',x:0,z:0,surfaceIndex:i}));
  const room={...sample(),items:[shelf,...props]};
  expect(validateRoom(room)).toEqual(room);
  expect(props.map(item=>placedItemElevation(item,room))).toEqual([0.25,0.95,1.65,2.35,3.05]);
});
test.each(['climbing','boardgame','dining','band','study','photo'])('%s new envelope has theme-specific height, retains width, roundtrips and has independently editable surface props',theme=>{
  const room=createInitialRoom(theme),layout=getRoomLayout(theme),old=getRoomLayout(theme,9);
  expect(layout.building.height).toBe({ climbing: 12.4, boardgame: 9.4, dining: 8.7, band: 8.8, study: 9.8, photo: 9.4 }[theme]);
  expect(layout.building.maxX-layout.building.minX).toBeGreaterThanOrEqual(old.building.maxX-old.building.minX);
  expect(room.items.filter(item=>item.parentId).length).toBeGreaterThan(15);
  expect(validateRoom(room)).toEqual(room);
  const stairs=layout.stairs, x=(stairs.minX+stairs.maxX)/2;
  let pos=moveWalker(PLAYER.spawn,{x:0,z:4.2-PLAYER.spawn.z},room);
  expect(pos.z).toBeCloseTo(4.2);
  pos=moveWalker(pos,{x:x-pos.x,z:0},room);expect(pos.x).toBeCloseTo(x);
  pos=moveWalker(pos,{x:0,z:stairs.minZ-0.65-pos.z},room);
  expect(pos.z).toBeCloseTo(stairs.minZ-0.65);expect(pos.y).toBeCloseTo(layout.mezzanine.height);
  pos=moveWalker(pos,{x:0,z:4.2-pos.z},room);expect(pos.y).toBe(0);
});

beforeAll(()=>jest.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null));
afterAll(()=>jest.restoreAllMocks());
test.each(DETAIL_ASSETS)('$kind geometry stays within its collision size',asset=>{
  for(const variant of [0,1,2,3,4,5]) {
  const model=createDetailAsset(asset.kind,{variant});const box=new THREE.Box3().setFromObject(model);
  try {expect(box.min.x).toBeGreaterThanOrEqual(-asset.width/2-0.01);expect(box.max.x).toBeLessThanOrEqual(asset.width/2+0.01);
    expect(box.min.z).toBeGreaterThanOrEqual(-asset.depth/2-0.01);expect(box.max.z).toBeLessThanOrEqual(asset.depth/2+0.01);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01);expect(box.max.y).toBeLessThanOrEqual(asset.height+0.01);
  } finally {disposeObject(model);}
  }
});

test('legacy furniture primary finish is editable without recoloring its emissive light',()=>{
  const root=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(3,2,1),new THREE.MeshStandardMaterial({color:'#94735a'}));
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.1),new THREE.MeshStandardMaterial({color:'#ffffff',emissive:'#ffdd99'}));
  root.add(body,bulb);const bulbMaterial=bulb.material;
  applyAssetAppearance(root,{color:'#775544',finish:'metal'});
  expect(body.material.color.getHexString()).toBe('775544');
  expect(body.material.metalness).toBe(0.7);expect(bulb.material).toBe(bulbMaterial);
  disposeObject(root);
});
test('pizza, ramen and dessert remain different editable food assets',()=>{
  const meals=['pizza','ramen','dessert'].map(food=>createDetailAsset('propPlates',{food}));
  try {
    expect(new Set(meals.map(model=>model.children.length)).size).toBe(3);
    for(const meal of meals)expect(new THREE.Box3().setFromObject(meal).max.y).toBeLessThanOrEqual(0.22);
  } finally {meals.forEach(disposeObject);}
});
test('wall props can sit above a mezzanine but cannot intersect its slab',()=>{
  const prop={id:'print',kind:'wallPrint',x:0,z:-12,rotation:0};
  expect(canPlace({...prop,elevation:getRoomLayout('boardgame').mezzanine.height - 0.5},[],'boardgame')).toBe(false);
  expect(canPlace({...prop,elevation:5.8},[],'boardgame')).toBe(true);
});

test.each(Object.keys(previousRooms))('%s v9 save migrates without losing identities, colors or contents',theme=>{
  const before=previousRooms[theme], after=validateRoom(before);
  expect(after).not.toBeNull();expect(after.version).toBe(10);
  expect(after.items).toHaveLength(before.items.length);
  for(const item of before.items) expect(after.items.find(next=>next.id===item.id)).toMatchObject({...item,x:expect.any(Number),z:expect.any(Number)});
  expect(validateRoom(after)).toEqual(after);
});
