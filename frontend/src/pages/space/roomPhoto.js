import { MAX_PHOTO_LENGTH } from "./roomState";

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function prepareRoomPhoto(file) {
  if (!file || !PHOTO_TYPES.has(file.type)) throw new Error("JPG, PNG, WebP 사진을 골라 주세요.");
  if (file.size > 5 * 1024 * 1024) throw new Error("사진은 5MB 이하로 골라 주세요.");
  const source = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const candidate = new window.Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error("사진을 읽지 못했어요. 다른 사진을 골라 주세요."));
      candidate.src = source;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("사진의 크기를 확인할 수 없어요.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이 브라우저에서 사진을 준비하지 못했어요.");
    for (const edge of [640, 480, 320]) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = "#fffaf2";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.82, 0.65, 0.48]) {
        const photo = canvas.toDataURL("image/jpeg", quality);
        if (photo.startsWith("data:image/jpeg;base64,") && photo.length <= MAX_PHOTO_LENGTH) return photo;
      }
    }
    throw new Error("사진을 충분히 줄이지 못했어요. 더 작은 사진을 골라 주세요.");
  } finally {
    URL.revokeObjectURL(source);
  }
}
