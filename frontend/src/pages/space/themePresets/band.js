export function composeBandPreset({ add, up, prop, cabinet, shelf, plant, light, m }) {
  // Estimated from the reference: the stage fills the rear-left bay, beside a clear aisle.
  const stage = add('stage', 'rehearsalStage', -4.4, -11.35, 0, { scaleX: 1.77, scaleZ: 1.25, color: '#87553d' });
  for (const [index, offset] of [-2.52, 2.52].entries()) {
    add(`stage-cove-${index}`, 'lowEdgeLight', stage.x + offset, stage.z + 2 * stage.scaleZ + 0.012, 0, {
      scaleX: 2.1, scaleY: 0.8, color: '#ffbb80'
    });
  }
  add('drums', 'drumKit', -4.7, -12.1, 0, { scaleX: 1.1, scaleY: 1.1, scaleZ: 1.1, color: '#9b5c3d' });
  add('keys', 'rehearsalKeyboard', -0.3, -10.6, 0, { scaleX: 1.15, scaleY: 1.05, scaleZ: 1.1 });
  add('guitars', 'guitarRack', -8.2, -12.9, 0, { scaleX: 1.05, scaleY: 1.05, scaleZ: 1.05 });
  add('amp-left', 'amplifier', -8.4, -10.3, 0, { scaleX: 1.1, scaleY: 1.1, scaleZ: 1.1 });
  add('amp-right', 'amplifier', -0.4, -13.2, 0, { scaleX: 1.1, scaleY: 1.1, scaleZ: 1.1 });
  add('vocal', 'microphoneStand', -3.8, -9.5, 0, { scaleX: 1.2, scaleY: 1.05, scaleZ: 1.2 });
  add('vocal-harmony', 'microphoneStand', -6.2, -9.5);
  add('pedals', 'propPedals', -1.6, -9.4, 0, { scaleX: 1.2, scaleZ: 1.2 });
  add('keyboard-seat', 'stool', -0.3, -11.8);
  add('stage-light-left', 'stageLight', -10.2, -11.4, 1, { color: '#ce9a68' });
  add('stage-light-right', 'stageLight', 1.5, -11.6, 3, { color: '#af78bd' });
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 6; col++) {
      add(`studio-panel-${row}-${col}`, 'acousticTile', -9.6 + col * 2.1, -14.68, 0, {
        elevation: 0.25 + row * 1.78, scaleX: 1.25, scaleY: 0.75, variant: (col + row) % 3,
        color: col % 3 === 2 ? '#795640' : row ? '#39353b' : '#292b32'
      });
    }
  }
  for (const [i, z] of [-12.8, -9.5, -6.2].entries()) {
    add(`live-room-side-absorber-${i}`, 'acousticTile', -10.7, z, 1, {
      elevation: 0.4, scaleX: 1.65, scaleY: 1.5, variant: i % 3, color: '#343139'
    });
  }
  add('drum-gobo', 'acousticPanel', -6.6, -14.2, 0, { scaleX: 1.8, scaleY: 1.15, color: '#39313e' });
  add('vocal-gobo', 'acousticPanel', 0.3, -14.2, 0, { scaleX: 1.65, color: '#484049' });
  add('spare-guitar-rack', 'guitarRack', -9.6, -14.35, 0, { scaleX: 1.1 });
  add('live-room-spare-amp', 'amplifier', -8.1, -7.9);
  add('vocal-practice-mic', 'microphoneStand', 1.3, -13.1);
  add('vocal-practice-stool', 'stool', 1.95, -13.9);
  add('play-sign', 'bandNeon', -5, -14.65, 0, { elevation: 0.55, scaleX: 1.25, scaleY: 0.75, color: '#b98cde' });
  // Estimated 5.4 x 4.55m control room: side glazing faces the stage, with a 1.7m front doorway.
  add('control-observation-wall', 'loftGlassPartition', 2.8, -12.225, 1, {
    scaleX: 1.055, scaleY: 0.88, scaleZ: 1.5, variant: 1, color: '#34343b'
  });
  add('control-back-wall', 'loftPartition', 5.5, -14.5, 0, {
    scaleX: 1.35, scaleY: 0.88, scaleZ: 1.5, variant: 2, color: '#5c453a'
  });
  add('control-stair-side-wall', 'loftPartition', 8.2, -12.225, 1, {
    scaleX: 1.055, scaleY: 0.88, scaleZ: 1.5, variant: 1, color: '#34343b'
  });
  add('control-front-wall', 'loftPartition', 6.35, -9.95, 0, {
    scaleX: 0.925, scaleY: 0.88, scaleZ: 1.5, variant: 2, color: '#594238'
  });
  add('control-door-lintel', 'ceilingBeam', 3.65, -9.95, 0, {
    scaleX: 0.285, elevation: 3.55, color: '#39343b'
  });
  const controlStorage = cabinet('control-equipment-storage', 5.5, -13.8, 0, 0, 'longCredenza', {
    scaleX: 0.9, color: '#4b3b37'
  });
  prop(controlStorage, 'propPedals', 0.9, 0, 0, { scaleX: 0.65, scaleZ: 0.65 });
  add('control-monitor-amp', 'amplifier', 7.4, -12.9, 0, { scaleX: 0.85, scaleY: 0.85 });
  const controlRack = add('control-record-shelf', 'openDisplayShelf', 7, -9, 0, {
    scaleX: 0.8, scaleY: 0.9, color: '#4a3d3a'
  });
  for (let row = 0; row < 4; row++) {
    prop(controlRack, 'propBookRow', -0.58, 0, row, { variant: row, scaleX: 0.8 });
    prop(controlRack, 'propPedals', 0.45, 0, row, { variant: row, scaleX: 0.7, scaleZ: 0.75 });
  }
  const record = add('right-recording', 'mixingDesk', 5.4, -12.1, 1, { scaleX: 0.9, scaleZ: 1.4 });
  add('recording-seat', 'gameChair', 6.8, -12.1, 3, { color: '#5e4262' });
  prop(record, 'propBooks', 0.8, 0.25);
  prop(record, 'propCup', -1, 0.25);
  add('recording-panel', 'acousticTile', 10.8, -7.5, 3, { elevation: 1.2, scaleX: 2, color: '#342d37' });
  for (let i = 0; i < 4; i++) {
    add(`upper-acoustic-${i}`, 'acousticTile', 10.8, -13.3 + i * 3.6, 3, {
      elevation: m.height + 1, color: '#343237'
    });
  }
  // The upper wall remains visible from the overview, so treatment continues above the stage.
  for (let col = 0; col < 12; col++) {
    up(`loft-foam-wall-${col}`, 'acousticTile', -9.7 + col * 1.75, -14.82, 0, {
      elevation: 0.2, scaleX: 1.02, scaleY: 1.65, scaleZ: 1.6,
      variant: col % 4 === 3 ? 2 : 0,
      color: col % 4 === 3 ? '#79644f' : '#50505b'
    });
  }
  for (const [i, z] of [-7.3, -4.1, -0.9, 2.3].entries()) {
    add(`lounge-wall-absorber-${i}`, 'acousticTile', 10.78, z, 3, {
      elevation: 0.25, scaleX: 1.8, scaleY: 1.45, scaleZ: 1.5,
      variant: i % 2 === 0 ? 0 : 1, color: '#494551'
    });
    add(`lounge-wall-foam-upper-${i}`, 'acousticTile', 10.8, z, 3, {
      elevation: 3.6, scaleX: 1.8, scaleY: 1.65, scaleZ: 1.4,
      variant: 0, color: '#514956'
    });
  }
  add('play-right', 'bandNeon', 10.6, -4.9, 3, { elevation: 4.4, scaleX: 1.2, scaleY: 0.75, color: '#e577bb' });
  add('main-sofa', 'clubSofa', -3.8, -5.1, 0, { scaleX: 1.45, color: '#3e4052' });
  add('side-sofa', 'clubSofa', 0.9, -3, 3, { scaleX: 1.1, color: '#5e514a' });
  add('band-lounge-rug', 'loungeRug', -3.7, -3.8, 0, { scaleX: 1.1, scaleZ: 0.85, color: '#5e4b48' });
  const coffee = add('band-coffee', 'coffeeTable', -3.7, -2.9, 0, { scaleX: 1.6, scaleZ: 1.3 });
  prop(coffee, 'propBooks', -0.7, 0);
  prop(coffee, 'propCup', 0.7, 0.1);
  prop(coffee, 'propBottle', 0.2, -0.25);
  prop(coffee, 'propCup', -0.15, 0.3);
  prop(coffee, 'propPedals', 0.05, -0.05, 0, { scaleX: 0.55, scaleZ: 0.5 });
  prop(coffee, 'propPlant', 0.9, -0.25, 0, { scaleX: 0.65, scaleY: 0.65, scaleZ: 0.65 });
  const mix = add('foreground-mixer', 'mixingDesk', -4.9, 1.7, 0, { scaleX: 1.4, scaleZ: 1.3 });
  prop(mix, 'propPedals', 0.65, 0.1, 0, { scaleX: 0.65, scaleZ: 0.65 });
  prop(mix, 'propCup', -0.95, 0.2);
  prop(mix, 'propBooks', -0.85, -0.22, 0, { scaleX: 0.75, scaleZ: 0.75 });
  prop(mix, 'propBottle', 1.02, -0.3);
  add('mix-seat', 'gameChair', -4.9, 3, 2, { color: '#503f48' });
  const console = cabinet('record-console', 4.5, 1.8, 0, 0, 'longCredenza', { scaleX: 1.1, color: '#81583a' });
  prop(console, 'propBookRow', 0.9, 0, 0, { scaleX: 0.8 });
  prop(console, 'propCup', -1.2, 0.2);
  prop(console, 'propPedals', -1.2, -0.2, 0, { scaleX: 0.65, scaleZ: 0.65 });
  prop(console, 'propFrame', 2.05, 0, 0, { variant: 2 });
  cabinet('left-console', -10, -3.4, 1, 0, 'longCredenza', { scaleX: 1.1, color: '#755135' });
  // Independent frames form a concert-poster cluster on the tall side wall.
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      add(`band-poster-${row}-${col}`, 'wallPrint', 10.65, -12.8 + col * 3.4, 3, {
        elevation: 4.5 + row * 1.8, variant: (col + row) % 2 ? 2 : 5,
        scaleX: col % 2 ? 1.75 : 1.45, scaleY: 1.05,
        color: ['#a47c59', '#7a5969', '#596977', '#b39871'][col]
      });
    }
  }
  for (const [i, x] of [-7.4, 5.3].entries()) {
    const table = up(`upper-band-work-${i}`, 'worktop', x, -13.4, 0, { scaleX: 0.85, color: '#785439' });
    prop(table, 'propLaptop', -1.1, 0);
    prop(table, 'propBooks', 0, 0);
    prop(table, 'propLamp', 1.3, 0);
    prop(table, 'propCup', 0.7, 0.2);
    prop(table, 'propPedals', 0.65, -0.25, 0, { scaleX: 0.5, scaleZ: 0.5 });
    prop(table, 'propPlant', -1.7, -0.25, 0, { scaleX: 0.6, scaleY: 0.6, scaleZ: 0.6 });
    up(`upper-chair-${i}`, 'gameChair', x, -12, 2, { color: '#50414b' });
    light(`band-loft-light-${i}`, x, -13.4, 2.9, 1);
    const ledge = up(`upper-record-ledge-${i}`, 'wallShelf', x, -14.4, 0, { elevation: 2.3, scaleX: 1.65, color: '#654836' });
    for (let j = 0; j < 5; j++) {
      prop(ledge, j === 4 ? 'propFrame' : 'propBookRow', -0.95 + j * 0.47, 0, 0, {
        scaleX: 0.8, scaleY: j % 2 ? 0.85 : 1, variant: (i + j) % 6
      });
    }
  }
  up('band-listening-sofa', 'clubSofa', -1.3, -13.9, 0, { scaleX: 1.1, color: '#5c536a' });
  const listen = up('band-listening-table', 'coffeeTable', -1.3, -11.8, 0, { scaleX: 1.3 });
  prop(listen, 'propBooks', -0.6, 0);
  prop(listen, 'propCup', 0.6, 0);
  prop(listen, 'propBottle', 0, 0.25);
  prop(listen, 'propCup', 0.1, -0.3);
  prop(listen, 'propFrame', -0.95, -0.22, 0, { scaleX: 0.7, scaleY: 0.7 });
  up('upper-listening-chair', 'roundChair', 1.6, -11.8, 3, { color: '#997b62' });
  up('loft-record-plant', 'vinePlanter', -4.1, -14.4, 0, { elevation: 0.8, scaleX: 0.75, scaleY: 0.75 });
  up('upper-left-poster', 'wallPrint', -10, -14.7, 0, { elevation: 1.5, scaleX: 1.4, scaleY: 1.4, variant: 2 });
  shelf('record-library', 7.6, -3.3, 3, 0, 'band', { scaleY: 1.05 });
  plant('upper-band-plant', 9, -13.9, 1, 0.9);
  plant('band-green1', -10, -7.2);
  plant('band-green2', 0.8, 2.8);
  for (const [i, x] of [-8.5, -3.2, 2.8, 7.7].entries()) {
    up(`loft-hanging-green-${i}`, 'vinePlanter', x, -14.35, 0, {
      elevation: 1.3, scaleX: 0.7, scaleY: 0.8, scaleZ: 0.7
    });
  }
  const loungeLedge = add('lounge-record-ledge', 'wallShelf', -10.55, -2.5, 1, {
    elevation: 2, scaleX: 2.1, color: '#6a503f'
  });
  for (let i = 0; i < 6; i++) {
    prop(loungeLedge, i === 5 ? 'propPlant' : 'propBookRow', -1 + i * 0.4, 0, 0, {
      scaleX: 0.7, scaleY: i % 2 ? 0.8 : 1, scaleZ: 0.75, variant: i
    });
  }
  light('band-lounge-light', -3.7, -2.9, 3.7);
  light('mixing-light', -4.9, 1.7, 3.2);
  light('recording-light', 5.5, -12.1, 2.35);
  for (const [i, x] of [-8, -4.6, -1.2].entries()) {
    add(`live-room-acoustic-baffle-${i}`, 'acousticCloud', x, -11.6, 0, {
      elevation: 3.35, scaleX: 1.05, scaleZ: 1.4, color: i === 1 ? '#756779' : '#655e70'
    });
  }
  for (const [i, x] of [-7.7, -1.6, 5.1].entries()) {
    up(`loft-acoustic-cloud-${i}`, 'acousticCloud', x, -13.3, 0, {
      elevation: 4.05, scaleX: 1.3, scaleZ: 1.25, color: i === 1 ? '#756779' : '#655e70'
    });
  }
  for (const [i, x] of [-7.5, -2.1].entries()) {
    add(`live-room-ceiling-track-${i}`, 'trackLight', x, -10.2, 0, { elevation: 3.5, scaleX: 0.95 });
  }
  for (const [i, z] of [-0.9, 2.3].entries()) {
    add(`lounge-absorber-wall-light-${i}`, 'pictureLight', 10.56, z, 3, { elevation: 7.25 });
  }
  for (const [i, z] of [-6.7, 0.5].entries()) {
    add(`hall-cross-beam-${i}`, 'ceilingBeam', -1, z, 0, { elevation: 8.1, scaleX: 3, scaleY: 0.65, color: '#39323c' });
  }
  add('lounge-ceiling-track', 'trackLight', -4, -3, 0, { elevation: 6.1, scaleX: 1.6 });
  add('control-ceiling-track', 'trackLight', 5.5, -12.1, 0, { elevation: 3.5, scaleX: 0.8 });
  for (const [i, x] of [-7.4, -1.3, 5.3].entries()) {
    up(`loft-record-wall-light-${i}`, 'pictureLight', x, -14.5, 0, { elevation: 3.7 });
  }
}
