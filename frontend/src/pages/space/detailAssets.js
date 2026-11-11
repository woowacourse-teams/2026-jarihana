import * as THREE from 'three';
import { createSurfaceMaterial } from './architecturalMaterials';

export const DETAIL_ASSETS = Object.freeze([
  ['longCredenza', '긴 수납 카운터', 4.8, 1, 1.02, 'common'],
  ['worktop', '긴 작업대', 4.8, 1.1, 0.96, 'common'],
  ['openDisplayShelf', '빈 오픈 선반', 2.4, 0.7, 3.12, 'common'],
  ['wallShelf', '벽 선반', 2.4, 0.65, 0.1, 'common', 'wall'],
  ['propBooks', '책과 잡지', 0.55, 0.4, 0.28, 'props'],
  ['propBookRow', '세워 꽂은 책 묶음', 0.56, 0.35, 0.6, 'props'],
  ['propBottle', '유리병과 물병', 0.22, 0.22, 0.45, 'props'],
  ['propCup', '개인 머그', 0.34, 0.22, 0.22, 'props'],
  ['propPlant', '작은 화분', 0.55, 0.55, 0.75, 'props'],
  ['propPlates', '접시와 음식', 0.6, 0.6, 0.21, 'props'],
  ['propGameBox', '보드게임 상자', 0.65, 0.48, 0.58, 'props'],
  ['propCamera', '카메라와 렌즈', 0.55, 0.54, 0.32, 'props'],
  ['propLaptop', '노트북', 0.65, 0.48, 0.44, 'props'],
  ['propFrame', '탁상 액자', 0.38, 0.18, 0.44, 'props'],
  ['propLamp', '탁상 스탠드', 0.45, 0.45, 0.62, 'props'],
  ['propGameBoard', '게임판과 말', 1.5, 1.1, 0.12, 'props'],
  ['propMonitor', '모니터와 키보드', 0.9, 0.65, 0.75, 'props'],
  ['propCanisters', '식재료 보관병', 0.65, 0.4, 0.42, 'props'],
  ['propPedals', '이펙터와 케이블', 0.9, 0.6, 0.16, 'props'],
  ['hangingLamp', '높이 조절 펜던트', 0.75, 0.75, 1.5, 'architecture', 'ceiling'],
  ['trackLight', '이동식 4구 조명 레일', 4, 0.45, 0.38, 'architecture', 'ceiling'],
  ['ceilingBeam', '노출 천장 보', 6, 0.2, 0.34, 'architecture', 'ceiling'],
  ['acousticCloud', '천장 흡음 패널', 2.6, 1.15, 0.52, 'architecture', 'ceiling'],
  ['wallPrint', '갤러리 포스터', 1.15, 0.12, 1.45, 'architecture', 'wall'],
  ['pictureLight', '액자 벽등', 0.9, 0.6, 0.3, 'architecture', 'wall'],
  ['acousticTile', '벽 흡음 패널', 1.6, 0.2, 2.2, 'architecture', 'wall'],
  ['loftPartition', '복층 방 벽 모듈', 4, 0.22, 4.4, 'architecture'],
  ['loftGlassPartition', '복층 방 유리벽 모듈', 4, 0.22, 4.4, 'architecture']
].map(([kind, name, width, depth, height, collection, mount]) => Object.freeze({kind, name, width, depth, height, collection, category: 'furniture', ...(mount ? {mount} : {}), ...(collection === 'props' ? {prop: true} : {})})));

export function createDetailAsset(kind, { color, variant = 0, suspension = 1.5, food = 'pizza' } = {}) {
  if (!DETAIL_ASSETS.some((entry) => entry.kind === kind)) return null;
  const root = new THREE.Group(); root.name = kind;
  const palette = ['#c99562', '#788967', '#b87258', '#647d91', '#c4b48f', '#775e79'];
  const tint = color || palette[variant % palette.length];
  const mats = new Map();
  function mat(c, finish = 'matte') {
    const key = c + finish;
    if (!mats.has(key)) mats.set(key, finish === 'wood' ? createSurfaceMaterial('oak', c, 3, 1) : finish === 'acoustic' ? createSurfaceMaterial('acoustic', c, 1, 1) : new THREE.MeshStandardMaterial({color: c, roughness: finish === 'glass' ? 0.16 : finish === 'metal' ? 0.4 : 0.8, metalness: finish === 'metal' ? 0.65 : 0}));
    return mats.get(key);
  }
  function mesh(geo, c, x, y, z, finish) {
    const m = new THREE.Mesh(geo, mat(c, finish)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true;
    if (finish === 'wood') m.userData.customFinish = true;
    root.add(m); return m;
  }
  const box = (w, h, d, c, x = 0, y = h / 2, z = 0, finish) => mesh(new THREE.BoxGeometry(w,h,d), c,x,y,z,finish);
  const cyl = (r, h, c, x=0,y=h/2,z=0,r2=r,finish) => mesh(new THREE.CylinderGeometry(r,r2,h,16),c,x,y,z,finish);
  function lamp(x,y,z, strength=2.5, radius=0.09) {
    const diffuser = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), new THREE.MeshStandardMaterial({
      color: '#fff5db', emissive: '#ffd2a0', emissiveIntensity: 0.3, roughness: 1
    }));
    diffuser.name = 'fixture-diffuser';
    diffuser.position.set(x,y,z);
    diffuser.rotation.x = Math.PI / 2;
    diffuser.userData.roomBulb = true;
    diffuser.userData.roomBulbStrength = 0.3;
    root.add(diffuser);
    if (strength === 0) return;
    const light = new THREE.SpotLight('#ffd2a0', strength, 9, Math.PI / 3, 1, 1.65);
    light.position.set(x,y-0.02,z);
    light.target.position.set(x,y-1,z);
    light.userData.roomLamp = true;
    light.userData.roomLampStrength = strength;
    root.add(light, light.target);
  }
  if (['longCredenza','worktop','openDisplayShelf','wallShelf'].includes(kind)) {
    if (kind === 'openDisplayShelf') {
      box(2.4,3.1,0.06,tint,0,1.55,-0.32,'wood');
      for(const x of [-1.16,0,1.16]) box(0.07,3.1,0.7,tint,x,1.55,0,'wood');
      for(const y of [0.21,0.91,1.61,2.31,3.01]) box(2.4,0.08,0.7,tint,0,y,0,'wood');
    } else if(kind === 'wallShelf') box(2.4,0.08,0.65,tint,0,0.04,0,'wood');
    else {
      box(4.8,0.08,kind === 'worktop'?1.1:0.95,tint,0,kind==='worktop'?0.88:0.94,0,'wood');
      if(kind === 'longCredenza') {
        box(4.65,0.8,0.85,tint,0,0.5,0,'wood');
        for(let x=-1.8;x<2;x+=0.9){box(0.85,0.72,0.025,tint,x,0.5,0.44,'wood');box(0.24,0.025,0.035,'#594c3d',x,0.72,0.47);}
      } else for(const x of [-2.1,2.1]) for(const z of [-0.4,0.4]) box(0.08,0.84,0.08,'#454446',x,0.42,z,'metal');
    }
  } else if(kind === 'propBookRow') {
    for(let i=0;i<5;i++) {
      const h=0.4+((i+variant)%4)*0.06,x=-0.212+i*0.106;
      box(0.09,h,0.31,palette[(i+variant)%6],x,h/2);
      box(0.06,0.018,0.008,'#d9d3bb',x,h-0.07,0.159);
      box(0.06,0.012,0.008,'#d9d3bb',x,0.06,0.159);
    }
  } else if(kind === 'propBooks' || kind === 'propGameBox') {
    const game = kind === 'propGameBox';
    if (game && variant % 2) {
      box(0.48,0.56,0.2,tint,0,0.28);
      box(0.39,0.39,0.012,palette[(variant+2)%6],0,0.31,0.105);
      for(let i=0;i<3;i++)box(0.3-i*0.05,0.015,0.01,'#e7d8b9',0,0.48-i*0.045,0.116);
      const badge=cyl(0.08,0.008,'#d4b072',0,0.21,0.12);badge.rotation.x=Math.PI/2;
    } else for(let i=0;i<(game?2:3);i++) {
      box(game?0.64-i*0.06:0.52-i*0.03,0.06,game?0.46:0.36,palette[(i+variant)%6],i*0.015,0.04+i*0.075,0);
      box(game?0.48:0.42,0.008,0.01,'#e6d5ac',0,0.05+i*0.075,game?0.236:0.186);
      if(game) for(let j=0;j<3;j++)box(0.08,0.005,0.18,palette[(j+variant)%6],-0.15+j*0.15,0.075+i*0.075,0);
    }
  } else if(kind==='propBottle') {
    cyl(0.1,0.3,tint,0,0.15,0,0.09,'glass'); cyl(0.045,0.14,tint,0,0.36,0,0.04,'glass'); cyl(0.05,0.045,'#ccb78f',0,0.435); cyl(0.102,0.12,'#ece0c9',0,0.18);
  } else if(kind==='propCup') {
    cyl(0.1,0.19,tint);cyl(0.08,0.012,'#5e4434',0,0.194);const h=mesh(new THREE.TorusGeometry(0.065,0.018,6,16),tint,0.1,0.11,0);h.scale.x=0.7;
  } else if(kind==='propPlant') {
    cyl(0.13,0.23,tint,0,0.115,0,0.1);cyl(0.12,0.02,'#554734',0,0.24);
    for(let i=0;i<9;i++){const a=i*2.4;const leaf=mesh(new THREE.SphereGeometry(0.08,8,6),palette[(i%2)+1]==='#b87258'?'#87985f':'#627c50',Math.sin(a)*0.13,0.35+(i%3)*0.11,Math.cos(a)*0.13);leaf.scale.set(0.5,2,0.9);leaf.rotation.z=Math.sin(a)*0.7;}
  } else if(kind==='propPlates') {
    for(let i=0;i<3;i++) cyl(0.27,0.018,'#e8dbc4',0,0.02+i*0.023);
    if(food==='ramen') {
      cyl(0.23,0.09,'#d9e0d6',0,0.12,0,0.15);cyl(0.2,0.015,'#b88b54',0,0.168);
      for(let i=0;i<4;i++)box(0.22,0.012,0.015,'#efce87',0,0.18,-0.08+i*0.05);
      cyl(0.06,0.018,'#efdfb6',0.1,0.184);cyl(0.025,0.008,'#e8a654',0.1,0.197);
    } else if(food==='dessert') {
      cyl(0.18,0.1,'#c79868',0,0.125);cyl(0.18,0.025,'#f1dfbf',0,0.187);
      for(let i=0;i<4;i++)cyl(0.025,0.015,'#b44d42',Math.sin(i*1.6)*0.1,0.205,Math.cos(i*1.6)*0.1);
    } else {
      cyl(0.2,0.06,variant%2?'#cf9b56':'#bd774a',0,0.11);for(let i=0;i<6;i++)cyl(0.035,0.025,i%2?'#718448':'#b84732',Math.sin(i)*0.12,0.15,Math.cos(i)*0.12);
    }
  } else if(kind==='propCamera') {
    box(0.36,0.23,0.19,'#353638',-0.06,0.14);box(0.14,0.06,0.16,'#353638',-0.06,0.285);
    const l=cyl(0.1,0.18,'#272f33',-0.06,0.14,0.17);l.rotation.x=Math.PI/2;cyl(0.065,0.19,'#424347',0.22,0.095,-0.05);
  } else if(kind==='propLaptop') {
    box(0.62,0.025,0.42,'#8c9399');const m=box(0.62,0.39,0.024,'#4a525a',0,0.215,-0.19);m.rotation.x=-0.12;
    box(0.56,0.32,0.008,variant%2?'#7a9196':'#546b8a',0,0.22,-0.17);
    for(let i=0;i<5;i++)box(0.42-i*0.04,0.009,0.01,'#b4c1c0',-0.02,0.32-i*0.04,-0.161);
  } else if(kind==='propFrame'||kind==='wallPrint') {
    const w=kind==='wallPrint'?1.15:0.38,h=kind==='wallPrint'?1.45:0.44;
    box(w,h,0.06,'#5a493e',0,h/2);box(w-0.08,h-0.08,0.012,'#dfd8c9',0,h/2,0.035);
    const pictureWidth = w - 0.18;
    const pictureHeight = h - 0.18;
    box(pictureWidth,pictureHeight,0.008,palette[(variant+3)%6],0,h/2,0.045);
    if (variant % 3 === 0) {
      // Skyline print with staggered towers and small illuminated windows.
      for (let i=0;i<5;i++) {
        const towerHeight=pictureHeight*(0.22+(i*7%5)*0.1);
        const x=(i-2)*pictureWidth/5;
        box(pictureWidth/6,towerHeight,0.008,'#424c51',x,0.1+towerHeight/2,0.051);
        for(let row=0;row<3;row++)box(pictureWidth/28,pictureHeight/45,0.008,'#e2cda6',x,0.13+row*towerHeight/4,0.055);
      }
    } else if (variant % 3 === 1) {
      // Landscape print, framed independently from neighbouring pictures.
      for(let i=0;i<3;i++) {
        const mountain=mesh(new THREE.ConeGeometry(pictureWidth*(0.22+i*0.03),pictureHeight*(0.45+i*0.08),3),'#53665e',(i-1)*pictureWidth*0.24,h*0.35,0.051);
        mountain.scale.z=0.008;
      }
      const sun=cyl(w*0.07,0.006,'#dfb77f',w*0.2,h*0.73,0.057);sun.rotation.x=Math.PI/2;
    } else {
      // Gig-poster rhythm with a record and short typographic bars.
      const record=cyl(w*0.24,0.008,'#333239',0,h*0.57,0.051);record.rotation.x=Math.PI/2;
      const label=cyl(w*0.08,0.008,'#c9a16b',0,h*0.57,0.056);label.rotation.x=Math.PI/2;
      for(let i=0;i<3;i++)box(pictureWidth*(0.85-i*0.15),h*0.025,0.008,'#e6d8b9',0,h*(0.16+i*0.065),0.055);
    }
  } else if(kind==='propLamp') {
    cyl(0.18,0.035,tint);cyl(0.018,0.4,'#74654d',0,0.22);cyl(0.13,0.21,tint,0,0.51,0,0.22);lamp(0,0.4,0,4);
  } else if(kind==='propGameBoard') {
    box(1.5,0.025,1.1,'#d2b37c');
    for(let x=0;x<6;x++)for(let z=0;z<4;z++)box(0.22,0.006,0.23,palette[(x+z+variant)%6],-0.6+x*0.24,0.03,-0.36+z*0.24);
    for(let i=0;i<8;i++)cyl(0.035,0.065,palette[(i+variant)%6],Math.sin(i*2.4)*0.5,0.07,Math.cos(i*2.4)*0.36);
  } else if(kind==='propMonitor') {
    box(0.25,0.025,0.2,'#5c6267',0,0.012,-0.15);box(0.045,0.3,0.045,'#5c6267',0,0.17,-0.15);
    box(0.88,0.5,0.045,'#3c454d',0,0.49,-0.17);box(0.81,0.43,0.008,'#486478',0,0.49,-0.14);
    for(let i=0;i<6;i++)box(0.45+(i%3)*0.08,0.014,0.008,palette[(i+variant)%6],-0.05,0.63-i*0.052,-0.132);
    box(0.48,0.02,0.18,'#8a9399',-0.08,0.02,0.2);box(0.08,0.025,0.13,'#636a70',0.27,0.025,0.22);
  } else if(kind==='propCanisters') {
    for(let i=0;i<3;i++){cyl(0.09,0.23+i*0.07,'#c6ae87',-0.22+i*0.22,0.115+i*0.035);cyl(0.095,0.03,'#706149',-0.22+i*0.22,0.245+i*0.07);cyl(0.092,0.08,'#e3d7bf',-0.22+i*0.22,0.12);}
  } else if(kind==='propPedals') {
    box(0.85,0.05,0.5,'#393638');for(let i=0;i<3;i++){box(0.17,0.075,0.28,palette[(i+variant)%6],-0.27+i*0.27,0.085);cyl(0.022,0.03,'#b8b1a3',-0.27+i*0.27,0.137,0.04);}
    const cable=mesh(new THREE.TorusGeometry(0.22,0.012,5,24), '#29282a',0,0.04,0);cable.rotation.x=Math.PI/2;
  } else if(kind==='hangingLamp') {
    cyl(0.016,Math.max(0.1,suspension-0.4),'#423c38',0,(suspension+0.4)/2);cyl(0.18,0.34,tint,0,0.25,0,0.36);lamp(0,0.075,0,34,0.24);
  } else if(kind==='trackLight') {
    box(4,0.06,0.08,color||'#393a3e',0,0.34);
    for(const x of [-1.5,-0.5,0.5,1.5]) {
      cyl(0.11,0.23,color||'#464447',x,0.2);
      lamp(x,0.08,0,Math.abs(x) > 1 ? 9 : 0,0.085);
    }
  } else if(kind==='ceilingBeam') {
    if(variant===1) {
      const baffle=box(6,0.3,0.2,color||'#34333b',0,0.17);
      baffle.name='fabric-ceiling-baffle';baffle.userData.customFinish=true;
      box(5.9,0.025,0.18,'#17191f',0,0.025);
    } else if(variant===2) box(6,0.34,0.2,color||'#96734e',0,0.17,0,'wood');
    else {box(6,0.08,0.2,tint,0,0.04,0,'metal');box(6,0.24,0.06,tint,0,0.2,0,'metal');box(6,0.04,0.2,tint,0,0.32,0,'metal');}
  } else if (kind === 'acousticCloud') {
    const fabric = color || '#746879';
    const frame = '#302a32';
    for (const x of [-0.945, -0.315, 0.315, 0.945]) {
      const absorber = box(0.58, 0.2, 1.05, fabric, x, 0.1, 0, 'acoustic');
      absorber.name = 'ceiling-fabric-absorber';
      absorber.userData.customFinish = true;
    }
    for (const z of [-0.55, 0.55]) box(2.6, 0.11, 0.05, '#a07c60', 0, 0.13, z);
    for (const x of [-1.275, 1.275]) box(0.05, 0.11, 1.05, frame, x, 0.13);
    for (const x of [-0.9, 0.9]) {
      cyl(0.014, 0.32, frame, x, 0.33, 0, 0.014, 'metal');
      cyl(0.07, 0.03, frame, x, 0.505, 0, 0.07, 'metal');
    }
  } else if(kind==='pictureLight') {
    box(0.8,0.08,0.17,'#675541',0,0.23,0.1);box(0.05,0.2,0.1,'#675541',0,0.1,0);lamp(0,0.185,0.1,9,0.06);
  } else if(kind==='loftPartition'||kind==='loftGlassPartition') {
    const wall=color||'#d8d6cf';
    const studio=variant===1;
    const body=box(4,kind==='loftPartition'?4.4:studio?1:0.85,0.2,wall);
    body.userData.customFinish=true;
    box(4,0.13,0.22,'#777c7d',0,0.065);
    box(4,0.12,0.22,wall,0,4.34);
    if(kind==='loftGlassPartition') {
      const glass=new THREE.Mesh(new THREE.BoxGeometry(studio?3.55:3.78,studio?2.95:3.37,0.035),new THREE.MeshStandardMaterial({color:studio?'#8babb2':'#b9ced0',transparent:true,opacity:studio?0.12:0.22,roughness:0.12,metalness:0.05,depthWrite:false}));
      glass.name=studio?'studio-observation-glass':'meeting-room-glass';glass.position.set(0,studio?2.55:2.565,studio?0.045:0);root.add(glass);
      if(studio){const second=glass.clone();second.position.z=-0.045;root.add(second);}
      for(const x of studio?[-1.88,1.88]:[-1.94,0,1.94])box(studio?0.2:0.085,3.48,0.22,studio?'#313339':'#606c71',x,2.56);
      for(const y of studio?[1,4.08]:[0.86,3.48,4.24])box(3.85,studio?0.18:0.055,0.22,studio?'#313339':'#606c71',0,y);
    } else if(studio) {
      for(const z of [-0.105,0.105])for(let row=0;row<3;row++)for(let col=0;col<4;col++) {
        const pad=box(0.92,1.31,0.01,wall,-1.48+col*0.985,0.83+row*1.38,z);
        pad.material=mat(wall,'acoustic');pad.name='partition-fabric-cassette';pad.userData.customFinish=true;
      }
    } else if(variant===2) {
      for(let n=0;n<32;n++)for(const z of [-0.105,0.105])box(0.065,4.08,0.01,wall,-1.94+n*0.125,2.2,z,'wood');
    }
  } else if(kind==='acousticTile') {
    const tone=color||'#454046';
    box(1.6,2.2,0.06,'#25262b',0,1.1,-0.045);
    if(variant%3===0) {
      const geo=new THREE.ConeGeometry(0.13,0.1,4).rotateY(Math.PI/4).rotateX(Math.PI/2);
      const foam=new THREE.InstancedMesh(geo,mat(tone),88);
      const matrix=new THREE.Matrix4();
      for(let y=0;y<11;y++)for(let x=0;x<8;x++){matrix.makeTranslation(-0.68+x*0.195,0.17+y*0.185,0.03);foam.setMatrixAt(y*8+x,matrix);}
      foam.name='acoustic-wedge-grid';foam.castShadow=foam.receiveShadow=true;foam.computeBoundingBox();root.add(foam);
    } else if(variant%3===1) {
      for(const x of [-0.39,0.39])for(const y of [0.56,1.64]) {
        const pad=box(0.74,1.02,0.13,tone,x,y,0.025);
        pad.material=mat(tone,'acoustic');pad.name='acoustic-fabric-pad';pad.userData.customFinish=true;
      }
    } else for(let i=0;i<18;i++) {
      const d=0.04+(i*i%4)*0.03;
      const slat=box(0.075,2.08,d,color||'#a2855d',-0.72+i*0.085,1.1,-0.04+d/2,'wood');slat.name='acoustic-diffuser-well';
    }
  }
  root.userData.assetKind=kind;return root;
}
