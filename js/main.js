import { CANVAS_W, CANVAS_H } from './core/constants.js';
import Game from './game/game.js';

let game = new Game();

document.getElementById('btn-start').addEventListener('click', () => game.start());
document.getElementById('btn-pause').addEventListener('click', () => game.pause());
document.getElementById('btn-restart').addEventListener('click', () => game.restart());
document.getElementById('speed-slider').addEventListener('input', (e) => {
  game.speed = parseInt(e.target.value);
  document.getElementById('speed-val').textContent = game.speed + 'x';
});
document.getElementById('debug-check').addEventListener('change', (e) => {
  game.debug = e.target.checked;
});
document.getElementById('btn-close-ranking').addEventListener('click', () => {
  document.getElementById('ranking-overlay').classList.remove('show');
});

function resizeCanvas() {
  let wrap = document.getElementById('canvas-wrap');
  let maxW = wrap.clientWidth - 16;
  let maxH = wrap.clientHeight - 16;
  let scale = Math.min(maxW / CANVAS_W, maxH / CANVAS_H, 1);
  game.canvas.style.width = (CANVAS_W * scale) + 'px';
  game.canvas.style.height = (CANVAS_H * scale) + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
