export function composeClimbingPreset({ items, add, up, prop, dress, cabinet, seats, plant, light }) {
  // The tall L wall and continuous 38.5 cm landing pads occupy the left void.
  for (let i = 0; i < 5; i++) {
    add(`left-wall-${i}`, i % 3 === 1 ? 'climbingWallOverhang' : 'climbingWallWide', -10.5, 1.1 - i * 3.34, 1, {
      scaleY: 1.02, color: ['#e0d2b8', '#c3bdae', '#d9d4c8'][i % 3]
    });
  }
  for (let i = 0; i < 3; i++) add(`back-wall-${i}`, 'climbingWallNarrow', -9.8 + i * 3, -13.2, 0, { scaleY: 1.02 });
  for (let i = 0; i < 7; i++) add(`mat-left-${i}`, 'crashMat', -9.3, -12.9 + i * 2.3, 0, {
    scaleX: 1.15, scaleY: 1.1, color: i % 3 === 0 ? '#788d78' : '#7b8b9f'
  });
  for (let i = 0; i < 2; i++) add(`mat-back-${i}`, 'crashMatWide', -4.5, -13.4 + i * 1.8, 0, {
    scaleX: 1.1, scaleY: 1.1, color: i ? '#758e75' : '#8799ad'
  });

  // A furnished social pocket faces the climbing hall without narrowing the entry route.
  add('lounge-sofa', 'clubSofa', 5.2, -0.7, 0, { scaleX: 1.55, color: '#8c8984' });
  add('lounge-sofa-left', 'clubSofa', 1, -1.6, 1, { scaleX: 1.4, color: '#ad906c' });
  const table = add('lounge-table', 'coffeeTable', 5.2, 1.6, 0, { scaleX: 1.4, scaleZ: 1.2 });
  prop(table, 'propBooks', -0.6, 0); prop(table, 'propCup', 0.8, 0.2); prop(table, 'propPlant', 0, -0.1);
  add('lounge-rug', 'loungeRug', 4.9, -0.2, 0, { scaleX: 0.9, scaleZ: 0.7, color: '#b9ad98' });
  cabinet('lounge-storage', 5, -3.4, 0, 0, 'longCredenza', { scaleX: 1.3, color: '#a28a66' });
  const hydration = add('hydration-table', 'table', -3.2, -1.3, 0, { scaleX: 1.25 });
  dress(hydration, 'dining');
  add('hydration-seat1', 'gameChair', -3.2, 0.3, 2);
  add('hydration-seat2', 'gameChair', -3.2, -2.9);
  plant('mat-tree', -5.5, 2.5); plant('entry-tree', 8.4, 2.5, 0, 1.1);

  // An actual preparation room under the shorter deck, with a 2.4 m open doorway at its right.
  add('changing-front-partition', 'loftPartition', 4.2, -7.9, 0, { scaleY: 0.63, color: '#aaa896' });
  add('changing-side-partition', 'loftPartition', 2.1, -10.9, 1, { scaleX: 1.4, scaleY: 0.63, color: '#aaa896' });
  for (const [i, kind] of ['climbingShoeShelf', 'climbingHelmetShelf', 'climbingGearShelf', 'climbingShoeShelf', 'climbingGearShelf'].entries()) {
    add(`equipment-${i}`, kind, 3.3 + i * 1.9, -13.65, 0, { color: '#a58a63' });
  }
  add('ropes', 'ropeRack', 7.1, -13.1, 0, { elevation: 0.2 });
  add('climb-board', 'climbingBoard', 6.6, -14.28, 0, { scaleX: 1.1, scaleY: 0.9 });
  const rentalDesk = add('equipment-rental-desk', 'worktop', 4.9, -10.8, 0, { scaleX: 0.9, color: '#a6906d' });
  prop(rentalDesk, 'propLaptop', -1.35, 0, 0, { variant: 3 });
  prop(rentalDesk, 'propBooks', -0.35, 0, 0, { variant: 1 });
  prop(rentalDesk, 'propCanisters', 0.65, 0, 0, { variant: 4 });
  prop(rentalDesk, 'propBottle', 1.55, 0, 0, { variant: 3 });
  add('equipment-rental-chair', 'gameChair', 4.9, -12.1, 0, { color: '#6a7879' });
  add('equipment-bench', 'bench', 4.9, -9.1, 0, { scaleX: 1.7, color: '#a28b6a' });
  add('changing-cubby', 'climbingHelmetShelf', 11.1, -9.7, 3, { scaleX: 0.9, scaleY: 0.65, color: '#9b8566' });
  plant('equipment-green', 8.4, -9.8, 0, 0.65);
  add('rental-aisle-track', 'trackLight', 6, -11.5, 0, { elevation: 3.4, scaleX: 1.3, color: '#525758' });
  light('equipment-pendant', 5, -9.1, 2.8, 0, { scaleY: 0.65 });

  // Warm-up stays outside the landing pads, between the climbing and preparation zones.
  add('warmup-stretch-mat', 'crashMat', -3.8, -6.5, 0, { scaleX: 0.7, scaleZ: 1.3, scaleY: 0.25, color: '#7a8b82' });
  add('warmup-balance-mat', 'crashMat', -0.6, -10.8, 1, { scaleX: 0.5, scaleZ: 0.7, scaleY: 0.25, color: '#8996a5' });
  add('warmup-bench', 'bench', -5.7, -9, 1, { scaleX: 1.4, color: '#a18d70' });
  light('warmup-light', -3.4, -7, 4.5, 0, { color: '#656e70' });

  // Compact upper cafe and spectator seats sit behind a continuous front circulation strip.
  for (const [i, x] of [4.2, 8.7].entries()) {
    const t = up(`loft-table-${i}`, 'table', x, -12, 0, { scaleX: 1.5 });
    dress(t, 'dining'); seats(t, [-0.7, 0.7], [-1.3, 1.3]);
    light(`loft-light-${i}`, x, -12, 4.3, 1);
  }
  up('loft-sofa', 'clubSofa', 6, -9, 2, { scaleX: 1.5, color: '#a59276' });
  up('loft-reading-chair', 'beanbag', 10.8, -9.2, 3, { color: '#8e9b90' });
  up('loft-watching-chair', 'beanbag', 2.5, -9.2, 1, { color: '#9f8f77' });
  up('higher-sign', 'climbingSign', 6.4, -14.28, 0, { elevation: 1.3, scaleX: 1.4 });
  for (const [i, x] of [4.2, 8.7].entries()) {
    const ledge = up(`loft-gear-ledge-${i}`, 'wallShelf', x, -14, 0, { elevation: 1.8, scaleX: 1.3 });
    prop(ledge, 'propBottle', -0.8, 0); prop(ledge, 'propBooks', 0, 0); prop(ledge, 'propPlant', 0.8, 0);
  }
  for (const [i, x] of [2.5, 5.2, 8].entries()) up(`loft-edge-planter-${i}`, 'vinePlanter', x, -7.35, 0, { scaleY: 0.45, color: '#b39872' });
  up('loft-window-vine', 'vinePlanter', 11.05, -14.05, 0, { elevation: 1.3, scaleY: 1.1, color: '#b39872' });

  for (const [i, x] of [-9, 0.2, 9].entries()) add(`climb-longitudinal-beam-${i}`, 'ceilingBeam', x, -4.8, 1, { elevation: 11.9, scaleX: 2.9, color: '#555b5c', variant: 0 });
  for (const [i, z] of [-9.5, -2].entries()) add(`climb-wall-wash-${i}`, 'trackLight', -6.1, z, 1, { elevation: 11.3, scaleX: 1.5, color: '#555b5c' });
  for (const [i, z] of [-11.5, -4].entries()) add(`climb-cross-beam-${i}`, 'ceilingBeam', 0, z, 0, { elevation: 11.9, scaleX: 3, color: '#555b5c', variant: 0 });
  light('climb-high-light', -5.8, -6, 10.5);
  light('climb-lounge-light', 5.2, 0.5, 4.5);

  add('beta-wall-upper-photo', 'wallPrint', 0.85, -14.3, 0, { elevation: 6.8, scaleX: 1.6, scaleY: 1.5, variant: 1, color: '#9d8058' });
  add('beta-wall-lower-photo', 'wallPrint', 0.85, -14.3, 0, { elevation: 4.3, scaleX: 1.6, scaleY: 1.3, variant: 3, color: '#9d8058' });
  // Route journals, refill bottles and member photos cluster around the social seats.
  prop(table, 'propBottle', -1.05, 0.2, 0, { color: '#718778' });
  prop(table, 'propCup', 0.6, -0.35, 0, { color: '#bb754f' });
  const storage = items.find((item) => item.id === 'lounge-storage');
  prop(storage, 'propCup', -1.2, 0, 0, { variant: 2 });
  prop(storage, 'propBottle', 0.75, 0, 0, { variant: 4 });
  prop(storage, 'propPlant', 2, 0, 0, { scaleX: 0.8, scaleY: 1.3, scaleZ: 0.8 });
  for (const [i, x] of [3.1, 5.15].entries()) {
    add(`rental-route-photo-${i}`, 'wallPrint', x, -7.73, 0, {
      elevation: 0.8, scaleX: 0.85, scaleY: 0.9, variant: i + 1, color: '#9d8058'
    });
    const ledge = add(`rental-route-ledge-${i}`, 'wallShelf', x, -7.42, 0, {
      elevation: 2.25, scaleX: 0.75, color: '#a08964'
    });
    prop(ledge, 'propPlant', -0.7, 0, 0, { scaleX: 0.65, scaleY: 1, scaleZ: 0.65 });
    prop(ledge, 'propBottle', 0, 0);
    prop(ledge, 'propBooks', 0.7, 0, 0, { scaleX: 0.65, scaleZ: 0.7 });
  }
  for (const i of [0, 1]) {
    const ledge = items.find((item) => item.id === `loft-gear-ledge-${i}`);
    prop(ledge, 'propFrame', -0.4, 0, 0, { scaleX: 0.7, scaleY: 0.8 });
    prop(ledge, 'propBottle', 0.4, 0, 0, { color: '#bb754f' });
    const t = items.find((item) => item.id === `loft-table-${i}`);
    prop(t, 'propBooks', -0.3, -0.55, 0, { scaleX: 0.7, scaleZ: 0.7 });
    prop(t, 'propCup', 0.25, 0.55, 0, { color: '#718778' });
  }
  up('loft-corner-foliage', 'leafyPlant', 2.45, -13.4, 0, { scaleX: 0.75, scaleY: 1.05, scaleZ: 0.75 });
  up('loft-rear-vine', 'vinePlanter', 2.6, -14.08, 0, { elevation: 2.4, scaleX: 0.75, scaleY: 0.9 });
  plant('lounge-leafy-companion', 2.95, 2.7, 0, 0.68);
  plant('mat-leafy-companion', -8.4, 2.9, 0, 0.78);
}
