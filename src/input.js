// Keyboard + mouse state with pointer lock.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.dx = 0;
    this.dy = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.wheel = 0;
    this.slotPressed = 0;
    this.pressed = new Set();

    addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) this.slotPressed = n;
      }
      if (this.locked && ['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked || e.button !== 0) return;
      this.mouseDown = true;
      this.clicked = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* browser refused, user can click again */ }
  }

  down(code) {
    return this.keys.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  // Call at the end of each frame.
  endFrame() {
    this.dx = 0;
    this.dy = 0;
    this.clicked = false;
    this.wheel = 0;
    this.slotPressed = 0;
    this.pressed.clear();
  }
}
