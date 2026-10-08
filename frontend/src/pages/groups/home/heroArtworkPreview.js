const classicHeroImages = {};

export function getHeroArtworkImageName(version, period) {
  if (version === "classic") {
    return `jarihana-hero-${period}-classic.png`;
  }

  if (version === "refined") {
    return `jarihana-hero-${period}-refined.png`;
  }

  if (version === "nebula") {
    return period === "night"
      ? "jarihana-hero-night-nebula.png"
      : `jarihana-hero-${period}-classic.png`;
  }

  return "";
}

function loadClassicHeroImage(period) {
  if (process.env.NODE_ENV !== "development") {
    return "";
  }

  if (!classicHeroImages[period]) {
    const imageName = getHeroArtworkImageName("classic", period);
    switch (imageName) {
      case "jarihana-hero-day-classic.png":
        classicHeroImages.day = require("../../../shared/assets/brand/jarihana-hero-day-classic.png");
        break;
      case "jarihana-hero-sunset-classic.png":
        classicHeroImages.sunset = require("../../../shared/assets/brand/jarihana-hero-sunset-classic.png");
        break;
      case "jarihana-hero-night-classic.png":
        classicHeroImages.night = require("../../../shared/assets/brand/jarihana-hero-night-classic.png");
        break;
      default:
        return "";
    }
  }

  const image = classicHeroImages[period];
  return typeof image === "string" ? image : image.default || image;
}

function loadRefinedHeroImage(period) {
  if (process.env.NODE_ENV !== "development") {
    return "";
  }

  const cacheKey = `${period}Refined`;
  if (!classicHeroImages[cacheKey]) {
    const imageName = getHeroArtworkImageName("refined", period);
    switch (imageName) {
      case "jarihana-hero-day-refined.png":
        classicHeroImages.dayRefined = require("../../../shared/assets/brand/jarihana-hero-day-refined.png");
        break;
      case "jarihana-hero-sunset-refined.png":
        classicHeroImages.sunsetRefined = require("../../../shared/assets/brand/jarihana-hero-sunset-refined.png");
        break;
      case "jarihana-hero-night-refined.png":
        classicHeroImages.nightRefined = require("../../../shared/assets/brand/jarihana-hero-night-refined.png");
        break;
      default:
        return "";
    }
  }

  const image = classicHeroImages[cacheKey];
  return typeof image === "string" ? image : image.default || image;
}

function loadNebulaHeroImage(period) {
  if (period !== "night") {
    return loadClassicHeroImage(period);
  }

  if (process.env.NODE_ENV !== "development") {
    return "";
  }

  if (!classicHeroImages.nebulaNight) {
    classicHeroImages.nebulaNight = require("../../../shared/assets/brand/jarihana-hero-night-nebula.png");
  }

  const image = classicHeroImages.nebulaNight;
  return typeof image === "string" ? image : image.default || image;
}

export function getHeroArtworkStyle(version, period) {
  if (version !== "classic" && version !== "nebula" && version !== "refined") {
    return undefined;
  }

  const image = version === "nebula"
    ? loadNebulaHeroImage(period)
    : version === "refined"
      ? loadRefinedHeroImage(period)
      : loadClassicHeroImage(period);
  return image ? { "--reference-hero-image": `url("${image}")` } : undefined;
}
