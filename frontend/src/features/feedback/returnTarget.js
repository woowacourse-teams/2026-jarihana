export function getFeedbackReturnTarget({ hash, pathname, search }) {
  const searchParams = new URLSearchParams(search);
  searchParams.set("feedback", "open");
  return `${pathname}?${searchParams.toString()}${hash}`;
}
