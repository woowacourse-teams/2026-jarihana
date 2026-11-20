const prefix = process.env.APP_DEPLOY_ENV === "production" ? "jarihana" : "jarihana-dev";
const root = `https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com/${prefix}/images/games/chair-stack`;
const spriteSet = {
  sources: {
    red: `${root}/red-side-chair-ba5ae0a3580d.webp`,
    yellow: `${root}/yellow-side-chair-8263e85a3105.webp`,
    green: `${root}/green-side-chair-8d26c45c03f2.webp`,
    blue: `${root}/blue-side-chair-25cb3c410682.webp`
  },
  images: {}
};

export const CHAIR_HEIGHT = 14;
export const TOY_WIDTH = 14;
export const TOY_HEIGHT = 24;

const flatColors = { red: "#ee4947", yellow: "#f3c222", green: "#7ac632", blue: "#239eda" };
const frontViewRails = [
  [0, 0, 2.1, 24],
  [11.9, 0, 2.1, 24],
  [2.1, 1.65, 9.8, 1.8],
  [2.1, 6.9, 9.8, 1.8],
  [2.1, 12.1, 9.8, 2.25]
];

export function loadToySprites() {
  spriteSet.loading ??= Promise.all(Object.entries(spriteSet.sources).map(async ([color, source]) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    spriteSet.images[color] = image;
  })).catch(() => { spriteSet.loading = null; });
  return spriteSet.loading;
}

export function paintChair(ctx, x, y, unit, color, orientation = 0, rotation = 0, legacyWidth) {
  const image = spriteSet.images[color];
  if (!image) return;
  const sideways = (orientation & 1) !== 0;
  const width = (legacyWidth ?? TOY_WIDTH) * unit;
  const height = (legacyWidth ? CHAIR_HEIGHT : TOY_HEIGHT) * unit;
  ctx.save();
  ctx.translate(x, y - (sideways ? width : height) / 2);
  ctx.rotate((orientation & 3) * Math.PI / 2 + rotation);
  ctx.scale((orientation & 4) ? -1 : 1, (orientation & 8) ? -1 : 1);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

export function fitCanvas(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  if (width <= 0 || height <= 0) return { ctx: null, width, height };
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const pixelWidth = Math.max(1, Math.round(width * ratio));
  const pixelHeight = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

export function paintPhysicsChair(ctx, x, y, pixelsPerMeter, piece, angle) {
  const image = spriteSet.images[piece.color];
  if ((!piece.flat || piece.sideProfile) && !image) return;
  const width = TOY_WIDTH / 10 * piece.widthScale * pixelsPerMeter;
  const height = TOY_HEIGHT / 10 * piece.heightScale * pixelsPerMeter;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-angle);
  if (piece.mirror) ctx.scale(-1, 1);
  if (piece.sideProfile) {
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
  } else if (piece.flat) {
    ctx.scale(width / TOY_WIDTH, height / TOY_HEIGHT);
    ctx.fillStyle = flatColors[piece.color];
    ctx.beginPath();
    for (const [left, top, railWidth, railHeight] of frontViewRails) {
      ctx.rect(left - TOY_WIDTH / 2, top - TOY_HEIGHT / 2, railWidth, railHeight);
    }
    ctx.fill();
  } else {
    ctx.transform(1, piece.verticalShear * piece.heightScale / piece.widthScale, 0, 1, 0, 0);
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
  }
  ctx.restore();
}

export function paintSideChair(ctx, x, bottom, unit, color, angle = 0) {
  const halfHeight = (Math.abs(Math.cos(angle)) * TOY_HEIGHT + Math.abs(Math.sin(angle)) * TOY_WIDTH) / 2;
  paintPhysicsChair(ctx, x, bottom - halfHeight * unit, unit * 10,
    { color, flat: true, sideProfile: true, widthScale: 1, heightScale: 1 }, angle);
}
