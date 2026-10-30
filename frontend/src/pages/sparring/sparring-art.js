import tug from "../../shared/assets/illustrations/sparring-rival-tug.webp";
import clash from "../../shared/assets/illustrations/sparring-rival-clash.webp";
import lift from "../../shared/assets/illustrations/sparring-rival-lift.webp";

const ART_BY_TONE = { mint: tug, peach: clash, cream: lift, lavender: clash };

export function sparringArt(tone) {
  return ART_BY_TONE[tone] || tug;
}
