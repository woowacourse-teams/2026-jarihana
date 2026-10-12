import { useLayoutEffect, useRef } from "react";

export function fittedPhotoSize(width, height, naturalWidth, naturalHeight, fit) {
  const scale = (fit === "contain" ? Math.min : Math.max)(width / naturalWidth, height / naturalHeight);
  return `${naturalWidth * scale}px ${naturalHeight * scale}px`;
}

function readPhoto(frame) {
  const image = frame?.querySelector("img");
  if (!image?.complete || !image.naturalWidth || !image.naturalHeight) return null;
  const bounds = image.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return null;

  let background = "transparent";
  for (let element = frame; element; element = element.parentElement) {
    const color = getComputedStyle(element).backgroundColor;
    if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
      background = color;
      break;
    }
  }

  return {
    url: image.currentSrc || image.src,
    size: fittedPhotoSize(bounds.width, bounds.height, image.naturalWidth, image.naturalHeight, getComputedStyle(image).objectFit),
    background
  };
}

export function useGroupPhotoTransition(pathname, source) {
  const previous = useRef(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const frame = document.querySelector(".group-detail-page .group-profile__art, [data-group-transition-source] [data-group-transition-image]");
    const photo = readPhoto(frame);
    const from = previous.current;

    if (photo && from && from.pathname !== pathname && from.url === photo.url) {
      root.dataset.groupPhotoMotion = "true";
      root.style.setProperty("--group-photo-url", `url(${JSON.stringify(photo.url)})`);
      root.style.setProperty("--group-photo-from-size", from.size);
      root.style.setProperty("--group-photo-to-size", photo.size);
      root.style.setProperty("--group-photo-from-background", from.background);
      root.style.setProperty("--group-photo-to-background", photo.background);
    } else {
      delete root.dataset.groupPhotoMotion;
    }

    const remember = () => {
      const current = readPhoto(frame);
      previous.current = current ? { ...current, pathname } : null;
    };
    remember();
    if (!frame) return undefined;
    const image = frame.querySelector("img");
    image?.addEventListener("load", remember);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(remember);
    observer?.observe(frame);
    return () => {
      image?.removeEventListener("load", remember);
      observer?.disconnect();
    };
  }, [pathname, source]);
}
