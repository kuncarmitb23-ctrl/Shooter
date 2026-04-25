export const keys = {};
export const mouse = { x: 0, y: 0, down: false };

addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
addEventListener('keyup',   (e) => { keys[e.key.toLowerCase()] = false; });

export function bindMouse(canvas) {
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', () => { mouse.down = true; });
  canvas.addEventListener('mouseup',   () => { mouse.down = false; });
  canvas.addEventListener('selectstart', (e) => e.preventDefault());
}
