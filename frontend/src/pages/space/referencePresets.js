import { composeDiningPreset } from './themePresets/dining';
import { composeBoardgamePreset } from './themePresets/boardgame';
import { composeClimbingPreset } from './themePresets/climbing';
import { composeBandPreset } from './themePresets/band';
import { composeStudyPreset } from './themePresets/study';
import { composePhotoPreset } from './themePresets/photo';
import { localToWorld } from './assetCustomization';
import { CURRENT_LAYOUTS } from './themeLayouts';

export const PRESET_MUSIC_POSITIONS = {
  climbing: { x: 8.5, z: -1.75, rotation: 0 },
  band: { x: 7.5, z: 0.75, rotation: 0 },
  dining: { x: 4.25, z: 2.5, rotation: 0 },
  boardgame: { x: 10, z: 0.25, rotation: 3 },
  study: { x: 5, z: 0.75, rotation: 0 },
  photo: { x: 3, z: 2.5, rotation: 0 }
};

export function composeReferencePreset(template, source) {
  if(template==='lounge')return source;
  const items=[];
  const layout=CURRENT_LAYOUTS[template], b=layout.building, m=layout.mezzanine;
  function add(id,kind,x,z,rotation=0,extra={}) {const entry={id,kind,x,z,rotation,...extra};items.push(entry);return entry;}
  const up=(id,kind,x,z,r=0,extra={})=>add(id,kind,x,z,r,{level:1,...extra});
  function prop(parent,kind,x,z,index=0,extra={}) {
    return add(`${parent.id}-${kind}-${items.length}`,kind,...Object.values(localToWorld(parent,x,z)),parent.rotation,
      {parentId:parent.id,surfaceIndex:index,level:parent.level||0,variant:items.length%6,...extra});
  }
  function dress(table, theme=template) {
    const work=['study','photo'].includes(theme);
    if(work){prop(table,theme==='photo'?'propMonitor':'propLaptop',-0.9,-0.05);prop(table,'propBooks',0.5,0.1);prop(table,'propCup',0.95,0.15);}
    else if(theme==='dining'&&table.kind==='feastTable'){
      const xs=table.scaleX>1.3?[-1.8,-0.6,0.6,1.8]:[-1.6,0,1.6];
      for(const dx of xs)for(const dz of[-0.5,0.5]){prop(table,'propPlates',dx,dz);prop(table,'propCup',dx+0.47,dz);}
      prop(table,'propPlant',table.scaleX>1.3?0:-0.8,0);prop(table,'propBottle',0.8,0);
    }
    else if(theme==='boardgame'){prop(table,'propGameBoard',0,0);prop(table,'propGameBox',1.3,0.3);prop(table,'propCup',-1.5,-0.55);prop(table,'propBottle',1.5,-0.7);}
    else {prop(table,'propPlates',-0.9,0);prop(table,'propPlates',0.9,0);prop(table,'propPlant',0,0);prop(table,'propCup',table.kind==='table'?-0.9:-1.5,0.55);prop(table,'propBottle',table.kind==='table'?0.9:1.5,0.55);}
  }
  function cabinet(id,x,z,r=0,level=0,kind='longCredenza',extra={}) {
    const c=add(id,kind,x,z,r,{level,...extra});
    prop(c,'propPlant',-1.75,0);prop(c,template==='photo'?'propCamera':template==='boardgame'?'propGameBox':'propBooks',-0.7,0);
    prop(c,'propFrame',0.3,0);prop(c,'propLamp',1.5,0);
    return c;
  }
  function shelf(id,x,z,r=0,level=0,theme=template,extra={}) {
    const s=add(id,'openDisplayShelf',x,z,r,{level,color:theme==='study'?'#53585b':theme==='band'?'#65503f':theme==='photo'?'#625746':'#a77a4f',...extra});
    const contents=theme==='dining'?['propCanisters','propPlates','propBottle']:theme==='photo'?['propCamera','propBookRow','propFrame']:theme==='study'?['propBookRow','propBookRow','propFrame']:theme==='band'?['propBookRow','propBooks','propFrame']:['propGameBox','propBooks','propFrame'];
    for(let row=0;row<4;row++)for(let col=0;col<4;col++) {
      const kind = theme==='boardgame' ? 'propGameBox' : contents[(row+col)%3];
      prop(s,kind,-0.85+col*0.57,0,row,{variant:(row*3+col)%6,scaleX:0.72,scaleZ:0.85});
    }
    prop(s,'propPlant',0.55,0,4);return s;
  }
  function seats(table,xs,zs,kind='gameChair') {
    xs.forEach((dx,i)=>zs.forEach((dz,j)=>add(`${table.id}-seat${i}-${j}`,kind,table.x+dx,table.z+dz,dz<0?0:2,{level:table.level||0,color:['#bba578','#526c84','#9f6952','#74815d'][(i+j)%4]})));
  }
  const plant=(id,x,z,level=0,scale=1)=>add(id,'leafyPlant',x,z,0,{level,scaleX:scale,scaleY:scale,scaleZ:scale});
  const light=(id,x,z,y,level=0,extra={})=>add(id,'hangingLamp',x,z,0,{elevation:y,level,...extra});
  const composers = { dining: composeDiningPreset, boardgame: composeBoardgamePreset, climbing: composeClimbingPreset, band: composeBandPreset, study: composeStudyPreset, photo: composePhotoPreset };
  composers[template]({ items, add, up, prop, dress, cabinet, shelf, seats, plant, light, m, b });
  // Wash the tread below the nosing without putting a fixture in the stair's walk path.
  const stairs = layout.stairs;
  const left = stairs.maxX < 0;
  const edgeX = left ? stairs.maxX - 0.62 : stairs.minX + 0.62;
  const treadDepth = (stairs.maxZ - stairs.minZ) / stairs.steps;
  for (let step = 0; step < stairs.steps; step += 3) {
    add(`stair-cove-${step}`, 'lowEdgeLight', edgeX, stairs.maxZ - step * treadDepth + 0.018, 0, {
      elevation: step * stairs.height / stairs.steps,
      scaleX: 0.38, scaleY: 0.65, scaleZ: 0.74,
      color: template === 'study' || template === 'climbing' ? '#ffddae' : '#ffc78d'
    });
  }
  // Keep the shared boards at the approach and the turntable in the lounge.
  add('common-dashboard','clubDashboard',b.maxX-0.9,6.5,3);
  add('common-activity','activityBoard',b.minX+0.9,6.5,1);
  const music = PRESET_MUSIC_POSITIONS[template];
  add('music-console','musicConsole',music.x,music.z,music.rotation);
  add('entry-bench','bench',template==='dining'?-4.8:-6,7,0,{scaleX:1.3});plant('entry-green',b.minX+3.2,7.4,0,0.65);
  return items;
}
