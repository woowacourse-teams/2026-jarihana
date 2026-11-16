import * as THREE from "three";

// Fictional shelf art, not fabricated club memories or third-party game covers.
export function createLibraryCovers(boxes, depth, salt) {
  if (typeof CanvasRenderingContext2D === "undefined") return null;
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d"); if (!ctx) return null;
  const palette = ["#284351", "#ac7144", "#677848", "#eee0b1", "#70434e", "#284c46", "#bd9a60", "#5b4966"];
  const titles = ["RIDGE", "ORBIT", "GARDEN", "NORTH", "ATLAS", "DEEP SEA", "MOSAIC", "ECHO", "TRAIL", "CANOPY", "LANTERN", "ISLAND", "TERRA", "JOURNEY", "FOREST", "NOVA"];
  for (let tile = 0; tile < 16; tile++) {
    const ox = tile % 4 * 128, oy = Math.floor(tile / 4) * 128;
    ctx.save(); ctx.translate(ox, oy);
    ctx.fillStyle = palette[(tile + salt) % palette.length]; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#e7d6ac"; ctx.globalAlpha = 0.25;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(i * 32 - 30, 105); ctx.lineTo(i * 32 + 9, 29 + (i * 11 + tile * 7) % 39);
      ctx.lineTo(i * 32 + 55, 128); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 0.7; ctx.strokeStyle = "#f1e2bc"; ctx.lineWidth = 1;
    ctx.strokeRect(8, 8, 112, 112);
    ctx.beginPath(); ctx.arc(64, 72, 14 + tile % 3 * 7, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = tile === 3 ? "#4d4435" : "#fff0d3";
    ctx.font = "600 16px Georgia"; ctx.textAlign = "center"; ctx.fillText(titles[tile], 64, 30, 105);
    ctx.font = "8px sans-serif"; ctx.fillText("THE TABLE COLLECTION", 64, 110, 102);
    ctx.restore();
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const vertices = [], uvs = [];
  boxes.forEach(({ x, y, width, height, angle }, index) => {
    const tile = (index * 7 + salt) % 16;
    const left = tile % 4 / 4, bottom = 1 - (Math.floor(tile / 4) + 1) / 4;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
      const px = (u - 0.5) * width * 0.94, py = (v - 0.5) * height * 0.94;
      vertices.push(x + px * Math.cos(angle) - py * Math.sin(angle), y + px * Math.sin(angle) + py * Math.cos(angle), 0.04 + depth * 0.36 + 0.003);
      uvs.push(left + (0.004 + u * 0.242), bottom + (0.004 + v * 0.242));
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map, roughness: 0.64 }));
  mesh.name = "illustrated-game-spines"; mesh.receiveShadow = true;
  return mesh;
}
