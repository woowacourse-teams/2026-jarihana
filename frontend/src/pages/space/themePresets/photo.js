export function composePhotoPreset({ items, add, up, prop, cabinet, shelf, plant, light }) {
  // Estimated 6.72 × 3.92m sweep; its front lane stays open for a photographer and lighting.
  add('shooting-backdrop', 'photoBackdrop', -4.6, -10.4, 0, {
    scaleX: 1.4, scaleZ: 1.4, scaleY: 1.15, color: '#e8e6de'
  });
  add('key-light', 'softbox', -7.5, -6.8, 1, { scaleX: 1.05, scaleZ: 1.05, scaleY: 1.2 });
  add('fill-light', 'softbox', -0.2, -7.1, 3, { scaleY: 1.15 });
  add('shoot-camera', 'photoTripod', -4.6, -5.4, 2, { scaleX: 1.1, scaleZ: 1.1, scaleY: 1.1 });
  add('reflector', 'photoReflector', -0.05, -10.6, 1);
  for (const [index, x] of [-6.6, -2.6].entries()) {
    add(`shooting-blackout-wall-${index}`, 'loftPartition', x, -13.25, 0, {
      scaleX: 0.95, scaleY: 0.85, color: '#43494c'
    });
  }
  add('shooting-side-glass', 'loftGlassPartition', 1.05, -10.95, 1, {
    scaleX: 1.1, scaleY: 0.85, color: '#525b5e'
  });
  // A daylight equipment-preparation room has a 1.6m front door and its own side walls.
  for (const [id, x] of [['left', 2.5], ['right', 8.1]]) {
    add(`preparation-${id}-wall`, 'loftPartition', x, -11.5, 1, {
      scaleX: 1.15, scaleY: 0.88, color: '#666a64'
    });
  }
  add('preparation-front-glass', 'loftGlassPartition', 6.1, -9.1, 0, {
    scaleX: 0.93, scaleY: 0.88, color: '#505b5a'
  });
  add('preparation-door-lintel', 'ceilingBeam', 3.3, -9.1, 0, {
    scaleX: 0.27, scaleY: 0.65, elevation: 3.6, color: '#505b5a'
  });
  const preparation = add('equipment-preparation', 'worktop', 5.3, -12.8, 0, {
    scaleX: 0.85, color: '#9d927c'
  });
  prop(preparation, 'propMonitor', -1.3, 0);
  prop(preparation, 'propCamera', -0.2, 0);
  prop(preparation, 'propCamera', 0.65, 0, 0, { variant: 3 });
  prop(preparation, 'propLamp', 1.65, 0);
  add('equipment-preparation-seat', 'gameChair', 5.3, -11.4, 2, { color: '#5a6264' });
  add('preparation-case', 'photoEquipmentCase', 7.1, -10.6, 0, { scaleX: 0.85 });
  light('preparation-light', 5.4, -11.6, 3.1);

  for (const [i, x] of [-7.1, -2.1].entries()) {
    up(`editing-display-wall-${i}`, 'loftPartition', x, -13.65, 0, { scaleY: 0.9, color: '#424746' });
    const desk = up(`edit-loft-${i}`, 'worktop', x, -12.1, 0, { scaleX: 0.85, color: '#9b8262' });
    prop(desk, 'propMonitor', -1, 0);
    prop(desk, 'propCamera', 0.35, 0);
    prop(desk, 'propBooks', 1.25, 0);
    prop(desk, 'propCup', -0.25, 0.28);
    up(`edit-seat-${i}`, 'gameChair', x, -10.7, 2);
    light(`photo-loft-light-${i}`, x, -12.1, 2.9, 1);
    for (let row = 0; row < 2; row++) {
      const ledge = up(`camera-display-${i}-${row}`, 'wallShelf', x, -13.3, 0, {
        elevation: 2 + row * 1.1, scaleX: 1.5, color: '#635746'
      });
      prop(ledge, 'propCamera', -0.8, 0);
      prop(ledge, row ? 'propBookRow' : 'propFrame', 0, 0, 0, { variant: i * 3 });
      prop(ledge, row ? 'propPlant' : 'propCamera', 0.8, 0);
    }
  }
  up('editing-critique-chair', 'roundChair', 0.1, -10.5, 3, { color: '#8c8d7c' });
  up('editing-critique-table', 'coffeeTable', -2.1, -9.7, 0, { scaleX: 0.8, scaleZ: 0.8 });
  add('studio-case1', 'photoEquipmentCase', -7, -2.3);
  add('studio-case2', 'photoEquipmentCase', -5.5, -2.3);
  add('studio-case3', 'photoEquipmentCase', -7.8, -4.4, 1, { color: '#4e5659' });
  shelf('camera-library', 9.8, -12.1, 3, 0, 'photo', { color: '#4f514b' });
  shelf('camera-library2', 5.1, -7.7, 0, 0, 'photo', { color: '#4f514b' });
  shelf('camera-library3', 7.8, -7.7, 0, 0, 'photo', { color: '#4f514b' });
  add('equipment-track', 'trackLight', 6.5, -7.7, 0, { elevation: 4.25, scaleX: 1.25 });

  add('gallery-sofa', 'clubSofa', 9.65, -2.9, 3, { scaleX: 1.9, color: '#777570' });
  add('gallery-sofa2', 'clubSofa', 5.8, -5.8, 0, { scaleX: 1.25, color: '#666764' });
  const coffee = add('gallery-coffee', 'coffeeTable', 6.5, -2.9, 1, { scaleX: 1.45, scaleZ: 1.25 });
  prop(coffee, 'propBooks', -0.6, 0);
  prop(coffee, 'propCamera', 0.35, -0.15);
  prop(coffee, 'propCup', 0.9, 0.2);
  prop(coffee, 'propFrame', -0.1, 0.25, 0, { variant: 1 });
  add('gallery-rug', 'loungeRug', 6.9, -3, 0, { scaleX: 0.8, scaleZ: 1, color: '#a29681' });
  add('capture-neon', 'photoNeon', 10.8, -10.5, 3, { scaleX: 1.35, scaleY: 1.05, elevation: 0.55 });
  const prints = [
    [-5.8, 2.6, 1.6, 1.05, 0], [-3.4, 2.45, 1.05, 1.5, 1],
    [-0.9, 2.65, 1.65, 1.05, 3], [1.6, 2.4, 1.05, 1.4, 4],
    [-5.7, 5.05, 1.1, 1.25, 4], [-3.2, 5.1, 1.7, 1.05, 0],
    [-0.5, 5.05, 1.15, 1.3, 1], [1.8, 4.95, 1.5, 1.05, 3]
  ];
  prints.forEach(([z, elevation, scaleX, scaleY, variant], index) => {
    add(`gallery-print-${index}`, 'wallPrint', 10.8, z, 3, { elevation, scaleX, scaleY, variant });
  });
  add('front-print-worktop', 'photoPrintBench', -5.9, 0.7, 0, { scaleX: 1.45, color: '#aa9172' });
  add('print-seat', 'gameChair', -5.1, 2.2, 2);
  const review = add('print-review-worktop', 'worktop', -0.6, 0.7, 0, {
    scaleX: 0.625, scaleZ: 1.2, color: '#c1ad8a'
  });
  prop(review, 'propCamera', -0.85, 0);
  prop(review, 'propMonitor', 0.55, -0.1);
  prop(review, 'propBooks', 1.9, 0);
  add('review-seat', 'gameChair', -0.6, 2.2, 2, { color: '#6c7571' });
  add('freestanding-print-gallery', 'galleryPartition', 1.65, -2.7, 1, {
    scaleX: 1.1, color: '#d1c8b8'
  });
  cabinet('gallery-console', 6.4, 2.5, 0, 0, 'longCredenza', { scaleX: 1.1 });
  for (const z of [-5.8, -1.8, 1.6]) {
    add(`gallery-light-${z}`, 'pictureLight', 10.6, z, 3, { elevation: 7.25 });
  }
  for (const [index, x] of [-7, -3.5, 0].entries()) {
    up(`editing-edge-vine-${index}`, 'vinePlanter', x, -8.35, 0, { scaleY: 0.45, color: '#7a6e56' });
  }
  add('gallery-high-vine', 'vinePlanter', 10.5, -8.8, 3, { elevation: 4.8, color: '#927a57' });
  plant('studio-tree', 9.8, -9.6, 0, 1.05);
  plant('gallery-tree', 9.9, 2.3, 0, 1.1);
  plant('print-tree', -7.7, 2.7, 0, 0.8);
  plant('upper-green', 0.5, -12.7, 1, 0.8);
  plant('gallery-entry-green', 1.4, 2.7, 0, 0.65);
  light('gallery-light', 6.6, -2.9, 4.3);
  light('print-light', -5.9, 0.7, 3.6);
  light('review-light', -0.6, 0.7, 3.5);

  for (const [index, z] of [-12.5, -8.6].entries()) {
    add(`shooting-grid-crossbar-${index}`, 'ceilingBeam', -4.6, z, 0, {
      elevation: 3.8, scaleX: 1.25, scaleY: 0.6, color: '#343a3d'
    });
  }
  for (const [index, x] of [-8.1, -1.1].entries()) {
    add(`shooting-grid-side-${index}`, 'ceilingBeam', x, -10.55, 1, {
      elevation: 3.8, scaleX: 0.68, scaleY: 0.6, color: '#343a3d'
    });
  }
  for (const [index, z] of [-11.8, -9.1].entries()) {
    add(`shooting-grid-track-${index}`, 'trackLight', -4.6, z, 0, {
      elevation: 3.6, scaleX: 1.5, color: '#343a3d'
    });
  }
  for (const [index, z] of [-12.8, -9.6].entries()) {
    up(`editing-roof-beam-${index}`, 'ceilingBeam', -4.8, z, 0, {
      elevation: 4.45, scaleX: 1.9, scaleY: 0.65, color: '#514b44'
    });
  }
  add('gallery-ceiling-track', 'trackLight', 7.5, -2, 1, {
    elevation: 8.3, scaleX: 2, color: '#343a3d'
  });

  const printBench = items.find(item => item.id === 'front-print-worktop');
  for (const [i, dx] of [-1, 0, 1].entries()) {
    prop(printBench, i === 1 ? 'propCamera' : 'propBooks', dx, 0, 0, {
      variant: i + 1, scaleX: 0.85, scaleZ: 0.85
    });
  }
  prop(printBench, 'propFrame', -0.45, -0.22, 0, { variant: 3 });
  prop(printBench, 'propCup', 0.5, 0.2);
  const critique = items.find(item => item.id === 'editing-critique-table');
  prop(critique, 'propBooks', -0.5, 0);
  prop(critique, 'propFrame', 0.35, 0, 0, { variant: 4 });
  prop(critique, 'propCup', 0.8, 0.25);
  for (const [i, x] of [-7.1, -2.1].entries()) {
    const desk = items.find(item => item.id === `edit-loft-${i}`);
    prop(desk, 'propLamp', -2, 0, 0, { color: '#74796b' });
    prop(desk, 'propPlant', 2, 0, 0, { scaleY: 0.9 });
    const ledge = up(`photo-archive-ledge-${i}`, 'wallShelf', x, -13.3, 0, {
      elevation: 4.05, scaleX: 1.5, color: '#635746'
    });
    prop(ledge, 'propBookRow', -0.85, 0, 0, { variant: i });
    prop(ledge, 'propFrame', -0.2, 0, 0, { variant: 3 + i, scaleY: 1.25 });
    prop(ledge, 'propCamera', 0.4, 0);
    prop(ledge, 'propPlant', 0.95, 0, 0, { scaleY: 1.2 });
  }
  const galleryLedge = add('gallery-print-ledge', 'wallShelf', 10.3, -2.1, 3, {
    elevation: 1.75, scaleX: 2.8, color: '#93836a'
  });
  for (const [i, dx] of [-0.95, -0.5, 0, 0.5, 0.95].entries())
    prop(galleryLedge, i === 0 || i === 4 ? 'propPlant' : 'propFrame', dx, 0, 0, {
      variant: i, scaleY: i % 2 ? 1.4 : 1
    });
  for (const [i, x] of [-8.7, -5.2, -1.8].entries())
    up(`photo-trailing-edge-${i}`, 'vinePlanter', x, -8.35, 0, {
      scaleX: 0.85, scaleY: 0.65, scaleZ: 0.85, color: '#756d56'
    });
  const console = items.find(item => item.id === 'gallery-console');
  prop(console, 'propPlant', -1.2, 0, 0, { scaleY: 1.6 });
  prop(console, 'propBooks', 0.85, 0, 0, { variant: 4 });
  prop(console, 'propPlant', 2, 0, 0, { scaleY: 1.3 });
  for (const [i, z] of [-5.7, -3.2, -0.5, 1.8].entries()) {
    add(`gallery-contact-print-${i}`, 'wallPrint', 10.8, z, 3, {
      elevation: 4.15, scaleX: 0.7, scaleY: 0.45, variant: i + 1
    });
  }
}
