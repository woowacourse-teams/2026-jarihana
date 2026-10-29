export function voteColors(capacity, votes) {
  if (!votes.total) return [];
  let count = Math.round(capacity * votes.ratio);
  if (votes.a && votes.b) count = Math.max(1, Math.min(capacity - 1, count));
  return Array.from({ length: capacity }, (_, i) => Math.floor((i + 1) * count / capacity) > Math.floor(i * count / capacity) ? 'a' : 'b');
}
