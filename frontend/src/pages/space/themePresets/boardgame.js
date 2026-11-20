export function composeBoardgamePreset({ items, add, up, prop, dress, cabinet, shelf, seats, plant, light }) {
    for(let i=0;i<7;i++) {
      const library=shelf(`library-${i}`,-7.65+i*2.7,-9.8,0,0,'boardgame',{scaleY:1,color:i%3===1?'#5b4b40':'#97704a'});
      // Upright boxes occupy the shelf height; each box remains independently editable.
      items.filter(item=>item.parentId===library.id&&item.kind==='propGameBox').forEach((box,index)=>{
        box.scaleX=0.83;
        box.scaleY=1.05;
        box.variant=[1,3,5][(index+i)%3];
      });
      prop(library,'propGameBox',-0.65,0,4,{variant:i%2?1:3,scaleX:0.9,scaleY:0.75});
    }
    const a=add('main-game-table','gameTable',-4.6,-1.5,1,{scaleX:1.45,scaleZ:1.1});dress(a);
    prop(a,'propGameBox',-1.35,0.55,0,{variant:2,scaleX:0.85,scaleZ:0.85});
    prop(a,'propCup',0.45,0.9);prop(a,'propCup',-0.45,-0.9);
    for(const [i,z] of[-4,-1.5,1].entries())for(const [j,x]of[-6.95,-2.25].entries())add(`game-chair-${i}-${j}`,i===1?'beanbag':'roundChair',x,z,j?3:1,{color:['#375876','#b59a65','#728653','#ac654b','#365c7d','#9e493a'][i*2+j]});
    const booth=add('booth-table','gameTable',5.0,-3.2,0,{scaleX:1.25});dress(booth);
    prop(booth,'propGameBox',-1.35,0.55,0,{variant:4,scaleX:0.85,scaleZ:0.85});
    prop(booth,'propCup',0.45,0.9);prop(booth,'propCup',-0.45,-0.9);
    add('booth-back','clubSofa',5,-6.2,0,{scaleX:1.7,color:'#514f50'});
    add('booth-front','clubSofa',5,0.1,2,{scaleX:1.7,color:'#514f50'});
    add('booth-side','clubSofa',8.8,-3.2,3,{scaleX:1.55,color:'#514f50'});
    add('booth-rug','loungeRug',5.0,-3.2,0,{scaleX:0.9,scaleZ:0.9,color:'#706258'});
    // Estimated timber game room: shallow walls and a light canopy leave a 1.9m side doorway.
    add('game-room-back','loftPartition',5.5,-7.4,0,{scaleX:2.1,scaleY:0.55,color:'#a47b50',finish:'oak'});
    add('game-room-front','loftPartition',5.5,1.3,0,{scaleX:2.1,scaleY:0.42,color:'#9a714a',finish:'oak'});
    add('game-room-entry-back','loftPartition',1.2,-5.95,1,{scaleX:0.8,scaleY:0.55,color:'#a47b50',finish:'oak'});
    add('game-room-entry-front','loftPartition',1.2,-0.65,1,{scaleX:0.9,scaleY:0.42,color:'#9a714a',finish:'oak'});
    for(const[i,z]of[-7.4,1.3].entries())add(`booth-canopy-long-${i}`,'ceilingBeam',5.5,z,0,{variant:2,elevation:3.9,scaleX:1.43,scaleY:0.8,color:'#805b39'});
    for(const[i,x]of[1.2,9.8].entries())add(`booth-canopy-side-${i}`,'ceilingBeam',x,-3.05,1,{variant:2,elevation:3.9,scaleX:1.45,scaleY:0.8,color:'#805b39'});
    for(const[i,z]of[-6,-3.5,-1].entries())add(`booth-canopy-slat-${i}`,'ceilingBeam',5.5,z,0,{variant:2,elevation:4.05,scaleX:1.43,scaleY:0.5,scaleZ:0.65,color:'#a57b4c'});
    for(const[i,x]of[2.7,5.7,8.7].entries())add(`game-room-picture-${i}`,'wallPrint',x,-7.2,0,{elevation:0.65,scaleX:0.9,scaleY:0.9,variant:i});
    add('game-room-hanging-green','vinePlanter',8.8,1.1,2,{scaleY:0.6,color:'#b19164'});

    const lending=add('library-lending-desk','longCredenza',-4.8,-7.25,0,{scaleX:1.1,color:'#96704b',finish:'oak'});
    prop(lending,'propLaptop',-1.2,0);prop(lending,'propGameBox',0,0,0,{variant:1});
    prop(lending,'propBooks',1.1,0);prop(lending,'propCup',1.9,0);
    add('library-lending-seat','stool',-4.8,-8.65,0,{color:'#665542'});
    const returns=add('library-return-shelf','openDisplayShelf',-8.1,-7.2,1,{scaleY:0.65,color:'#87613f'});
    for(const row of[0,2])for(const[i,x]of[-0.72,0,0.72].entries())prop(returns,'propGameBox',x,0,row,{variant:(i+row)%2?1:2,scaleX:0.85,scaleY:0.9,scaleZ:0.85});
    prop(returns,'propFrame',-0.5,0,4);prop(returns,'propPlant',0.5,0,4,{scaleY:0.7});
    light('lending-pendant',-4.8,-7.25,3.25);
    add('library-lending-rail','trackLight',-4.8,-9.3,0,{elevation:3.5,scaleX:1.3});

    const gameSide=add('booth-side-table','cafeTable',8.9,-6.75,0,{scaleX:0.8,scaleZ:0.8,color:'#aa8256'});
    prop(gameSide,'propGameBox',0,0,0,{variant:2,scaleX:0.75,scaleZ:0.75});
    const loungeSide=up('upper-sofa-side-table','cafeTable',-9.8,-12.1,0,{scaleX:0.8,scaleZ:0.8});
    prop(loungeSide,'propLamp',0,0,0,{color:'#b8a06e'});
    for(const[i,z]of[-3.8,0.8].entries())add(`main-table-timber-${i}`,'ceilingBeam',-4.6,z,0,{variant:2,elevation:5.15,scaleX:0.85,color:'#94704a'});
    for(const[i,x]of[-7.15,-2.05].entries())add(`main-table-timber-side-${i}`,'ceilingBeam',x,-1.5,1,{variant:2,elevation:5.15,scaleX:0.8,color:'#94704a'});
    for(const[i,x]of[-6.7,-0.7,5.8].entries())up(`upper-seating-timber-${i}`,'ceilingBeam',x,-12.4,0,{variant:2,elevation:4.6,scaleX:i===1?0.7:0.95,color:'#8a6642'});
    cabinet('front-game-counter',5.5,2.85,0,0,'longCredenza',{scaleX:1.5});
    for (const z of [-7,-3,1]) add(`booth-wall-light-${z}`,'pictureLight',10.7,z,3,{elevation:5.5});
    add('game-neon','gameNeon',10.8,-4.6,3,{elevation:0.2,scaleX:1.4,scaleY:1.1});
    add('game-board','gameWallBoard',10.8,-4.3,3,{scaleX:1.5,elevation:0.25});
    up('upper-violet-sofa','clubSofa',-6.7,-13.95,0,{scaleX:1.4,color:'#846485'});
    up('upper-violet-chair','roundChair',-3.9,-11.6,3,{color:'#a57c93'});
    const upperCoffee=up('upper-lounge-table','coffeeTable',-6.7,-11.75,0,{scaleX:1.35});prop(upperCoffee,'propGameBox',-0.6,0);prop(upperCoffee,'propCup',0.8,0.2);prop(upperCoffee,'propPlant',0,0);
    const upperRound=up('upper-round-table','cafeTable',-0.7,-12.35,0,{scaleX:1.35,scaleZ:1.35});prop(upperRound,'propGameBox',0,0);prop(upperRound,'propCup',0.45,0);
    for(const[i,x]of[-2.3,0.9].entries())up(`upper-blue-chair-${i}`,'roundChair',x,-12.35,i?3:1,{color:'#43647a'});
    const upperGame=up('loft-game-2','gameTable',5.8,-12.45,0,{scaleX:1.25});dress(upperGame);seats(upperGame,[-1.8,0,1.8],[-1.85,1.85]);
    for(const[i,x]of[-6.7,-0.7,5.8].entries())light(`loft-pendant-${i}`,x,-12.4,3.2,1);
    for(let i=0;i<6;i++)up(`upper-print-${i}`,'wallPrint',-8+i*3.2,-14.8,0,{elevation:2.5,variant:i,scaleX:i%2?1.3:0.9,scaleY:i%2?0.9:1.15});
    for(const[i,x]of[-7,-2,3,8].entries())up(`loft-rail-vine-${i}`,'vinePlanter',x,-9.35,0,{scaleY:0.45,color:'#ac875c'});
    for(const[i,x]of[-9.9,2].entries())up(`upper-wall-vine-${i}`,'vinePlanter',x,-14.5,0,{elevation:1.4,scaleY:0.75});
    plant('upper-left-green',-9.8,-13.8,1,0.8);
    plant('front-right-green',9.9,2.6,0,0.85);
    add('front-library-vine','vinePlanter',5.5,3.25,2,{scaleY:0.42,color:'#a98358'});
    const side=up('upper-round-side-table','cafeTable',2.4,-13.95,0,{scaleX:0.7,scaleZ:0.7});
    prop(side,'propPlant',0,0,0,{scaleX:0.7,scaleY:0.85,scaleZ:0.7});
    for(const[i,x]of[-6.8,-1.1,5.1].entries())up(`upper-wall-sconce-${i}`,'pictureLight',x,-14.65,0,{elevation:4.5});
    light('game-light1',-4.6,-3.6,3.6);light('game-light2',-4.6,-0.3,4.2);light('booth-light',5.0,-3.2,3.8);
    plant('booth-tree',10,-6.7,0,0.85);plant('stairs-tree',-7.8,2.5);plant('upper-tree',9.8,-13.8,1);

    // A continuous display ledge and grouped snapshots fill the lounge walls.
    for (const [i, x] of [-6.7, -0.7, 5.8].entries()) {
      const ledge = up(`game-memory-ledge-${i}`, 'wallShelf', x, -14.5, 0, {
        elevation: 1.65, scaleX: 1.75, color: '#85633f'
      });
      for (const [j, dx] of [-0.9, -0.25, 0.4, 0.95].entries())
        prop(ledge, j === 3 ? 'propPlant' : j === 1 ? 'propFrame' : 'propGameBox', dx, 0, 0, {
          variant: i + j, scaleX: 0.85, scaleZ: 0.85
        });
    }
    for (const [i, z] of [-1.9, 0, 1.9].entries()) {
      for (const [j, height] of [2.25, 3.7].entries())
        add(`game-session-photo-${i}-${j}`, 'wallPrint', 10.78, z, 3, {
          elevation: height, scaleX: 0.8, scaleY: 0.8, variant: i * 2 + j
        });
    }
    for (const table of [a, booth, upperGame]) {
      prop(table, 'propBooks', 0, 0.9, 0, { scaleX: 0.7, scaleZ: 0.7 });
      prop(table, 'propCup', 1.35, 0.85);
    }
    for (const [i, x] of [-8.5, -4.8, 0, 5.1, 9.2].entries())
      up(`game-loft-leaf-curtain-${i}`, 'vinePlanter', x, -9.36, 0, {
        scaleX: 0.8, scaleY: 0.65, scaleZ: 0.8, color: '#8c7855'
      });
    plant('upper-reading-green', -3.2, -14.1, 1, 0.75);
}
