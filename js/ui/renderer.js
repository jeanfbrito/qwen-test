import { TILE, CANVAS_W, CANVAS_H, MAP_W, MAP_H, TILE_WALL, TILE_COVER, STATE_NAMES } from '../core/constants.js';

class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
  }
  render() {
    let ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    this.drawMap();
    this.drawBloodSplats();
    this.drawBullets();
    this.drawBots();
    if (this.game.debug) this.drawDebug();
  }
  drawMap() {
    let ctx = this.ctx;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        let tile = this.game.map.grid[y][x];
        let px = x * TILE, py = y * TILE;
        if (tile === TILE_WALL) {
          ctx.fillStyle = '#2c3e50';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.strokeStyle = '#1a252f';
          ctx.strokeRect(px, py, TILE, TILE);
        } else if (tile === TILE_COVER) {
          ctx.fillStyle = '#4a6741';
          ctx.fillRect(px, py, TILE, TILE);
          ctx.strokeStyle = '#3a5731';
          ctx.strokeRect(px, py, TILE, TILE);
          ctx.fillStyle = '#5a7751';
          ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
        } else {
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(px, py, TILE, TILE);
        }
      }
    }
  }
  drawBots() {
    let ctx = this.ctx;
    for (let bot of this.game.bots) {
      let x = bot.x, y = bot.y;
      if (!bot.alive) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.arc(x, y, bot.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6);
        ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6);
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.fillStyle = bot.color;
      ctx.beginPath();
      ctx.arc(x, y, bot.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.strokeStyle = bot.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(bot.direction) * 14, y + Math.sin(bot.direction) * 14);
      ctx.stroke();
      let barW = 24, barH = 3;
      let barX = x - barW / 2, barY = y - bot.radius - 8;
      ctx.fillStyle = '#333';
      ctx.fillRect(barX, barY, barW, barH);
      let hp = bot.health / bot.maxHealth;
      ctx.fillStyle = hp > 0.5 ? '#2ed573' : (hp > 0.25 ? '#ffa502' : '#ff4757');
      ctx.fillRect(barX, barY, barW * hp, barH);
      ctx.fillStyle = '#fff';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(bot.name, x, y + bot.radius + 10);
    }
  }
  drawBloodSplats() {
    let ctx = this.ctx;
    for (let s of (this.game.bloodSplats || [])) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = s.c;
      for (let d of s.drops) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  drawBullets() {
    let ctx = this.ctx;
    let now = performance.now();
    for (let b of this.game.bullets) {
      let age = now - b.birth;
      let alpha = Math.max(0, 1 - age / b.lifetime);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffdd59';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ffdd59';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.tx, b.ty);
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (b.hit) {
        ctx.fillStyle = '#ff4757';
        ctx.beginPath();
        ctx.arc(b.tx, b.ty, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  drawDebug() {
    let ctx = this.ctx;
    for (let bot of this.game.bots) {
      if (!bot.alive) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bot.x, bot.y, bot.visionRadius, 0, Math.PI * 2);
      ctx.stroke();
      // Hearing radius (cyan dashed)
      ctx.strokeStyle = 'rgba(0,200,255,0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(bot.x, bot.y, bot.hearingRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Noise level indicator
      if (bot.noiseLevel > 0) {
        let noiseAlpha = Math.min(1, bot.noiseLevel / 150);
        ctx.strokeStyle = `rgba(255,165,0,${noiseAlpha * 0.9})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(bot.x, bot.y, bot.radius + 4 + noiseAlpha * 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      ctx.fillStyle = '#0f0';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(STATE_NAMES[bot.state], bot.x + 14, bot.y - 6);
      ctx.fillText(STATE_NAMES[bot.state], bot.x + 14, bot.y - 6);
      ctx.lineWidth = 1;
      if (bot.path && bot.path.length > 0) {
        ctx.strokeStyle = 'rgba(0,255,100,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = bot.pathIndex; i < bot.path.length; i++) {
          let p = bot.path[i];
          let px = p.x * TILE + TILE / 2;
          let py = p.y * TILE + TILE / 2;
          if (i === bot.pathIndex) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      if (bot.target && bot.target.alive) {
        ctx.strokeStyle = 'rgba(255,50,50,0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(bot.x, bot.y);
        ctx.lineTo(bot.target.x, bot.target.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (bot.coverTile) {
        ctx.strokeStyle = 'rgba(100,180,255,0.9)';
        ctx.lineWidth = 2;
        ctx.strokeRect(bot.coverTile.x * TILE, bot.coverTile.y * TILE, TILE, TILE);
      }
    }
  }
}

export default Renderer;
