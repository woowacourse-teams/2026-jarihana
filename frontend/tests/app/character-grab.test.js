import { createCharacterGrab } from '../../public/sparring-arena/src/character-grab.js';

function pointer(target, type, values = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 80 }, values);
  target.dispatchEvent(event);
  return event;
}

function key(target, value, options = {}) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: value, ...options });
  target.dispatchEvent(event);
  return event;
}

describe('character grab controller', () => {
  let field, button, item, callbacks, grab;
  beforeEach(() => {
    document.body.innerHTML = '<form><div id="field"><button>Character</button></div></form>';
    field = document.querySelector('#field'); button = field.querySelector('button');
    item = { id: 'character' };
    callbacks = { start: jest.fn(() => true), move: jest.fn(), end: jest.fn(), wake: jest.fn() };
    button.setPointerCapture = jest.fn(); button.releasePointerCapture = jest.fn();
    grab = createCharacterGrab(field, callbacks);
    grab.bind(button, item);
  });
  afterEach(() => { grab.dispose(); document.body.replaceChildren(); });

  it('leaves touch swipes on characters to the browser without grabbing or capturing', () => {
    expect(pointer(button, 'pointerdown', { pointerType: 'touch' }).defaultPrevented).toBe(false);
    expect(pointer(window, 'pointermove', { pointerType: 'touch', clientY: 180 }).defaultPrevented).toBe(false);
    pointer(window, 'pointerup', { pointerType: 'touch', clientY: 180 });
    expect(callbacks.start).not.toHaveBeenCalled();
    expect(callbacks.move).not.toHaveBeenCalled();
    expect(button.setPointerCapture).not.toHaveBeenCalled();
    expect(grab.active()).toBeNull();
  });

  describe('speech bubble drag', () => {
    let speech, reply;
    beforeEach(() => {
      speech = document.createElement('button'); speech.type = 'button'; field.append(speech);
      speech.setPointerCapture = jest.fn(); speech.releasePointerCapture = jest.fn();
      reply = jest.fn(); speech.addEventListener('click', reply);
      grab.bind(speech, item, { dragOnly: true });
    });

    it('keeps a tap and keyboard activation as reply clicks without starting a grab', () => {
      expect(pointer(speech, 'pointerdown').defaultPrevented).toBe(true);
      pointer(window, 'pointermove', { clientX: 103 });
      pointer(window, 'pointerup', { clientX: 103 });
      speech.click();
      expect(key(speech, 'Enter').defaultPrevented).toBe(false); speech.click();
      expect(key(speech, ' ').defaultPrevented).toBe(false);
      expect(reply).toHaveBeenCalledTimes(2);
      expect(callbacks.start).not.toHaveBeenCalled();
      expect(callbacks.end).not.toHaveBeenCalled();
      expect(speech.releasePointerCapture).toHaveBeenCalledWith(1);
      expect(speech).not.toHaveAttribute('aria-pressed');
    });

    it('allows touch scrolling and reply taps without starting a bubble drag', () => {
      expect(pointer(speech, 'pointerdown', { pointerType: 'touch' }).defaultPrevented).toBe(false);
      expect(pointer(window, 'pointermove', { pointerType: 'touch', clientY: 180 }).defaultPrevented).toBe(false);
      pointer(window, 'pointercancel', { pointerType: 'touch' });
      pointer(speech, 'pointerdown', { pointerType: 'touch' });
      pointer(window, 'pointerup', { pointerType: 'touch' });
      speech.click();
      expect(reply).toHaveBeenCalledTimes(1);
      expect(callbacks.start).not.toHaveBeenCalled();
      expect(speech.setPointerCapture).not.toHaveBeenCalled();
    });

    it('starts at the dragged pointer and suppresses the release click before existing reply listeners', () => {
      pointer(speech, 'pointerdown');
      pointer(window, 'pointermove', { pointerId: 2, clientX: 150 });
      expect(callbacks.start).not.toHaveBeenCalled();
      pointer(window, 'pointermove', { clientX: 108, clientY: 84 });
      expect(callbacks.start).toHaveBeenCalledWith(item, { x: 108, y: 84 });
      expect(grab.active()).toBe(item);
      pointer(window, 'pointermove', { clientX: 128, clientY: 74 });
      expect(callbacks.move).toHaveBeenCalledWith(item, 20, -10);
      pointer(window, 'pointerup', { clientX: 128, clientY: 74 }); speech.click();
      expect(callbacks.end).toHaveBeenCalledWith(item, false);
      expect(reply).not.toHaveBeenCalled();
      pointer(speech, 'pointerdown'); pointer(window, 'pointerup'); speech.click();
      expect(reply).toHaveBeenCalledTimes(1);
    });

    it.each(['pointercancel', 'lostpointercapture', 'blur', 'dispose'])('cleans an undecided drag on %s', cause => {
      pointer(speech, 'pointerdown');
      if (cause === 'blur') window.dispatchEvent(new Event('blur'));
      else if (cause === 'dispose') grab.dispose();
      else pointer(speech, cause);
      pointer(window, 'pointermove', { clientX: 140 }); pointer(window, 'pointerup');
      expect(callbacks.start).not.toHaveBeenCalled();
      expect(callbacks.end).not.toHaveBeenCalled();
      expect(speech.releasePointerCapture).toHaveBeenCalledWith(1);
    });

    it('releases capture when the character cannot be grabbed at the drag threshold', () => {
      callbacks.start.mockReturnValue(false);
      pointer(speech, 'pointerdown'); pointer(window, 'pointermove', { clientX: 140 });
      pointer(window, 'pointerup', { clientX: 140 }); speech.click();
      expect(grab.active()).toBeNull();
      expect(speech.releasePointerCapture).toHaveBeenCalledWith(1);
      expect(callbacks.end).not.toHaveBeenCalled();
      expect(reply).not.toHaveBeenCalled();
    });

    it('does not start a second keyboard grab during an undecided pointer drag', () => {
      pointer(speech, 'pointerdown'); key(button, 'Enter');
      expect(callbacks.start).not.toHaveBeenCalled();
      pointer(window, 'pointermove', { clientX: 140 });
      expect(callbacks.start).toHaveBeenCalledTimes(1);
      expect(grab.active()).toBe(item);
    });
  });

  it('captures the primary pointer, blurs focus, moves by incremental pixels and drops once', () => {
    button.focus();
    expect(pointer(button, 'pointerdown').defaultPrevented).toBe(true);
    expect(button).not.toHaveFocus();
    expect(grab.active()).toBe(item);
    expect(button).toHaveAttribute('data-grabbed', 'true');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button.setPointerCapture).toHaveBeenCalledWith(1);
    pointer(window, 'pointermove', { clientX: 120, clientY: 90 });
    pointer(window, 'pointermove', { clientX: 115, clientY: 110 });
    expect(callbacks.move.mock.calls).toEqual([[item, 20, 10], [item, -5, 20]]);
    pointer(window, 'pointerup', { clientX: 115, clientY: 110 }); pointer(button, 'lostpointercapture');
    expect(callbacks.end.mock.calls).toEqual([[item, false]]);
    expect(button.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(grab.active()).toBeNull();
    expect(button).toHaveAttribute('data-grabbed', 'false');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(callbacks.wake).toHaveBeenCalledTimes(4);
  });

  it('ignores secondary pointers, rejected starts and a second concurrent pointer', () => {
    pointer(button, 'pointerdown', { button: 2 });
    pointer(button, 'pointerdown', { isPrimary: false });
    expect(callbacks.start).not.toHaveBeenCalled();
    callbacks.start.mockReturnValueOnce(false);
    expect(pointer(button, 'pointerdown').defaultPrevented).toBe(false);
    expect(grab.active()).toBeNull();
    expect(callbacks.wake).not.toHaveBeenCalled();
    pointer(button, 'pointerdown');
    pointer(button, 'pointerdown', { pointerId: 2 });
    pointer(window, 'pointermove', { pointerId: 2 });
    pointer(window, 'pointercancel', { pointerId: 2 });
    expect(callbacks.start).toHaveBeenCalledTimes(2);
    expect(callbacks.move).not.toHaveBeenCalled();
    expect(callbacks.end).not.toHaveBeenCalled();
    expect(grab.active()).toBe(item);
  });

  it.each(['pointercancel', 'lostpointercapture', 'blur', 'hidden', 'escape', 'cancel'])('cancels on %s exactly once', cause => {
    pointer(button, 'pointerdown');
    if (cause === 'hidden') {
      const hidden = Object.getOwnPropertyDescriptor(document, 'hidden');
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      try { document.dispatchEvent(new Event('visibilitychange')); }
      finally { if (hidden) Object.defineProperty(document, 'hidden', hidden); else delete document.hidden; }
    } else if (cause === 'blur') window.dispatchEvent(new Event('blur'));
    else if (cause === 'escape') key(window, 'Escape');
    else if (cause === 'cancel') grab.cancel();
    else pointer(button, cause);
    pointer(window, 'pointerup');
    expect(callbacks.end.mock.calls).toEqual([[item, true]]);
    expect(grab.active()).toBeNull();
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('supports keyboard toggles and directional steps without synthetic form submission', () => {
    const submit = jest.fn(event => event.preventDefault());
    field.closest('form').addEventListener('submit', submit);
    button.focus();
    expect(key(button, ' ').defaultPrevented).toBe(true);
    key(button, ' ', { repeat: true });
    expect(grab.active()).toBe(item);
    expect(button).toHaveFocus();
    key(button, 'ArrowRight'); key(button, 'ArrowUp', { shiftKey: true });
    key(button, 'ArrowLeft'); key(button, 'ArrowDown', { shiftKey: true });
    expect(callbacks.move.mock.calls).toEqual([[item, 14, 0], [item, 0, -28], [item, -14, 0], [item, 0, 28]]);
    expect(key(button, 'Enter').defaultPrevented).toBe(true);
    button.click();
    expect(submit).not.toHaveBeenCalled();
    expect(callbacks.end).toHaveBeenCalledWith(item, false);
    expect(grab.active()).toBeNull();
    key(button, 'Enter'); key(button, 'Escape');
    expect(callbacks.end).toHaveBeenLastCalledWith(item, true);
  });

  it('does not move or wake when keyboard start rejects', () => {
    callbacks.start.mockReturnValue(false);
    key(button, 'Enter'); key(button, 'ArrowRight');
    expect(grab.active()).toBeNull();
    expect(callbacks.move).not.toHaveBeenCalled();
    expect(callbacks.wake).not.toHaveBeenCalled();
  });

  it('cancels keyboard grab when focus moves to another control', () => {
    const next = document.createElement('button'); field.after(next);
    button.focus(); key(button, 'Enter'); next.focus();
    expect(callbacks.end.mock.calls).toEqual([[item, true]]);
    expect(grab.active()).toBeNull();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    key(button, 'ArrowRight');
    expect(callbacks.move).not.toHaveBeenCalled();
  });

  it('applies final release coordinates before dropping when no move event arrived', () => {
    pointer(button, 'pointerdown');
    pointer(window, 'pointerup', { clientX: 130, clientY: 60 });
    expect(callbacks.move.mock.calls).toEqual([[item, 30, -20]]);
    expect(callbacks.end.mock.calls).toEqual([[item, false]]);
    expect(callbacks.move.mock.invocationCallOrder[0]).toBeLessThan(callbacks.end.mock.invocationCallOrder[0]);
    expect(grab.active()).toBeNull();
  });

  it('finishes without pointer capture support or when release already lost capture', () => {
    delete button.setPointerCapture;
    button.releasePointerCapture.mockImplementation(() => { throw new Error('No capture'); });
    pointer(button, 'pointerdown'); pointer(window, 'pointerup');
    expect(callbacks.end).toHaveBeenCalledWith(item, false);
    expect(grab.active()).toBeNull();
  });

  it('ignores delayed capture loss from a previously grabbed button', () => {
    const otherButton = document.createElement('button'), otherItem = { id: 'other' };
    field.append(otherButton); grab.bind(otherButton, otherItem);
    pointer(button, 'pointerdown'); pointer(window, 'pointerup');
    pointer(otherButton, 'pointerdown'); pointer(button, 'lostpointercapture');
    expect(grab.active()).toBe(otherItem);
    expect(callbacks.end.mock.calls).toEqual([[item, false]]);
    pointer(otherButton, 'lostpointercapture');
    expect(callbacks.end).toHaveBeenLastCalledWith(otherItem, true);
  });

  it('disposes an active grab and removes global and bound listeners', () => {
    const removeWindow = jest.spyOn(window, 'removeEventListener');
    const removeDocument = jest.spyOn(document, 'removeEventListener');
    pointer(button, 'pointerdown'); grab.dispose(); grab.dispose();
    expect(callbacks.end.mock.calls).toEqual([[item, true]]);
    callbacks.start.mockClear(); callbacks.wake.mockClear();
    pointer(button, 'pointerdown'); key(button, 'Enter');
    pointer(window, 'pointermove'); pointer(window, 'pointerup');
    window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange'));
    expect(callbacks.start).not.toHaveBeenCalled();
    expect(callbacks.move).not.toHaveBeenCalled();
    expect(callbacks.wake).not.toHaveBeenCalled();
    for (const type of ['pointermove', 'pointerup', 'pointercancel', 'blur', 'keydown']) {
      expect(removeWindow).toHaveBeenCalledWith(type, expect.any(Function));
    }
    expect(removeDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    removeWindow.mockRestore(); removeDocument.mockRestore();
  });
});
