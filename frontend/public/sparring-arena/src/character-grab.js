export function createCharacterGrab(field, { start, move, end, wake }) {
  const document = field.ownerDocument, window = document.defaultView;
  const bindings = new Map();
  let held = null, pending = null, disposed = false;

  function mark(button, grabbed, dragOnly = false) {
    button.dataset.grabbed = String(grabbed);
    if (!dragOnly) button.setAttribute('aria-pressed', String(grabbed));
  }

  function release(gesture) {
    if (gesture.pointerId === null) return;
    try {
      gesture.button.releasePointerCapture?.(gesture.pointerId);
    } catch (_error) {
      // Capture may already be released by the browser's cancellation path.
    }
  }

  function clearPending() {
    const previous = pending;
    pending = null;
    if (previous) release(previous);
  }

  function finish(cancelled) {
    if (!held) return;
    const previous = held;
    held = null;
    mark(previous.button, false, previous.dragOnly);
    release(previous);
    end(previous.item, cancelled);
    wake();
  }

  function pointerMove(event) {
    if (pending?.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < 6) return;
      const candidate = pending;
      pending = null;
      if (!candidate.begin(event)) release(candidate);
      return;
    }
    if (!held || held.pointerId === null || held.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - held.x, dy = event.clientY - held.y;
    held.x = event.clientX; held.y = event.clientY;
    move(held.item, dx, dy);
    wake();
  }

  function pointerEnd(event) {
    if (pending?.pointerId === event.pointerId) {
      if (event.type !== 'lostpointercapture' || event.currentTarget === pending.button) clearPending();
      return;
    }
    if (!held || held.pointerId === null || held.pointerId !== event.pointerId) return;
    if (event.type === 'lostpointercapture' && event.currentTarget !== held.button) return;
    event.preventDefault();
    if (event.type === 'pointerup') {
      const dx = event.clientX - held.x, dy = event.clientY - held.y;
      if (dx || dy) move(held.item, dx, dy);
    }
    finish(event.type !== 'pointerup');
  }

  function cancel() { clearPending(); finish(true); }
  function visibilityChange() { if (document.hidden) cancel(); }
  function escape(event) {
    if (event.key !== 'Escape' || (!held && !pending)) return;
    event.preventDefault();
    cancel();
  }

  window.addEventListener('pointermove', pointerMove, { passive: false });
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);
  window.addEventListener('blur', cancel);
  window.addEventListener('keydown', escape);
  document.addEventListener('visibilitychange', visibilityChange);

  function bind(button, item, { dragOnly = false } = {}) {
    if (disposed) return;
    bindings.get(button)?.();
    mark(button, false, dragOnly);
    let suppressClick = false;

    function begin(event) {
      suppressClick = dragOnly;
      if (button.disabled) return false;
      const bounds = field.getBoundingClientRect();
      if (!start(item, { x: event.clientX - bounds.left, y: event.clientY - bounds.top })) return false;
      held = { button, item, dragOnly, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      event.preventDefault();
      mark(button, true, dragOnly);
      capture(event);
      button.blur();
      wake();
      return true;
    }

    function capture(event) {
      try {
        button.setPointerCapture?.(event.pointerId);
      } catch (_error) {
        // Window listeners still finish the gesture if capture is unavailable.
      }
    }

    function pointerDown(event) {
      if (held || pending || button.disabled || event.button !== 0 || event.isPrimary === false) return;
      suppressClick = false;
      if (!dragOnly) { begin(event); return; }
      pending = { button, pointerId: event.pointerId, x: event.clientX, y: event.clientY, begin };
      // Keep pointer focus from pausing the replay while deciding between tap and drag.
      event.preventDefault();
      capture(event);
    }

    function keyDown(event) {
      if (dragOnly) { suppressClick = false; return; }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (event.repeat || button.disabled || pending || (held && (held.button !== button || held.pointerId !== null))) return;
        if (held) finish(false);
        else if (start(item)) {
          held = { button, item, pointerId: null };
          mark(button, true);
          wake();
        }
        return;
      }
      if (!held || held.button !== button || held.pointerId !== null) return;
      const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const step = event.shiftKey ? 28 : 14;
      move(item, direction[0] * step, direction[1] * step);
      wake();
    }

    function click(event) {
      if (dragOnly && !suppressClick) return;
      event.preventDefault();
      if (dragOnly) { suppressClick = false; event.stopImmediatePropagation(); }
    }
    function focusOut() {
      if (held?.button === button && held.pointerId === null) cancel();
    }
    button.addEventListener('pointerdown', pointerDown);
    button.addEventListener('lostpointercapture', pointerEnd);
    button.addEventListener('keydown', keyDown);
    button.addEventListener('click', click, true);
    button.addEventListener('focusout', focusOut);
    function unbind() {
      if (held?.button === button || pending?.button === button) cancel();
      button.removeEventListener('pointerdown', pointerDown);
      button.removeEventListener('lostpointercapture', pointerEnd);
      button.removeEventListener('keydown', keyDown);
      button.removeEventListener('click', click, true);
      button.removeEventListener('focusout', focusOut);
      bindings.delete(button);
    }
    bindings.set(button, unbind);
    return unbind;
  }

  return {
    bind, cancel, active: () => held?.item ?? null,
    dispose() {
      disposed = true;
      cancel();
      for (const unbind of bindings.values()) unbind();
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerEnd);
      window.removeEventListener('pointercancel', pointerEnd);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape);
      document.removeEventListener('visibilitychange', visibilityChange);
    },
  };
}
