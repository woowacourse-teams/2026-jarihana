// Independent envelopes: the reference's double/triple-height voids are real metres.
// Decks, openings and stair runs also drive collision and first/third-person walking.
const plans = {
  climbing: { width: 22, back: -15, height: 13.2, deck: [0,-15,11,-5,5.6], stairs: [8.5,-5,10.7,3.1], leftOpen: false, window: 'back', name: '클라이밍 홀', ground: '암벽과 라운지' },
  boardgame: { width: 24, back: -17, height: 11.8, deck: [-12,-17,12,-10,5.3], stairs: [-11.7,-10,-9.5,2.4], leftOpen: true, window: 'none', name: '보드게임 라이브러리', ground: '게임 테이블과 부스' },
  dining: { width: 26, back: -16, height: 12, deck: [-13,-16,13,-9,5.4], stairs: [10.5,-9,12.7,2.5], leftOpen: false, window: 'back', name: '다이닝 하우스', ground: '공동 식탁과 오픈 키친' },
  band: { width: 24, back: -18, height: 11.6, deck: [-12,-18,12,-11,5.3], stairs: [9.5,-11,11.7,2.4], leftOpen: true, window: 'none', name: '리허설 스튜디오', ground: '합주실과 레코딩 라운지' },
  study: { width: 26, back: -17, height: 12.6, deck: [-13,-17,13,-10,5.8], stairs: [10.5,-10,12.7,3], leftOpen: false, window: 'left', name: '개발 워크스페이스', ground: '공동 작업과 발표' },
  photo: { width: 24, back: -17, height: 12.2, deck: [-12,-17,2.5,-10,5.6], stairs: [-11.7,-10,-9.5,2.5], leftOpen: true, window: 'back', name: '사진 스튜디오', ground: '촬영과 갤러리' }
};
export function makeReferenceLayout(p) {
  const h=p.width/2, [minX,minZ,maxX,maxZ,height]=p.deck;
  const [sx,sz,ex,ez]=p.stairs;
  const left=sx<0, run=ez-sz;
  const railStart=left?ex+0.15:minX, railEnd=left?maxX:sx-0.15;
  return { displayName:p.name, groundName:p.ground, windowSide:p.window, openings:p.openings,
    building:{minX:-h,maxX:h,minZ:p.back,maxZ:5,height:p.height},
    mezzanine:{minX,maxX,minZ,maxZ,height},
    stairs:{minX:sx,maxX:ex,minZ:sz,maxZ:ez,height,steps:Math.ceil(height/0.18)},
    walls:[
      {x:0,z:p.back,width:p.width+0.2,depth:0.24,height:p.height},
      {x:-h,z:(p.back+5)/2,width:0.24,depth:5-p.back,height:p.height,cutaway:p.leftOpen},
      {x:h,z:(p.back+5)/2,width:0.24,depth:5-p.back,height:p.height,cutaway:!p.leftOpen},
      {x:(-h-3.5)/2,z:5,width:h-3.5,depth:0.24,height:p.height,cutaway:true},
      {x:(h-0.5)/2,z:5,width:h+0.5,depth:0.24,height:p.height,cutaway:true}
    ],
    pillars:[minX+0.28,maxX-0.28].map(x=>({x,z:maxZ-0.15,width:0.24,depth:0.24,height})),
    railings:[{x:(railStart+railEnd)/2,z:maxZ,width:railEnd-railStart,depth:0.1,height:1.05},
      ...(minX>-h?[{x:minX,z:(minZ+maxZ)/2,width:0.1,depth:maxZ-minZ,height:1.05}]:[]),
      ...(maxX<h?[{x:maxX,z:(minZ+maxZ)/2,width:0.1,depth:maxZ-minZ,height:1.05}]:[])],
    stairRails:[sx,ex].map(x=>({x,z:(sz+ez)/2,width:0.1,depth:run,height:1.05})),
    clearPaths:[{minX:-3.4,maxX:-0.6,minZ:3.6,maxZ:8.2},
      {minX:-h+0.2,maxX:h-0.2,minZ:3.6,maxZ:4.75},
      {minX:sx-0.15,maxX:ex+0.15,minZ:sz,maxZ:4.75}],
    mezzaninePaths:[{minX,maxX,minZ:maxZ-1.15,maxZ}],
    facilityWalk:[],facilityPlacement:[],mats:[],
    zones:[{id:'hall',name:p.ground,minX:-h,maxX:h,minZ:maxZ,maxZ:5}]
  };
}
export const REFERENCE_LAYOUTS = Object.freeze(Object.fromEntries(Object.entries(plans).map(([key,p])=>[key,makeReferenceLayout(p)])));
