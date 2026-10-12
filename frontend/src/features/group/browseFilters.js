const groupTypes = new Set(["CLUB", "STUDY", "SESSION"]);

export function readGroupBrowseFilters(searchParams) {
  const type = searchParams.get("type");
  const status = searchParams.get("status") === "ENDED" ? "ENDED" : "ACTIVE";
  const recruiting = status === "ENDED" ? null : searchParams.get("recruiting");

  return {
    keyword: searchParams.get("keyword")?.trim() || undefined,
    type: groupTypes.has(type) ? type : undefined,
    status,
    recruiting: recruiting === "true" ? true : recruiting === "false" ? false : undefined,
    size: 12
  };
}
