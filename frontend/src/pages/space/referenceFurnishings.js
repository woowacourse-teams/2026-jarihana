import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const REFERENCE_FURNISHINGS = Object.freeze([
  { kind: "coffeeTable", name: "낮은 원목 커피 테이블", width: 2.4, depth: 1.3, height: 0.76 },
  { kind: "cafeTable", name: "테라스 원형 테이블", width: 1.3, depth: 1.3, height: 1 },
  { kind: "leafyPlant", name: "풍성한 실내 나무", width: 1.3, depth: 1.3, height: 2.25 },
  { kind: "vinePlanter", name: "늘어지는 벽 화분", width: 1.5, depth: 0.8, height: 3.3, mount: "wall" },
  { kind: "galleryWall", name: "높은 벽 사진 전시", width: 4.4, depth: 0.24, height: 6.8, mount: "wall", collection: "photo" },
  { kind: "posterWall", name: "연습실 포스터 벽", width: 4.4, depth: 0.24, height: 3.9, mount: "wall", collection: "band" },
  ...["band", "dining", "study", "photo"].map((theme) => ({ kind: `${theme}Neon`, name: ({ band: "Play 네온", dining: "Good Food 사인", study: "Better Together 사인", photo: "Capture Together 사인" })[theme], width: 3.8, depth: 0.35, height: theme === "photo" ? 7.2 : 3.9, mount: "wall", collection: theme }))
].map((asset) => Object.freeze({ category: "furniture", collection: "common", ...asset })));

// Each furnishing owns its buffers and materials; edits/deletions cannot invalidate another copy.
export function createReferenceFurnishing(kind, { color } = {}) {
  if (!REFERENCE_FURNISHINGS.some((asset) => asset.kind === kind)) return null;
  const group = new THREE.Group();
  group.name = kind;
  group.userData.assetKind = kind;
  const materials = new Map();
  const foliage = [];
  const material = (tint) => {
    if (!materials.has(tint)) materials.set(tint, new THREE.MeshStandardMaterial({ color: tint, roughness: 0.77 }));
    return materials.get(tint);
  };
  function mesh(geometry, tint, x, y, z) {
    const object = new THREE.Mesh(geometry, material(tint));
    object.position.set(x, y, z);
    object.castShadow = object.receiveShadow = true;
    group.add(object);
    return object;
  }
  const box = (w, h, d, tint, x, y, z, radius = 0.02) => mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, h / 3)), tint, x, y, z);
  const cylinder = (r1, r2, h, tint, x, y, z) => mesh(new THREE.CylinderGeometry(r1, r2, h, 20), tint, x, y, z);
  function branch(start, end, thickness = 0.012) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const stem = cylinder(thickness, thickness * 1.3, a.distanceTo(b), "#626548", 0, 0, 0);
    stem.position.copy(a).add(b).multiplyScalar(0.5);
    stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    foliage.push(stem);
  }
  function leaf(x, y, z, length, angle, index) {
    const points = [], normals = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const width = Math.sin(t * Math.PI) * length * 0.32;
      for (const side of [-1, 1]) points.push(side * width, Math.sin(t * Math.PI) * length * 0.13, t * length);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    for (let i = 0; i < 8; i++) { const n = i * 2; normals.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
    geometry.setIndex(normals); geometry.computeVertexNormals();
    const object = mesh(geometry, ["#587344", "#70894b", "#829651", "#466640"][index % 4], x, y, z);
    object.material.side = THREE.DoubleSide;
    object.rotation.set(-0.3 + (index % 3) * 0.18, angle, (index % 2 ? 1 : -1) * 0.14);
    object.name = "curved-leaf";
    foliage.push(object);
    return object;
  }
  if (kind === "leafyPlant") {
    cylinder(0.27, 0.2, 0.46, color || "#d5c6ad", 0, 0.23, 0);
    cylinder(0.25, 0.25, 0.025, "#69503c", 0, 0.46, 0);
    for (let stem = 0; stem < 8; stem++) {
      const angle = stem * 2.4;
      const x = Math.sin(angle) * 0.19, z = Math.cos(angle) * 0.19;
      const height = 1.3 + (stem % 3) * 0.32;
      branch([0, 0.46, 0], [x, height, z], 0.018);
      for (let j = 0; j < 7; j++) leaf(x, height - j * 0.14, z, 0.39 + j % 2 * 0.04, angle + j * 2.3, j + stem);
    }
  } else if (kind === "vinePlanter") {
    box(1.1, 0.045, 0.52, "#926e49", 0, 2.95, 0);
    for (const [i, x] of [-0.35, 0.25].entries()) {
      cylinder(0.18, 0.13, 0.26, color || "#bc9268", x, 3.1, 0);
      for (let strand = 0; strand < 5; strand++) {
        const sx = x + strand * 0.08 - 0.16;
        for (let j = 0; j < 10; j++) {
          const y = 3.18 - j * (0.19 + strand % 3 * 0.025);
          const px = sx + Math.sin(j * 0.8 + strand) * 0.04;
          branch([px, y, 0.17], [px + 0.02, y - 0.24, 0.19], 0.006);
          const blade=leaf(px, y, 0.19, 0.16 + j % 2 * 0.025, (j % 2 ? 1 : -1) * 1.4 + i, j);
          blade.rotation.x=0.95+(j%3)*0.12;
        }
      }
    }
  } else if (kind === "galleryWall" || kind === "posterWall") {
    const photos = kind === "galleryWall";
    // Decorative landscapes/posters are not fabricated member activity records.
    for (let i = 0; i < 6; i++) {
      const x = (i % 3 - 1) * 1.45, y = (photos ? 4.4 : 1.5) + Math.floor(i / 3) * 1.55;
      const w = 1.23, h = 1.35;
      box(w, h, 0.085, color || (photos ? "#463e38" : "#9d8067"), x, y, 0);
      box(w - 0.07, h - 0.07, 0.012, "#e5dfd0", x, y, 0.05);
      const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
      const ctx = typeof CanvasRenderingContext2D !== "undefined" ? canvas?.getContext("2d") : null;
      let map = null;
      if (ctx) {
        canvas.width = 256; canvas.height = 288;
        const palettes = photos ? [["#b9b5a5", "#747e6d", "#3d555c"], ["#b3bac2", "#7b858a", "#535c61"], ["#c5a58a", "#8c7867", "#4e5453"]] : [["#a16457", "#dccb9a", "#3c353d"], ["#5d7882", "#ddd0b3", "#303a42"], ["#b49264", "#e4d5ae", "#514455"]];
        const palette = palettes[i % 3];
        ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, 256, 288);
        if (photos) {
          ctx.fillStyle = "#e4d7b8"; ctx.beginPath(); ctx.arc(182, 69, 27, 0, Math.PI * 2); ctx.fill();
          for (let layer = 0; layer < 2; layer++) {
            ctx.fillStyle = palette[layer + 1]; ctx.beginPath(); ctx.moveTo(0, 165 + layer * 43);
            for (let n = 0; n <= 6; n++) ctx.lineTo(n * 48, 150 + layer * 52 + Math.sin(n * 1.7 + i + layer) * 33);
            ctx.lineTo(256, 288); ctx.lineTo(0, 288); ctx.closePath(); ctx.fill();
          }
        } else {
          ctx.fillStyle = palette[1]; ctx.font = "bold 35px sans-serif"; ctx.textAlign = "center";
          ctx.fillText(["LIVE", "SOUND", "STUDIO"][i % 3], 128, 63);
          ctx.strokeStyle = palette[2]; ctx.lineWidth = 11; ctx.beginPath();
          for (let n = 0; n < 11; n++) ctx.lineTo(24 + n * 21, 165 + Math.sin(n * 1.3 + i) * 37);
          ctx.stroke(); ctx.fillStyle = palette[1]; ctx.fillRect(40, 244, 176, 5);
        }
        map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
      }
      const print = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.22, h - 0.22), new THREE.MeshStandardMaterial({ map, color: map ? "#ffffff" : "#80908a", roughness: 0.85 }));
      print.name = "decorative-wall-print"; print.position.set(x, y, 0.062); group.add(print);
    }
  } else if (kind === "coffeeTable" || kind === "cafeTable") {
    const round = kind === "cafeTable", y = round ? 0.74 : 0.45;
    if (round) {
      cylinder(0.64, 0.64, 0.07, color || "#e4d6bc", 0, y, 0);
      cylinder(0.055, 0.065, y, "#62605a", 0, y / 2, 0);
      cylinder(0.3, 0.34, 0.06, "#62605a", 0, 0.03, 0);
    } else {
      box(2.4, 0.1, 1.3, color || "#b78d60", 0, y, 0, 0.035);
      for (const x of [-0.94, 0.94]) for (const z of [-0.43, 0.43]) box(0.075, y, 0.075, "#66513c", x, y / 2, z);
      box(0.52, 0.055, 0.38, "#81918c", -0.6, y + 0.08, 0.08);
      box(0.47, 0.04, 0.34, "#e0cda9", -0.57, y + 0.127, 0.05);
    }
  } else {
    const theme = kind.replace("Neon", "");
    const [lines, defaultTint] = ({band: [["Play"], "#ed69cf"], dining: [["Good Food", "Good Friends"], "#d95c30"], study: [["Better", "Together"], "#9580e5"], photo: [["Capture", "Together"], "#ffe2c0"]})[theme];
    const tint = color || defaultTint;
    const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
    const ctx = typeof CanvasRenderingContext2D !== "undefined" ? canvas?.getContext("2d") : null;
    let map = null;
    if (ctx) {
      canvas.width = 1024; canvas.height = 512;
      ctx.font = '125px "Apple Chancery", "Brush Script MT", cursive'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = tint; ctx.shadowBlur = 22; ctx.fillStyle = tint;
      lines.forEach((line, i) => ctx.fillText(line, 512, lines.length === 1 ? 256 : 165 + i * 180, 930));
      map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    }
    const strength = theme === "dining" ? 1.1 : 2.1;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 1.8), new THREE.MeshStandardMaterial({ map, emissiveMap: map, color: "#171216", emissive: map ? "#ffffff" : tint, emissiveIntensity: strength, toneMapped: false, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    sign.position.set(0, theme === "photo" ? 6.2 : 2.95, 0.03);
    sign.userData.roomBulb = true; sign.userData.roomBulbColor = map ? "#ffffff" : tint; sign.userData.roomBulbStrength = strength; group.add(sign);
    const light = new THREE.PointLight(tint, 5, 8, 1.5);
    light.position.set(0, theme === "photo" ? 6 : 2.7, 0.15); light.userData.roomLamp = true; light.userData.roomLampStrength = 5;
    light.userData.roomLampColor = tint; group.add(light);
  }
  // Static leaves and stems share one draw per material within each editable plant.
  const batches = new Map();
  for (const object of foliage) {
    object.updateMatrix();
    object.geometry.applyMatrix4(object.matrix);
    if (!batches.has(object.material)) batches.set(object.material, []);
    batches.get(object.material).push(object.geometry);
    group.remove(object);
  }
  for (const [surface, geometries] of batches) {
    const batch = new THREE.Mesh(mergeGeometries(geometries), surface);
    batch.name = surface.side === THREE.DoubleSide ? "curved-leaf" : "plant-stems";
    batch.castShadow = batch.receiveShadow = true;
    group.add(batch);
    for (const geometry of geometries) geometry.dispose();
  }
  return group;
}
