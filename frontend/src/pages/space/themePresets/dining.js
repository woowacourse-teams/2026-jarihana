export function composeDiningPreset({
  items,
  add,
  up,
  prop,
  dress,
  cabinet,
  shelf,
  seats,
  plant,
  light,
  m,
  b
}) {
  // Left wall lounge faces a long storage island; the kitchen is a continuous rear line.
  add("left-sofa", "clubSofa", -10.85, -4.7, 1, { scaleX: 1.7, color: "#d3c8b6" });
  const loungeCounter = cabinet("lounge-counter", -8.3, -4.7, 1, 0, "longCredenza", {
    scaleX: 1.3,
    color: "#b69267"
  });
  prop(loungeCounter, "propCup", -1.2, 0.05);
  prop(loungeCounter, "propPlates", 0.85, 0, 0, { scaleX: 0.7, scaleZ: 0.7 });
  add("lounge-rug", "loungeRug", -9.4, -4.5, 0, { scaleX: 0.6, scaleZ: 0.9, color: "#b9a68d" });
  add("food-neon", "diningNeon", -11.55, -5, 1, { elevation: 3.2, scaleX: 1.4, scaleY: 1 });
  add("food-map", "foodMap", -11.55, -10.6, 1, { scaleX: 1.3 });
  // Reuse the pantry contents inside a service room, with a 2m front opening.
  for (const [i, [x, z]] of [
    [-10.5, -13.05],
    [-7.95, -13.05],
    [0.3, -13.05],
    [3.3, -13.05],
    [6.3, -13.05]
  ].entries()) {
    shelf(`pantry-${i}`, x, z, 0, 0, "dining", { scaleY: 1 });
  }
  add("pantry-service-wall", "loftPartition", -6.45, -11.2, 1, {
    scaleX: 1.2,
    scaleY: 0.65,
    color: "#b7b9a2"
  });
  add("pantry-front-glazing", "loftGlassPartition", -10, -8.7, 0, {
    scaleX: 0.85,
    scaleY: 0.65,
    color: "#d9cbb3"
  });
  add("pantry-door-lintel", "ceilingBeam", -7.25, -8.7, 0, {
    elevation: 2.6,
    scaleX: 0.37,
    color: "#a28a69",
    variant: 2
  });
  const pantryPrep = add("pantry-prep-table", "worktop", -9.45, -10.7, 0, {
    scaleX: 0.65,
    color: "#b2936c"
  });
  prop(pantryPrep, "propCanisters", -1.5, 0);
  prop(pantryPrep, "propPlates", -0.3, 0);
  prop(pantryPrep, "propBottle", 0.7, 0);
  prop(pantryPrep, "propBooks", 1.6, 0, 0, { color: "#b87448" });
  add("pantry-menu-print", "wallPrint", -6.6, -11.2, 3, {
    elevation: 1.8,
    scaleX: 0.8,
    scaleY: 0.8,
    variant: 2
  });
  light("pantry-task-pendant", -9.45, -10.7, 2.2, 0, { color: "#647663" });
  add("kitchen-sink", "kitchenCounter", -4.05, -11.7, 0, { scaleX: 1.4, color: "#a8b2a3" });
  add("kitchen-range", "kitchenRange", -0.65, -11.7, 0, { scaleX: 1.2 });
  add("kitchen-prep", "kitchenCounter", 2.9, -11.7, 0, { scaleX: 1.4, color: "#a8b2a3" });
  add("kitchen-fridge", "kitchenFridge", 6.2, -11.7, 0, { scaleX: 1.2 });
  for (const id of ["kitchen-sink", "kitchen-prep"]) {
    const counter = items.find((item) => item.id === id);
    for (let row = 1; row <= 2; row++)
      for (let col = 0; col < 6; col++)
        prop(counter, "propBottle", -1.2 + col * 0.46, -0.23, row, { variant: col });
    prop(counter, "propPlant", 1.1, 0);
    prop(counter, "propCanisters", -1.1, 0);
    prop(counter, "propPlates", 0, 0, 0, { scaleX: 0.8, scaleZ: 0.8 });
  }
  const island = add("kitchen-island", "kitchenIsland", 1, -7.3, 0, {
    scaleX: 1.9,
    scaleZ: 1.4,
    color: "#a6b0a2"
  });
  add("island-plinth-light", "lowEdgeLight", island.x, island.z + 0.68 * island.scaleZ, 0, {
    scaleX: 2.65, scaleY: 0.8, color: "#ffd09b"
  });
  prop(island, "propPlates", -1.1, 0.15);
  prop(island, "propBottle", 0.8, -0.15);
  prop(island, "propCanisters", 1.2, 0.15);
  prop(island, "propPlant", -0.25, -0.2);
  prop(island, "propCup", 0.25, 0.25);
  for (let i = 0; i < 5; i++) add(`island-stool-${i}`, "stool", -1.8 + i * 1.4, -5.6);
  const table = add("communal-table", "feastTable", 0.4, -0.9, 0, { scaleX: 1.65, scaleZ: 1.4 });
  dress(table);
  seats(table, [-2.7, -0.9, 0.9, 2.7], [-1.8, 1.8]);
  for (const [i, x] of [-7.8, -1.8, 4.2].entries()) {
    const t = up(`loft-dining-${i}`, "feastTable", x, -11.25, 0, { scaleX: 1.06 });
    dress(t);
    seats(t, [-1.6, 0, 1.6], [-1.45, 1.45]);
    light(`loft-dining-light-${i}`, x, -11.25, 2.9, 1);
    const sideboard = up(`loft-serving-shelf-${i}`, "wallShelf", x, -13.25, 0, {
      elevation: 1.1,
      scaleX: 1.5,
      color: "#a48b66"
    });
    prop(sideboard, "propPlates", -0.65, 0, 0, { scaleX: 0.7, scaleZ: 0.7 });
    prop(sideboard, "propBottle", 0, 0);
    prop(sideboard, "propPlant", 0.65, 0, 0, { scaleX: 0.7, scaleY: 0.7, scaleZ: 0.7 });
    up(`loft-menu-print-${i}`, "wallPrint", x + 2.5, -13.6, 0, {
      elevation: 0.4,
      scaleX: 1.1,
      scaleY: 0.9,
      variant: i + 1
    });
  }
  // Low editable walls define the cafe edge without enclosing the dining hall.
  add("cafe-dining-divider", "loftPartition", -3.9, 0, 1, {
    scaleX: 0.8,
    scaleY: 0.25,
    color: "#c1c3a9"
  });
  add("cafe-front-wall", "loftPartition", -9.8, 3.2, 0, {
    scaleX: 0.8,
    scaleY: 0.25,
    color: "#d8c8ad"
  });
  // Three cafe tables share the front-left room and leave the central entrance open.
  for (const [i, [x, z]] of [
    [-9.1, 1.25],
    [-5.6, 1.25],
    [-5.9, -2.1]
  ].entries()) {
    const t = add(`terrace-cafe-${i}`, "cafeTable", x, z, 0, { color: "#e1d9c9" });
    prop(t, "propCup", -0.25, 0.1);
    prop(t, "propPlates", 0.25, -0.12, 0, { scaleX: 0.6, scaleZ: 0.6 });
    add(`terrace-seat-${i}`, "gameChair", x - 1.1, z, 1, {
      scaleX: 0.85,
      scaleZ: 0.85,
      color: "#ded8c9"
    });
    add(`cafe-partner-${i}`, "gameChair", x + 1.1, z, 3, {
      scaleX: 0.85,
      scaleZ: 0.85,
      color: "#ded8c9"
    });
  }
  const coffeeBar = add("cafe-service", "cafeCabinet", -11.05, -0.3, 1, { color: "#b99b73" });
  prop(coffeeBar, "propCup", -0.55, 0);
  prop(coffeeBar, "propCanisters", 0.5, 0);
  add("cafe-menu", "menuBoard", 7.1, 1.5, 0, { scaleX: 0.8, scaleZ: 0.8 });
  add("dining-table-rug", "loungeRug", 0.4, -0.9, 0, {
    scaleX: 1.35,
    scaleZ: 0.95,
    color: "#d2c7b4"
  });
  cabinet("front-cabinet", 6.9, 2.6, 0, 0, "longCredenza", { scaleX: 0.65 });
  for (let i = 0; i < 3; i++) {
    add(`left-wall-print-${i}`, "wallPrint", -11.8, -7.3 + i * 2.1, 1, {
      elevation: 2.8,
      variant: i,
      scaleX: i === 1 ? 1.7 : 1.2,
      scaleY: i === 1 ? 1.1 : 1
    });
    add(`left-wall-light-${i}`, "pictureLight", -11.6, -7.3 + i * 2.1, 1, { elevation: 4.5 });
  }
  for (const [i, x] of [-10.6, -5, 1, 7].entries())
    add(`loft-trailing-planter-${i}`, "vinePlanter", x, -7.6, 0, {
      elevation: 2.55,
      scaleY: 0.8,
      color: "#9c8764"
    });
  add("front-trailing-planter-0", "vinePlanter", -9.8, 3.04, 2, {
    scaleX: 1.2,
    scaleY: 0.375,
    color: "#9b8968"
  });
  add("front-trailing-planter-1", "vinePlanter", -3.9, 0, 1, {
    scaleY: 0.375,
    color: "#9b8968"
  });
  plant("cafe-tree", -7.5, 3, 0, 0.7);
  plant("loft-dining-tree-left", -10.9, -12.9, 1, 0.95);
  plant("loft-dining-tree-right", 8.3, -12.7, 1, 1.1);
  light("cafe-pendant", -7.4, 0, 4.3);
  light("lounge-pendant", -8.5, -4.7, 3.3);
  plant("left-tree", -11.1, 2.3, 0, 0.8);
  plant("kitchen-tree", 8.3, -12.8);
  plant("terrace-tree", -5.4, -6.2);
  light("table-pendant1", -2, -0.9, 3.4);
  light("table-pendant2", 2.7, -0.9, 3.9);
  light("island-pendant", 1, -7.3, 3.2);

  // The cafe has a lower canopy; the kitchen and loft use their own crosswise tracks.
  add("cafe-canopy-beam", "ceilingBeam", -7.7, 0.6, 0, {
    elevation: 4.8,
    scaleX: 1.4,
    color: "#94744f",
    variant: 2
  });
  for (const [i, x] of [-5, 4].entries()) {
    add(`dining-roof-crossbeam-${i}`, "ceilingBeam", x, -10.5, 0, {
      elevation: b.height - 0.5,
      scaleX: 1.45,
      color: "#8a6b4e",
      variant: 2
    });
    add(`kitchen-service-track-${i}`, "trackLight", x, -10.5, 0, {
      elevation: m.height - 0.9,
      scaleX: 1.5
    });
  }
  add("loft-dining-gallery-track", "trackLight", 0, -13.1, 0, {
    level: 1,
    elevation: 3.25,
    scaleX: 2.8
  });

  // Recipe displays and serving objects give the supper loft a collected cafe character.
  for (const [i, x] of [-7.8, -1.8, 4.2].entries()) {
    up(`loft-recipe-art-${i}`, "wallPrint", x, -13.63, 0, {
      elevation: 2.05, scaleX: 1.4, scaleY: 0.85, variant: i + 3, color: "#947550"
    });
    const sideboard = items.find((item) => item.id === `loft-serving-shelf-${i}`);
    prop(sideboard, "propBookRow", -0.95, 0, 0, { scaleX: 0.65, scaleY: 0.8, scaleZ: 0.75 });
    prop(sideboard, "propCanisters", 1, 0, 0, { scaleX: 0.65, scaleY: 0.85, scaleZ: 0.75 });
    const supper = items.find((item) => item.id === `loft-dining-${i}`);
    prop(supper, "propCanisters", 0, 0, 0, { scaleX: 0.6, scaleY: 0.65, scaleZ: 0.6 });
    prop(supper, "propBottle", 1.45, 0, 0, { color: "#71815f" });
  }
  for (const [i, x] of [-9.3, -4.6, 1.6, 7.8].entries()) {
    up(`loft-herb-basket-${i}`, "vinePlanter", x, -13.45, 0, {
      elevation: 2.2, scaleX: 0.65, scaleY: 0.6, color: "#a88c62"
    });
  }
  const cafeDisplay = add("cafe-recipe-ledge", "wallShelf", -11.48, -0.9, 1, {
    elevation: 2.8, scaleX: 1.5, color: "#a58b65"
  });
  prop(cafeDisplay, "propBookRow", -0.9, 0, 0, { variant: 1 });
  prop(cafeDisplay, "propFrame", -0.2, 0, 0, { variant: 3 });
  prop(cafeDisplay, "propCanisters", 0.5, 0, 0, { scaleX: 0.7, scaleZ: 0.7 });
  prop(cafeDisplay, "propPlant", 1, 0, 0, { scaleX: 0.8, scaleY: 1.1, scaleZ: 0.8 });
  add("cafe-hanging-herbs", "vinePlanter", -11.4, 1.3, 1, {
    elevation: 3.9, scaleX: 0.7, scaleY: 0.8, color: "#a88c62"
  });
  prop(loungeCounter, "propCanisters", -0.25, 0, 0, { scaleX: 0.65, scaleY: 0.65, scaleZ: 0.65 });
  prop(island, "propCanisters", -1.5, -0.25, 0, { scaleX: 0.7, scaleY: 0.8, scaleZ: 0.7 });
  prop(table, "propPlates", -1.2, 0, 0, { scaleX: 0.75, scaleZ: 0.6 });
  prop(table, "propCanisters", 1.35, 0, 0, { scaleX: 0.65, scaleY: 0.7, scaleZ: 0.6 });
  for (const i of [0, 1, 2]) {
    const cafe = items.find((item) => item.id === `terrace-cafe-${i}`);
    prop(cafe, "propPlant", 0, -0.45, 0, { scaleX: 0.45, scaleY: 0.55, scaleZ: 0.45 });
  }
  plant("loft-herb-tree", 8.25, -10.6, 1, 0.6);
}
