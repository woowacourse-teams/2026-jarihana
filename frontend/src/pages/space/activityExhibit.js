function activityTarget(link) {
  if (!link || !URL.canParse(link, window.location.origin)) return null;
  const url = new URL(link, window.location.origin);
  const id = url.searchParams.get("post") ?? url.searchParams.get("activity");
  if (!/^[1-9]\d*$/.test(id || "")) return null;
  return `${url.origin}${url.pathname.replace(/\/space$/, "")}:${id}`;
}

export function memoryForExhibit(item, exhibit) {
  if (exhibit === undefined || item.kind !== "memory") return item;
  const target = activityTarget(item.link);
  if (!target) return item;
  const record = exhibit.status === "ready"
    ? exhibit.records.find((entry) => activityTarget(entry.link) === target) : undefined;
  return { ...item, title: record?.title || "활동 기록", photo: record?.photo || "" };
}

export function exhibitRecords(exhibit) {
  return exhibit?.status === "ready" ? exhibit.records.slice(0, 3) : [];
}

export function exhibitMessage(exhibit) {
  if (exhibit?.status === "loading") return "활동을 불러오는 중";
  if (exhibit?.status === "error") return "활동을 불러오지 못했어요";
  if (exhibit?.status === "denied") return "모임원만 볼 수 있어요";
  return "아직 활동 기록이 없어요";
}
