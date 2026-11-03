const MOVE_THRESHOLD_PX = 3;
// mouse counts as "moved" after three moves of more than MOVE_THRESHOLD_PX
const MOVE_COUNT = 3;

// tells a deliberate mouse move apart from jitter; tooltips only show after one
export class MouseMotion {
  moved = false;
  private count = 0;
  private lastX = 0;
  private lastY = 0;

  track(x: number, y: number): boolean {
    const distance = Math.abs(x - this.lastX) + Math.abs(y - this.lastY);
    if (!this.moved && distance > MOVE_THRESHOLD_PX && this.count < MOVE_COUNT) {
      this.count++;
    } else if (this.count >= MOVE_COUNT) {
      this.moved = true;
    }
    this.lastX = x;
    this.lastY = y;
    return this.moved;
  }

  reset() {
    this.moved = false;
    this.count = 0;
  }
}
