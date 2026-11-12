const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const VIDEO = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST = /^[A-Za-z0-9_-]{10,100}$/;

export function parseYoutubeUrl(value) {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || /^https:\/\/[^/]*:\d+(?:\/|$)/i.test(value)) return null;
    const list = url.searchParams.get("list");
    if (list !== null && !PLAYLIST.test(list)) return null;
    let videoId;
    if (url.hostname === "youtu.be") videoId = url.pathname.slice(1);
    else if (HOSTS.has(url.hostname)) {
      if (url.pathname === "/playlist") return list ? { playlistId: list, videoId: null } : null;
      if (url.pathname === "/watch") videoId = url.searchParams.get("v");
      else videoId = /^\/(?:shorts|embed)\/([^/]+)$/.exec(url.pathname)?.[1];
    } else return null;
    return VIDEO.test(videoId ?? "") ? { videoId, playlistId: list } : null;
  } catch { return null; }
}
