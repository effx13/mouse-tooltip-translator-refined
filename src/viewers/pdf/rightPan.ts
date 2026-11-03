const THRESHOLD = 5;
const INTERACTIVE = "a[href], input, textarea, select, button, [contenteditable]";

// a right-button drag scrolls the container; a plain right click keeps the context menu
export function enableRightDragPan(container: HTMLElement) {
  const ac = new AbortController();
  const { signal } = ac;
  let start: { x: number; y: number; left: number; top: number } | null = null;
  let panning = false;
  let blockMenu = false;

  const stop = () => {
    blockMenu = panning;
    start = null;
    panning = false;
    container.classList.remove("panning");
    // contextmenu follows mouseup on Windows
    setTimeout(() => (blockMenu = false), 100);
  };

  container.addEventListener(
    "mousedown",
    (e) => {
      if (e.button !== 2 || (e.target as Element | null)?.closest(INTERACTIVE)) return;
      start = { x: e.clientX, y: e.clientY, left: container.scrollLeft, top: container.scrollTop };
      panning = false;
    },
    { signal },
  );

  window.addEventListener(
    "mousemove",
    (e) => {
      if (!start) return;
      // released outside the window
      if (!(e.buttons & 2)) return stop();
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!panning && Math.hypot(dx, dy) < THRESHOLD) return;
      if (!panning) {
        panning = true;
        container.classList.add("panning");
      }
      e.preventDefault();
      container.scrollTo({ left: start.left - dx, top: start.top - dy, behavior: "instant" });
    },
    { signal },
  );

  window.addEventListener("mouseup", (e) => e.button === 2 && start && stop(), { signal });

  container.addEventListener(
    "contextmenu",
    (e) => {
      if (!blockMenu && !panning) return;
      e.preventDefault();
      blockMenu = false;
    },
    { signal },
  );

  return () => ac.abort();
}
