import { BookOpen, Dumbbell, Palette } from "lucide-react";

/** 분야를 한눈에 알아보게 하는 아이콘이다. 기타는 뜻이 넓어 아이콘을 두지 않는다. */
const CATEGORY_ICONS = Object.freeze({
  CULTURE: Palette,
  SPORT: Dumbbell,
  STUDY: BookOpen
});

export function ProposalCategoryIcon({ code, size = 15 }) {
  const Icon = CATEGORY_ICONS[code];
  if (!Icon) return null;
  return <Icon aria-hidden="true" className="proposal-category-icon" data-category-icon={code} size={size} />;
}
