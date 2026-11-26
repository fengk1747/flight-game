// Canyon Postman — keyboard and mouse. Arrows or WASD fly, throttle rides on
// Shift/Ctrl (or W/S), Space drops the mail and confirms, G toggles the gear,
// C changes the camera, P pauses, R restarts, M mutes. Dragging the mouse on the
// canvas steers a little too, for players who prefer it.

export function createInput(canvas) {
  const keys = new Set();
  // One-shot actions queue up here on keydown, so a quick press is never lost
  // between two simulation steps (notably when the frame rate is low).
  const pressed = [];
  let mousePitch = 0;
  let mouseRoll = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const GAME_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight',
    'ControlLeft', 'ControlRight', 'KeyG', 'KeyC', 'KeyP', 'KeyR', 'KeyM', 'Enter',
  ]);

  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      keys.add(e.code);
      // Only queue the codes stepGame consumes (G, C, M, Space, Enter);
      // P/Escape/R are handled by main.js's own listener.
      if (e.code === 'KeyG' || e.code === 'KeyC' || e.code === 'KeyM' || e.code === 'Space' || e.code === 'Enter') {
        pressed.push(e.code);
      }
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    mouseRoll = Math.max(-1, Math.min(1, mouseRoll + dx * 0.004));
    mousePitch = Math.max(-1, Math.min(1, mousePitch + dy * 0.004));
  });
  const endDrag = () => {
    dragging = false;
    mouseRoll = 0;
    mousePitch = 0;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  let throttle = 0;
  return {
    /** Read the current control state, advancing the throttle toward its target. */
    read(dt) {
      const up = keys.has('ArrowUp') || keys.has('KeyW');
      const down = keys.has('ArrowDown') || keys.has('KeyS');
      const left = keys.has('ArrowLeft') || keys.has('KeyA');
      const right = keys.has('ArrowRight') || keys.has('KeyD');
      const throttleUp = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const throttleDown = keys.has('ControlLeft') || keys.has('ControlRight');
      if (throttleUp) throttle = Math.min(1, throttle + dt * 0.7);
      if (throttleDown) throttle = Math.max(0, throttle - dt * 0.7);
      // W/S are pitch (arrows do the same); Shift/Ctrl own the throttle.
      // Pitch: +1 is nose up (ArrowUp / W), -1 is nose down. Dragging the
      // mouse down pulls back (climb), like a stick.
      const pitch = (up ? 1 : 0) + (down ? -1 : 0) + mousePitch;
      const roll = (left ? -1 : 0) + (right ? 1 : 0) + mouseRoll;
      return {
        pitch: Math.max(-1, Math.min(1, pitch)),
        roll: Math.max(-1, Math.min(1, roll)),
        throttle,
      };
    },
    /** One-shot actions, consumed by the caller each frame. */
    consume(code) {
      const i = pressed.indexOf(code);
      if (i >= 0) {
        pressed.splice(i, 1);
        return true;
      }
      return false;
    },
    setThrottle(v) {
      throttle = Math.max(0, Math.min(1, v));
    },
    get throttle() {
      return throttle;
    },
  };
}
