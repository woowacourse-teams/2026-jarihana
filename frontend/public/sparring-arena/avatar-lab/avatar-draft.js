import { AVATAR_PRESETS, avatarAppearanceKey, readAvatarAppearance } from '../src/avatar-appearance.js';

// Keep history as immutable normalized snapshots, including preset replacements.
export function createAvatarDraft(initial = AVATAR_PRESETS[0].appearance) {
  let current = readAvatarAppearance(initial) ?? readAvatarAppearance(AVATAR_PRESETS[0].appearance);
  const first = { ...current }, past = [], future = [];
  const copy = () => ({ ...current });
  function replace(value) {
    const next = readAvatarAppearance(value);
    if (!next || avatarAppearanceKey(next) === avatarAppearanceKey(current)) return false;
    past.push(current); if (past.length > 50) past.shift();
    current = next; future.length = 0; return true;
  }
  return {
    get: copy,
    replace,
    setPart(key, value) {
      if (!Object.hasOwn(current, key) || key === 'version') return false;
      return replace({ ...current, [key]: value });
    },
    undo() { if (!past.length) return false; future.push(current); current = past.pop(); return true; },
    redo() { if (!future.length) return false; past.push(current); current = future.pop(); return true; },
    reset: () => replace(first),
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    isInitial: () => avatarAppearanceKey(current) === avatarAppearanceKey(first),
  };
}
