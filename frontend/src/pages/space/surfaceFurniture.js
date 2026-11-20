import * as THREE from 'three';
import { createSurfaceMaterial } from './architecturalMaterials';

// Furniture bodies are independent of their contents. All surface dressing is room items.
const tables = {
  table: [2.4,1.5,0.9], diningTable:[3.4,1.7,0.88], feastTable:[4.8,1.8,0.98], gameTable:[4.4,2.7,0.79],
  studyDesk:[4.4,2,0.79], focusDesk:[2,0.95,0.79], photoEditDesk:[2.6,1.1,0.79], photoPrintBench:[3,1.1,0.92],
  coffeeTable:[2.4,1.3,0.5]
};
export function createSurfaceFurniture(kind, {color}={}) {
  const dims=tables[kind]; if(!dims)return null;
  const root=new THREE.Group(); root.name=kind;
  const [w,d,h]=dims;
  const wood=createSurfaceMaterial('oak',color||(['studyDesk','focusDesk'].includes(kind)?'#d4cec0':'#b3865b'),w,d);
  const metal=new THREE.MeshStandardMaterial({color:'#4b4947',roughness:0.44,metalness:0.55});
  function box(w,h,d,x,y,z,material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;m.userData.customFinish=material===wood;root.add(m);}
  box(w,0.09,d,0,h-0.045,0,wood);
  for(const x of [-w/2+0.18,w/2-0.18]) for(const z of [-d/2+0.15,d/2-0.15])box(0.09,h-0.09,0.09,x,(h-0.09)/2,z,metal);
  for(const z of [-d/2+0.15,d/2-0.15])box(w-0.32,0.15,0.06,0,h-0.18,z,wood);
  if(kind==='gameTable') {
    const felt=new THREE.MeshStandardMaterial({color:'#aa875e',roughness:1});box(w-0.22,0.008,d-0.22,0,h+0.002,0,felt);
  }
  return root;
}
