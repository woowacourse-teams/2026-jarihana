export function stampMusicSnapshot(snapshot, receivedAt = performance.now()) {
  return { ...snapshot, receivedAt };
}

export function acceptMusicSnapshot(current, incoming) {
  if (!current) return incoming;
  if (incoming.revision < current.revision || incoming.playback.revision < current.playback.revision) return current;
  if (incoming.revision === current.revision && incoming.playback.revision === current.playback.revision &&
    Date.parse(incoming.serverTime) < Date.parse(current.serverTime)) return current;
  return incoming;
}

export function playbackPosition(snapshot, now = performance.now()) {
  const playback = snapshot.playback;
  if (playback.state === "PAUSED") return playback.positionSeconds;
  const atReceipt = (Date.parse(snapshot.serverTime) - Date.parse(playback.anchorTime)) / 1000;
  return Math.max(0, playback.positionSeconds + atReceipt + Math.max(0, now - snapshot.receivedAt) / 1000);
}

export function createTimelineFollower({ source, getSnapshot, getPlayer, isListening, isBlocked, onAdvance, now = () => performance.now() }) {
  const durations = new Map();
  let initial = true;
  let lastRevision = null;
  let loadingTrack = null;
  let lastCorrection = -Infinity;
  let lastAdvance = -Infinity;
  let advancing = false;

  return function synchronize({ force = false, ended = false } = {}) {
    const target = getPlayer();
    const snapshot = getSnapshot();
    if (!target || !snapshot) return;
    const timeline = snapshot.playback;
    const desired = playbackPosition(snapshot, now());
    const revisionChanged = lastRevision !== timeline.revision;
    lastRevision = timeline.revision;
    const actualIndex = source.playlistId ? target.getPlaylistIndex() : 0;
    const duration = target.getDuration();
    if (actualIndex >= 0 && Number.isFinite(duration) && duration > 0) durations.set(actualIndex, duration);
    const trackDuration = snapshot.music.durationSeconds ?? durations.get(timeline.playlistIndex);
    const playerState = target.getPlayerState();

    if (!isListening()) {
      if (playerState === 1 || playerState === 3) target.pauseVideo();
      return;
    }
    if (timeline.state === "PLAYING" && (ended || (trackDuration && desired >= trackDuration))) {
      if (!advancing && now() - lastAdvance >= 10000) {
        lastAdvance = now(); advancing = true;
        Promise.resolve().then(() => onAdvance({ expectedRevision: timeline.revision })).catch(() => undefined).finally(() => { advancing = false; });
      }
      if (playerState === 1 || playerState === 3) target.pauseVideo();
      return;
    }
    if (isBlocked() && !force) return;
    const trackKey = `${timeline.revision}:${timeline.playlistIndex}`;
    if (source.playlistId && (initial || actualIndex !== timeline.playlistIndex)) {
      if (loadingTrack !== trackKey || force) {
        loadingTrack = trackKey;
        const options = { listType: "playlist", list: source.playlistId,
          index: timeline.playlistIndex, startSeconds: desired };
        if (timeline.state === "PLAYING") target.loadPlaylist(options);
        else target.cuePlaylist(options);
        initial = false; lastCorrection = now();
      }
      return;
    }
    loadingTrack = null;
    if (initial && timeline.state === "PAUSED") {
      target.cueVideoById({ videoId: source.videoId, startSeconds: desired });
      initial = false; lastCorrection = now();
      return;
    }
    const actual = target.getCurrentTime();
    if ((initial || force || Math.abs(actual - desired) > 2) && (force || initial || revisionChanged || now() - lastCorrection >= 1500)) {
      target.seekTo(desired, true); lastCorrection = now();
    }
    initial = false;
    if (timeline.state === "PLAYING" && playerState !== 1 && playerState !== 3) target.playVideo();
    if (timeline.state === "PAUSED" && (playerState === 1 || playerState === 3)) target.pauseVideo();
  };
}
