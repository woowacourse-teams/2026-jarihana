const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

export function characterVariant(post = {}) {
  if (post.memberType === 'CREW') return 0;
  if (post.memberType === 'COACH') return 1;
  const identity = String(post.authorId ?? post.name ?? post.id ?? 'guest');
  let hash = 0;
  for (const char of identity) hash = (Math.imul(hash, 31) + char.codePointAt(0)) >>> 0;
  return hash % 2;
}

export function characterPose({ phase, elapsed = 0, fresh = false, mine = false, reduced = false } = {}) {
  if (phase !== 'open') {
    const rolling = phase === 'rolling' && !reduced;
    return { stage: rolling ? 'bracing' : 'packed', crouch: 0.9, scale: 0.31, lift: -0.34, lean: rolling ? Math.sin(elapsed * 22) * 0.16 : 0,
      head: rolling ? -0.16 : 0.04, leftArm: -0.95, rightArm: -0.95, wave: 0, closing: 0, shrink: 1, speaking: false };
  }
  const duration = fresh ? 9 : 5;
  const rise = reduced ? 1 : smooth((elapsed - 0.1) / 0.45);
  const closing = reduced ? 0 : smooth((elapsed - duration + 0.7) / 0.5);
  const gesture = reduced || !fresh ? 0 : smooth((elapsed - 0.45) / 0.2) * (1 - smooth((elapsed - 1.5) / 0.55));
  const wave = fresh && mine ? gesture * (0.3 + Math.sin(elapsed * 15) * 0.22) : 0;
  return {
    stage: closing > 0 ? 'returning' : rise < 1 ? 'peeking' : gesture > 0.05 ? 'greeting' : 'speaking',
    scale: (0.31 + rise * (fresh ? 0.23 : 0.16)) * (1 - closing * 0.35),
    lift: -0.34 + rise * 0.22 - closing * 0.25,
    lean: reduced ? 0 : Math.sin(elapsed * 11) * Math.exp(-elapsed * 3) * 0.18,
    head: reduced ? 0 : Math.sin(elapsed * 8) * gesture * 0.09,
    leftArm: -0.95 + rise * 0.8,
    rightArm: -0.95 + rise * 0.75 - gesture * (mine ? 1.9 : 0.7), wave,
    closing, shrink: reduced ? 1 : 1 - smooth((elapsed - duration + 0.2) / 0.2), speaking: reduced || elapsed >= 0.42,
  };
}
