import * as THREE from "three";
import { createClearWindowMaterial } from "./roomGlazing";

const EXTERIORS = {
  band: { wall: "#333a3b", trim: "#242b2d", accent: "#986d48", roof: "#484d4b" },
  photo: { wall: "#e4e2d9", trim: "#656b67", accent: "#bcb5a5", roof: "#b5b7ae" },
  study: { wall: "#ddd8ca", trim: "#67776c", accent: "#a68a64", roof: "#aaa99b" },
  dining: { wall: "#e7d8ba", trim: "#79816b", accent: "#ae785c", roof: "#8d9585" },
  boardgame: { wall: "#ad7961", trim: "#43564c", accent: "#9d7951", roof: "#696c5e" },
  climbing: { wall: "#c7c6bb", trim: "#505b5b", accent: "#bb8d48", roof: "#888f88" }
};

export function getClubhouseExteriorPalette(template) {
  const theme = typeof template === "string" ? template : template?.id;
  return EXTERIORS[theme] || EXTERIORS.study;
}

export function getClerestoryOpening(height, theme) {
  const paneBottom = theme === "band" ? height - 2.2 : 4.85;
  return { sill: paneBottom + 0.02, head: height - 1.17 };
}

function repeatedBoxes(parent, material, name, size, positions) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(...size), material, positions.length);
  mesh.name = name;
  const matrix = new THREE.Matrix4();
  positions.forEach(([x, y, z], index) => mesh.setMatrixAt(index, matrix.makeTranslation(x, y, z)));
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function addClubhouseSign(parent, width, height, x, y, z, compact = false) {
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color: "#211a18", toneMapped: false }));
  sign.name = compact ? "entry-led-sign" : "exterior-tenant-lettering";
  sign.position.set(x, y, z);
  parent.add(sign);
}

export function updateClubhouseSign(sign, name, animate = true) {
  if (sign.userData.signName === name && sign.userData.animateSign === animate) return;
  const canvas = document.createElement("canvas");
  const { width, height } = sign.geometry.parameters;
  const context = canvas.getContext("2d");
  if (!context) return;
  const faceWidth = sign.name === "entry-led-sign" ? 512 : 1024;
  const faceHeight = Math.round(faceWidth * height / width);
  const font = (size) => `700 ${size}px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif`;
  const size = faceHeight * 0.64;
  const maxWidth = faceWidth - faceHeight * 0.76;
  context.font = font(size);
  const textWidth = context.measureText(name).width;
  const scrolling = animate && textWidth > maxWidth;
  const stripWidth = scrolling ? Math.max(faceWidth, Math.ceil(textWidth + faceHeight * 1.6)) : faceWidth;
  const scale = Math.min(1, 4096 / stripWidth);
  canvas.width = Math.round(stripWidth * scale);
  canvas.height = Math.round(faceHeight * scale);
  const w = canvas.width;
  const h = canvas.height;
  const edge = scrolling ? 0 : 3;
  context.fillStyle = "#634735";
  context.fillRect(0, 0, w, h);
  context.fillStyle = "#211a18";
  context.fillRect(edge, 3, w - 2 * edge, h - 6);
  context.textAlign = scrolling ? "left" : "center";
  context.textBaseline = "middle";
  context.font = font(scrolling ? size * scale : size * Math.min(1, maxWidth / textWidth));
  context.fillStyle = "#fff0ba";
  context.shadowBlur = h * 0.16;
  context.shadowColor = "#ff8a2d";
  context.fillText(name, scrolling ? h * 0.38 : w / 2, h * 0.52);
  context.shadowBlur = 0;
  context.fillStyle = "rgba(32, 19, 15, 0.22)";
  const pitch = Math.max(2, Math.round(h / 34));
  for (let y = 4; y < h - 3; y += pitch) context.fillRect(edge, y, w - 2 * edge, 1);
  for (let x = edge + 1; x < w - edge; x += pitch) context.fillRect(x, 3, 1, h - 6);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  if (scrolling) {
    map.wrapS = THREE.RepeatWrapping;
    map.repeat.x = faceWidth / stripWidth;
  }
  if (!sign.material.map) sign.material.needsUpdate = true;
  else sign.material.map.dispose();
  sign.material.map = map;
  sign.material.color.set("#ffffff");
  sign.userData.signName = name;
  sign.userData.animateSign = animate;
  sign.userData.signScroll = scrolling ? { speed: faceHeight * 0.0024 / stripWidth } : null;
}

export function advanceClubhouseSign(sign, time) {
  const scroll = sign.userData.signScroll;
  const elapsed = Math.min(80, time - (scroll.lastTime ?? time));
  scroll.lastTime = time;
  // Move the texture window without uploading another canvas or changing the mesh.
  const offset = sign.material.map.offset;
  offset.x = (offset.x + elapsed * scroll.speed) % 1;
}

export function addClubhouseExterior(kit, building, template) {
  const theme = typeof template === "string" ? template : template?.id;
  const palette = getClubhouseExteriorPalette(template);
  const group = new THREE.Group();
  group.name = "clubhouse-exterior-envelope";
  group.userData.theme = theme || "study";
  kit.group.add(group);
  const facade = new THREE.Group();
  facade.name = "clubhouse-exterior-facade";
  facade.userData.exteriorDetail = true;
  const roof = new THREE.Group();
  roof.name = "clubhouse-exterior-roof";
  roof.userData.exteriorOnly = true;
  group.add(facade, roof);
  const box = (name, w, h, d, color, x, y, z, parent = facade) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), kit.material(color));
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const roofBox = (...args) => box(...args, roof);
  const { minX, maxX, minZ, maxZ, height } = building;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const front = maxZ + 0.2;
  const bottom = 2.86;
  const upperHeight = height - bottom;

  box("front-shadow-course", width + 0.5, 0.16, 0.42, palette.trim, centerX, bottom + 0.08, front + 0.06);
  // Keep the underside above the interior ceiling so the two surfaces cannot z-fight.
  roofBox("roof-deck", width + 0.6, 0.2, depth + 0.6, palette.roof, centerX, height + 0.14, centerZ);
  for (const z of [minZ - 0.18, maxZ + 0.18]) {
    roofBox("roof-parapet", width + 0.62, 0.46, 0.2, palette.wall, centerX, height + 0.35, z);
    roofBox("parapet-metal-coping", width + 0.75, 0.075, 0.34, palette.trim, centerX, height + 0.6, z);
  }
  for (const x of [minX - 0.18, maxX + 0.18]) {
    roofBox("side-parapet", 0.2, 0.46, depth + 0.4, palette.wall, x, height + 0.35, centerZ);
    roofBox("side-metal-coping", 0.34, 0.075, depth + 0.64, palette.trim, x, height + 0.6, centerZ);
    for (const z of [minZ, maxZ]) box("exterior-corner-column", 0.28, height, 0.34, palette.trim, x, height / 2, z);
  }

  const { sill, head } = getClerestoryOpening(height, theme);
  const bays = theme === "photo" ? 3 : theme === "climbing" ? 4 : 6;
  const bayWidth = (width - 2.2) / bays;
  const openingWidth = bayWidth - 0.42;
  const openingHeight = head - sill;
  const paneCenter = (sill + head) / 2;
  const glassMaterial = createClearWindowMaterial();
  const glassGeometry = new THREE.PlaneGeometry(openingWidth, openingHeight);
  const cladding = new THREE.Shape()
    .moveTo(minX - 0.14, bottom).lineTo(maxX + 0.14, bottom)
    .lineTo(maxX + 0.14, height).lineTo(minX - 0.14, height);
  cladding.closePath();
  const rails = [];
  const jambs = [];
  const crossbars = [];
  const mullions = [];
  for (let index = 0; index < bays; index += 1) {
    const x = minX + 1.1 + bayWidth * (index + 0.5);
    const left = x - openingWidth / 2;
    const right = x + openingWidth / 2;
    const opening = new THREE.Path()
      .moveTo(left, sill).lineTo(left, head).lineTo(right, head).lineTo(right, sill);
    opening.closePath();
    cladding.holes.push(opening);

    rails.push([x, sill - 0.05, front + 0.16], [x, head + 0.05, front + 0.16]);
    jambs.push([left - 0.0425, paneCenter, front + 0.16], [right + 0.0425, paneCenter, front + 0.16]);
    const glass = new THREE.Mesh(glassGeometry, glassMaterial);
    glass.name = "clerestory-glass";
    glass.position.set(x, paneCenter, front + 0.24);
    glass.userData.roomWindow = true;
    facade.add(glass);
    if (theme !== "band") {
      crossbars.push([x, sill + openingHeight * 0.58, front + 0.26]);
      mullions.push([x, paneCenter, front + 0.26]);
    }
  }
  const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(cladding, { depth: 0.22, bevelEnabled: false }), kit.material(palette.wall));
  wall.name = "upper-front-cladding";
  wall.position.z = front - 0.11;
  wall.castShadow = wall.receiveShadow = true;
  facade.add(wall);
  const trim = kit.material(palette.trim);
  repeatedBoxes(facade, trim, "clerestory-rails", [bayWidth - 0.25, 0.1, 0.16], rails);
  repeatedBoxes(facade, trim, "clerestory-jambs", [0.085, openingHeight, 0.16], jambs);
  if (crossbars.length) {
    repeatedBoxes(facade, trim, "clerestory-crossbar", [bayWidth - 0.25, 0.075, 0.1], crossbars);
    repeatedBoxes(facade, trim, "clerestory-center-mullion", [0.07, openingHeight, 0.1], mullions);
  }

  const signWidth = theme === "band" ? 9 : theme === "dining" ? 7.5 : 10.5;
  const signY = theme === "dining" ? 4.63 : 3.88;
  const signZ = front + (theme === "dining" ? 1.86 : 0.33);
  const signHeight = theme === "dining" ? 1.25 : 1.55;
  box("tenant-sign-panel", signWidth + 0.6, signHeight, 0.18, palette.trim, -2, signY, signZ);
  addClubhouseSign(facade, signWidth, signHeight - 0.2, -2, signY, signZ + 0.105);

  if (theme === "band") {
    const fins = [];
    for (let x = minX + 0.5; x < maxX; x += 0.32) fins.push([x, (4.8 + sill) / 2, front + 0.16]);
    repeatedBoxes(facade, kit.material("#484c49"), "studio-standing-seam", [0.055, sill - 4.8, 0.16], fins);
    const sideSeams = [];
    for (const x of [minX - 0.19, maxX + 0.19]) {
      box("studio-side-cladding", 0.12, height - 0.32, depth, palette.wall, x, height / 2, centerZ);
      box("studio-side-eave", 0.25, 0.3, depth + 0.14, palette.accent, x, height - 0.3, centerZ);
      const seamX = x + Math.sign(x - centerX) * 0.08;
      for (let z = minZ + 0.35; z < maxZ; z += 0.52) sideSeams.push([seamX, (height - 0.55) / 2, z]);
    }
    repeatedBoxes(facade, kit.material("#515753"), "studio-side-standing-seam", [0.06, height - 0.83, 0.065], sideSeams);
    box("studio-timber-eave", width + 0.8, 0.3, 1.05, palette.accent, centerX, height - 0.3, front + 0.12);
    roofBox("studio-roof-monitor", width * 0.58, 0.7, 3, palette.trim, centerX, height + 0.59, centerZ);
    roofBox("studio-monitor-cap", width * 0.58 + 0.3, 0.14, 3.3, palette.roof, centerX, height + 1.01, centerZ);
    const facadeFill = new THREE.DirectionalLight("#dce8f2", 0.9);
    facadeFill.name = "exterior-view-studio-fill";
    facadeFill.position.set(-16, 7, 4);
    roof.add(facadeFill);
  } else if (theme === "photo") {
    box("gallery-floating-frame-top", width + 0.85, 0.35, 0.9, "#efede5", centerX, height - 0.15, front + 0.2);
    for (const x of [minX + 0.12, maxX - 0.12]) box("gallery-floating-frame-side", 0.5, upperHeight, 0.9, "#efede5", x, bottom + upperHeight / 2, front + 0.2);
    for (const x of [-5, 5]) {
      roofBox("gallery-skylight-curb", 3.3, 0.35, 6.5, palette.trim, x, height + 0.4, centerZ - 1);
      roofBox("gallery-skylight-glass", 3.1, 0.06, 6.3, "#c0ccc5", x, height + 0.61, centerZ - 1);
      for (const z of [-2, 0, 2]) roofBox("gallery-skylight-crossbar", 3.2, 0.06, 0.065, palette.trim, x, height + 0.66, centerZ - 1 + z);
    }
  } else if (theme === "study") {
    const fins = [];
    for (let index = 0; index <= bays; index += 1) fins.push([minX + 1.1 + bayWidth * index, paneCenter, front + 0.52]);
    repeatedBoxes(facade, kit.material(palette.accent), "workspace-timber-solar-fin", [0.14, openingHeight + 0.5, 0.65], fins);
    box("workspace-brow", width + 0.8, 0.16, 1.5, palette.trim, centerX, height - 0.48, front + 0.4);
  } else if (theme === "dining") {
    const canopy = box("supper-house-sloping-awning", width - 0.6, 0.13, 1.85, palette.trim, centerX, 4.9, front + 0.85);
    canopy.rotation.x = 0.14;
    box("supper-house-awning-valance", width - 0.6, 0.25, 0.12, palette.trim, centerX, 4.69, front + 1.77);
    box("supper-house-terracotta-cornice", width + 0.6, 0.3, 0.6, palette.accent, centerX, height - 0.35, front + 0.14);
    const rafters = [];
    for (let x = minX + 0.8; x < maxX; x += 1.2) rafters.push([x, 4.65, front + 0.75]);
    repeatedBoxes(facade, kit.material(palette.accent), "awning-timber-bracket", [0.09, 0.12, 1.4], rafters);
  } else if (theme === "boardgame") {
    const mortar = [];
    for (let y = 3.1; y < height; y += 0.32) {
      if (y < sill || y > head) mortar.push([centerX, y, front + 0.116]);
    }
    repeatedBoxes(facade, kit.material("#c29479"), "library-brick-courses", [width, 0.018, 0.014], mortar);
    for (const y of [4.68, height - 0.55]) box("library-timber-stringcourse", width + 0.5, 0.22, 0.5, palette.accent, centerX, y, front + 0.2);
    box("library-deep-green-cornice", width + 0.9, 0.42, 0.85, palette.trim, centerX, height + 0.3, front + 0.12);
    for (const x of [minX + 0.6, maxX - 0.6]) box("library-timber-pilaster", 0.25, upperHeight, 0.38, palette.accent, x, bottom + upperHeight / 2, front + 0.19);
  } else if (theme === "climbing") {
    box("climbing-identity-spine", 1.3, upperHeight - 0.3, 0.32, palette.accent, maxX - 0.75, bottom + upperHeight / 2, front + 0.3);
    for (const [x, angle] of [[minX + 2, -0.55], [minX + 3.4, 0.55]]) {
      const ridge = box("climbing-summit-mark", 0.22, 2.7, 0.15, palette.accent, x, 3.8, front + 0.34);
      ridge.rotation.z = angle;
    }
    roofBox("climbing-raised-roof-edge", width * 0.48, 0.55, depth + 0.6, palette.trim, minX + width * 0.24, height + 0.56, centerZ);
  }
  return group;
}
