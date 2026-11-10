export function composeStudyPreset({ items, add, up, prop, cabinet, shelf, seats, plant, light }) {
  // Four large modules read as one shared work island, with chairs only around its perimeter.
  for (const [i, x] of [-5.2, 0.5].entries())
    for (const [j, z] of [-5.4, -2.9].entries()) {
      const t = add(`team-desk-${i}-${j}`, "studyDesk", x, z, 0, {
        scaleX: 1.15,
        scaleZ: 1.15,
        color: "#e2e5e3"
      });
      for (const [n, dx] of [-1.45, 0, 1.45].entries()) {
        prop(t, "propMonitor", dx, j === 0 ? 0.35 : -0.35, 0, { rotation: j === 0 ? 2 : 0, scaleX: 0.75, scaleZ: 0.75 });
        prop(t, "propBooks", dx, j === 0 ? -0.65 : 0.65, 0, { variant: (i + j + n) % 6 });
        prop(t, "propCup", dx + 0.4, j === 0 ? -0.6 : 0.6);
      }
      prop(t, "propPlant", 0, j === 0 ? 0.78 : -0.78, 0, { scaleX: 0.7, scaleZ: 0.7 });
      prop(t, "propLaptop", -1.95, j === 0 ? 0.8 : -0.8, 0, {
        scaleX: 0.7, scaleZ: 0.7,
        rotation: j === 0 ? 2 : 0
      });
      prop(t, "propLamp", 1.95, j === 0 ? 0.78 : -0.78, 0, { color: "#a7b1ad", scaleX: 0.75, scaleZ: 0.75 });
    }
  for (const [i, x] of [-6.9, -5.2, -3.5, -1.2, 0.5, 2.2].entries())
    for (const [j, z] of [-7.3, -1].entries())
      add(`team-perimeter-${i}-${j}`, "gameChair", x, z, j ? 2 : 0, { color: "#858f99" });
  for (const [i, x] of [-8.6, 3.9].entries())
    for (const [j, z] of [-5.4, -2.9].entries())
      add(`team-end-${i}-${j}`, "gameChair", x, z, i ? 3 : 1, { color: "#929da5" });
  add("presentation", "projectScreen", -3.4, -10.8, 0, { scaleX: 1.45, scaleY: 1.1 });
  add("whiteboard", "whiteboard", -8.6, -11.5, 1, { scaleX: 0.95 });
  cabinet("presentation-console", -3.4, -12.4, 0, 0, "longCredenza", {
    scaleX: 1.1,
    color: "#b8ad99"
  });
  for (const [i, x] of [0.6, 3.2, 5.8].entries())
    shelf(`project-library-${i}`, x, -10.8, 0, 0, "study");
  // An open technical bay sits behind the library, with its entry on the left.
  add("server", "serverRack", 8.3, -13.4);
  add("lab-server-storage", "serverRack", 9.8, -13.4, 0, { color: "#53616b" });
  add("lab-front-divider", "loftPartition", 9.3, -9.7, 0, {
    scaleX: 0.6,
    scaleY: 0.35,
    color: "#b6c5c6"
  });
  add("lab-side-divider", "loftPartition", 7.15, -13.25, 1, {
    scaleX: 0.5,
    scaleY: 0.35,
    color: "#b6c5c6"
  });
  const diagnostics = add("lab-diagnostics", "worktop", 9.3, -11.65, 0, {
    scaleX: 0.55,
    color: "#d5dddb"
  });
  prop(diagnostics, "propMonitor", -1.1, -0.05, 0, { scaleX: 0.8, scaleZ: 0.8 });
  prop(diagnostics, "propLaptop", 0.75, 0.05, 0, { scaleX: 0.75, scaleZ: 0.75 });
  prop(diagnostics, "propBooks", 1.8, 0, 0, { scaleX: 0.6, scaleZ: 0.65 });
  add("lab-diagnostics-seat", "gameChair", 9.3, -10.45, 2, { color: "#73919d" });
  const equipmentLedge = add("lab-document-ledge", "wallShelf", 8.7, -14.05, 0, {
    elevation: 3,
    scaleX: 1.5,
    color: "#a6b7ba"
  });
  for (const [i, x] of [-0.85, -0.2, 0.45].entries())
    prop(equipmentLedge, "propBookRow", x, 0, 0, { scaleX: 0.85, variant: i + 1 });
  prop(equipmentLedge, "propFrame", 0.95, 0, 0, { variant: 0 });
  add("lab-status-display", "wallPrint", 10.75, -12, 3, {
    elevation: 2.6,
    scaleX: 1.7,
    variant: 0,
    color: "#6c8794"
  });
  add("lab-light", "trackLight", 9.1, -11.8, 1, {
    elevation: 3.5,
    scaleX: 0.8,
    color: "#e5eae4"
  });
  // Upper-left meeting room: 6.6m wide, with a 1.5m side doorway and a separate landing aisle.
  for (const [i, x] of [-9.15, -5.95].entries())
    up(`meeting-front-${i}`, "loftGlassPartition", x, -10, 0, {
      scaleX: i ? 0.775 : 0.825, scaleY: 0.9, color: "#c8d0d2"
    });
  up("meeting-side-back", "loftPartition", -4.2, -13.45, 1, {
    scaleX: 0.375, scaleY: 0.9, color: "#c8d0d2"
  });
  up("meeting-side-front", "loftGlassPartition", -4.2, -10.55, 1, {
    scaleX: 0.275, scaleY: 0.9, color: "#c8d0d2"
  });
  up("meeting-door-lintel", "ceilingBeam", -4.2, -11.9, 1, {
    scaleX: 0.267, elevation: 3.65, color: "#c8d0d2"
  });
  const meeting = up("meeting-table", "worktop", -7.5, -12.25, 0, {
    scaleX: 0.85, scaleZ: 1.3, color: "#c8bdad"
  });
  prop(meeting, "propLaptop", -1.2, 0);
  prop(meeting, "propBooks", 0, 0);
  prop(meeting, "propPlant", 1.3, 0);
  seats(meeting, [-1.2, 1.2], [-1.3, 1.3]);
  light("meeting-pendant", -7.5, -12.25, 2.8, 1);
  up("meeting-print", "wallPrint", -7.5, -14.25, 0, { elevation: 2, scaleX: 1.8, variant: 2 });
  for (let i = 0; i < 2; i++) {
    const t = up(`focus-${i}`, "worktop", -0.7 + i * 5.4, -12.95, 0, {
      scaleX: 0.95, color: "#c7c4b8"
    });
    for (const dx of [-1.15, 1.15]) {
      prop(t, "propMonitor", dx, 0);
      up(`focus-chair-${i}-${dx}`, "gameChair", t.x + dx, -11.55, 2, { color: "#a3a5a3" });
    }
    prop(t, "propBooks", 0, 0);
    prop(t, "propCup", 0.5, 0.2);
    up(`focus-light-${i}`, "trackLight", t.x, -12.95, 0, {
      elevation: 3.9, scaleX: 1.05, color: "#e2e8e5"
    });
    const ledge = up(`focus-library-${i}`, "wallShelf", t.x, -14.05, 0, {
      elevation: 2, scaleX: 1.65, color: "#8a9695"
    });
    for (const [bookIndex, dx] of [-0.9, -0.3, 0.3].entries())
      prop(ledge, "propBookRow", dx, 0, 0, { variant: (bookIndex + i) % 6, scaleX: 1.1 });
    prop(ledge, "propFrame", 0.9, 0, 0, { variant: i, scaleX: 1.3, scaleY: 1.3 });
  }
  add("study-neon", "studyNeon", 4.4, -14.3, 0, { elevation: 5.3, scaleX: 1.5, scaleY: 1 });
  cabinet("window-counter", -9.9, -7.7, 1, 0, "longCredenza", { scaleX: 1.1, color: "#b1a38c" });
  for (const [i, x] of [-6.9, 4.4].entries()) {
    const c = add(`study-front-console-${i}`, "longCredenza", x, 2.7, 0, {
      scaleX: i ? 1.1 : 1.15, color: "#aaa58d"
    });
    for (const [j, dx] of [-1.8, -0.9, 0, 0.9, 1.8].entries())
      prop(c, j % 2 ? "propBooks" : "propPlant", dx, 0, 0, { variant: j });
  }
  const windowTree = plant("window-tree", -10, 1.6, 0, 0.9);
  windowTree.scaleY = 1.35;
  plant("study-tree", 7.5, -7.3, 0, 0.75);
  plant("loft-tree", 9.6, -13.35, 1, 0.85);
  plant("meeting-tree", -10.3, -13.5, 1, 0.55);
  // Layer the perimeter while leaving the entrance and mezzanine approach clear.
  for (const [i, x] of [-8.4, -5.8, 3.3, 5.7].entries()) {
    add(`front-trailing-plant-${i}`, "vinePlanter", x, 2.75, 0, {
      scaleX: 0.8,
      scaleY: 0.4,
      scaleZ: 0.8,
      color: "#9ca591"
    });
  }
  for (const [i, x] of [0.7, 4.4, 7.4].entries()) {
    up(`loft-edge-green-${i}`, "vinePlanter", x, -8.95, 0, { scaleY: 0.45, color: "#bdc3b8" });
  }
  add("window-trailing-plant", "vinePlanter", -10.65, -9.8, 1, {
    elevation: 0.5,
    color: "#a6b394"
  });
  plant("reading-corner-tree", 7.4, -4.7, 0, 0.85);
  add("discussion-divider", "loftPartition", 6.7, -3.3, 0, {
    scaleX: 0.7,
    scaleY: 0.3,
    color: "#a9bbb4"
  });
  const reading = add("reading-corner-table", "cafeTable", 6.7, -1.6, 0, {
    scaleX: 1.15,
    scaleZ: 1.15,
    color: "#b3b5a5"
  });
  prop(reading, "propBooks", -0.2, 0.3, 0, { scaleX: 0.65, scaleZ: 0.65 });
  prop(reading, "propCup", 0.4, 0.15);
  prop(reading, "propLaptop", -0.1, -0.35, 0, { scaleX: 0.8, scaleZ: 0.8 });
  add("discussion-chair", "roundChair", 5, -1.6, 1, { color: "#8ca294" });
  add("discussion-whiteboard", "whiteboard", 8.05, 0.8, 3, {
    scaleX: 0.85,
    scaleY: 0.85,
    color: "#e1e7e2"
  });
  add("reading-corner-chair", "roundChair", 6.7, 0.15, 2, { color: "#627c9a" });
  light("reading-corner-light", 6.7, -1.6, 3.6);
  up("meeting-pinboard", "wallPrint", -9.7, -14.25, 0, {
    elevation: 2.1,
    scaleX: 1.35,
    scaleY: 1.15,
    variant: 0
  });
  up("focus-picture-light", "pictureLight", 4.4, -14.15, 0, { elevation: 4.45, scaleX: 1.6 });
  // White linear fixtures follow the shared work island instead of a generic roof grid.
  for (const [row, z] of [-5.4, -2.9].entries()) {
    add(`study-light-spine-${row}`, "ceilingBeam", -2.35, z, 0, {
      elevation: 6.15,
      scaleX: 1.85,
      scaleY: 0.6,
      color: "#e2e8e4",
      variant: 2
    });
    for (const [column, x] of [-5.2, 0.5].entries())
      add(`study-task-rail-${row}-${column}`, "trackLight", x, z, 0, {
        elevation: 5.8,
        scaleX: 1.35,
        color: "#e8ece7"
      });
  }
  for (const [i, x] of [-7.5, 3.5].entries())
    up(`study-upper-ceiling-${i}`, "ceilingBeam", x, -12.25, 0, {
      elevation: 5.05,
      scaleX: i ? 1.8 : 1.05,
      color: "#dbe3de",
      variant: 2
    });
  up("meeting-linear-light", "trackLight", -7.5, -12.25, 0, {
    elevation: 4.1,
    scaleX: 1.15,
    color: "#e5ebe7"
  });
  add("presentation-linear-light", "trackLight", -3.4, -10, 0, {
    elevation: 3.6,
    scaleX: 1.7,
    color: "#e1e8e4"
  });

  // Project references and personal desk objects give each work zone a lived-in edge.
  for (const [i, x] of [-0.7, 4.7].entries()) {
    const ledge = up(`focus-reference-ledge-${i}`, 'wallShelf', x, -14.05, 0, {
      elevation: 3.35, scaleX: 1.65, color: '#81928d'
    });
    prop(ledge, 'propPlant', -0.9, 0, 0, { scaleY: 1.2, scaleZ: 0.7 });
    prop(ledge, 'propFrame', -0.2, 0, 0, { variant: i + 3, scaleX: 1.3, scaleY: 1.4 });
    prop(ledge, 'propBooks', 0.45, 0);
    prop(ledge, 'propBookRow', 0.95, 0, 0, { variant: i + 2 });
    const desk = items.find(item => item.id === `focus-${i}`);
    prop(desk, 'propLamp', -2, 0, 0, { color: '#6e827a' });
    prop(desk, 'propPlant', 2, 0, 0, { scaleY: 0.8 });
    prop(desk, 'propFrame', -0.55, 0.25, 0, { variant: i, scaleX: 0.7, scaleZ: 0.7 });
  }
  for (const [i, x] of [7.65, 8.85, 10.05].entries())
    up(`study-project-gallery-${i}`, 'wallPrint', x, -14.3, 0, {
      elevation: 2.2 + (i % 2) * 0.22, scaleX: 0.9, scaleY: 1.02, variant: i,
      color: '#60788a'
    });
  for (const desk of items.filter(item => item.id.startsWith('team-desk-') && item.kind === 'studyDesk')) {
    prop(desk, 'propFrame', -0.7, 0.1, 0, { variant: 2 });
    prop(desk, 'propBottle', 0.75, 0.1, 0, { color: '#7e9b91' });
  }
  for (const plant of items.filter(item => item.kind === 'propPlant' && item.parentId?.startsWith('study-front-console-'))) {
    plant.scaleY = 1.5;
  }
}
