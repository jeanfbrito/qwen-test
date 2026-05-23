import { TILE, PERSONALITIES, BOT_COLORS, STATE_NAMES } from '../core/constants.js';
import Renderer from '../ui/renderer.js';
import AIController from '../ai/controller.js';
import EventLog from '../core/event-log.js';
import GameMap from '../game/map.js';
import Bot from '../game/bot.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new Renderer(this.canvas, this);
    this.ai = new AIController(this);
    this.log = new EventLog();
    this.bots = [];
    this.bullets = [];
    this.map = null;
    this.running = false;
    this.paused = false;
    this.debug = false;
    this.speed = 3;
    this.matchTime = 0;
    this.seed = Math.floor(Math.random() * 99999);
    this.winner = null;
    this.lastTime = 0;
  }

  start() {
    this.seed = Math.floor(Math.random() * 99999);
    document.getElementById('seed-display').textContent = this.seed;
    this.map = new GameMap(this.seed);
    this.bots = [];
    this.bullets = [];
    this.log.clear();
    this.matchTime = 0;
    this.winner = null;
    this.running = true;
    this.paused = false;
    document.getElementById('btn-pause').textContent = 'Pause';
    this.spawnBots();
    this.updateUI();
    this.log.add(`Match started with seed ${this.seed}`);
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  spawnBots() {
    let spawned = [];
    let minDist = TILE * 4;
    let attempts = 0;
    let maxAttempts = 5000;

    for (let i = 0; i < 10 && attempts < maxAttempts; i++) {
      let placed = false;
      let localAttempts = 0;
      while (!placed && localAttempts < 500) {
        localAttempts++;
        attempts++;
        let sp = this.map.walkableSpawns[Math.floor(Math.random() * this.map.walkableSpawns.length)];
        if (!sp) break;
        let px = sp.x * TILE + TILE / 2;
        let py = sp.y * TILE + TILE / 2;
        let tooClose = false;
        for (let s of spawned) {
          let d = Math.sqrt((px - s.x) ** 2 + (py - s.y) ** 2);
          if (d < minDist) { tooClose = true; break; }
        }
        if (tooClose) continue;
        let personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
        let bot = new Bot(i, px, py, personality, BOT_COLORS[i]);
        this.bots.push(bot);
        spawned.push({x: px, y: py});
        placed = true;
        this.log.add(`${bot.name} spawned as ${personality}`);
      }
      if (!placed) {
        this.log.add(`Warning: Could not spawn bot ${i} in valid position`);
      }
    }
    if (this.bots.length < 10) {
      this.log.add(`Only ${this.bots.length}/10 bots spawned`);
    }
  }

  loop(timestamp) {
    if (!this.running) return;
    let dt = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;
    if (dt > 0.1) dt = 0.1;

    if (!this.paused) {
      let steps = this.speed;
      let subDt = dt / steps;
      for (let s = 0; s < steps; s++) {
        this.update(subDt);
      }
      this.matchTime += dt * this.speed;
    }

    this.renderer.render();
    this.updateUI();

    let alive = this.bots.filter(b => b.alive);
    if (alive.length <= 1 && this.bots.length >= 10) {
      this.endMatch(alive[0] || null);
      return;
    }

    // Clean expired bullets every frame
    let now = performance.now();
    this.bullets = this.bullets.filter(b => b.birth && (now - b.birth) < b.lifetime);

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    for (let bot of this.bots) {
      this.ai.update(bot, dt);
    }
  }

  dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  distPixels(bot, px, py) {
    return Math.sqrt((bot.x - px) ** 2 + (bot.y - py) ** 2);
  }

  endMatch(winner) {
    this.running = false;
    this.winner = winner;
    if (winner) {
      this.log.add(`${winner.name} WINS the match!`, 'win');
    }
    this.showRanking();
    this.updateUI();
  }

  showRanking() {
    let sorted = [...this.bots].sort((a, b) => {
      if (a.alive && !b.alive) return -1;
      if (!a.alive && b.alive) return 1;
      if (b.kills !== a.kills) return b.kills - a.kills;
      if (b.survivalTime !== a.survivalTime) return b.survivalTime - a.survivalTime;
      return b.health - a.health;
    });

    let maxKills = Math.max(...sorted.map(b => b.kills));

    let html = '<tr><th>#</th><th>Name</th><th>Personality</th><th>Status</th><th>Kills</th><th>Survived</th><th>HP</th><th>Killed By</th></tr>';
    sorted.forEach((bot, i) => {
      let killsClass = bot.kills === maxKills && maxKills > 0 ? ' class="most-kills"' : '';
      html += `<tr>
        <td>${i + 1}</td>
        <td style="color:${bot.color}">${bot.name}</td>
        <td>${bot.personality}</td>
        <td>${bot.alive ? 'ALIVE' : 'DEAD'}</td>
        <td${killsClass}>${bot.kills}</td>
        <td>${bot.survivalTime.toFixed(1)}s</td>
        <td>${Math.max(0, bot.health).toFixed(0)}</td>
        <td>${bot.deathKiller || '-'}</td>
      </tr>`;
    });
    document.getElementById('ranking-table').innerHTML = html;
    document.getElementById('winner-display').textContent = this.winner ? `Winner: ${this.winner.name}` : 'No Winner';
    document.getElementById('ranking-overlay').classList.add('show');
  }

  updateUI() {
    let alive = this.bots.filter(b => b.alive).length;
    document.getElementById('alive-count').textContent = alive;
    let mins = Math.floor(this.matchTime / 60);
    let secs = Math.floor(this.matchTime % 60);
    document.getElementById('timer').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;

    let html = '';
    for (let bot of this.bots) {
      let deadClass = bot.alive ? '' : 'dead';
      let hpColor = bot.health > 50 ? '#2ed573' : (bot.health > 25 ? '#ffa502' : '#ff4757');
      html += `<div class="bot-card ${deadClass}" style="border-left-color:${bot.color}">
        <span class="bot-name" style="color:${bot.color}">${bot.name}</span>
        <span class="bot-info"><span>${bot.personality}</span><span>${STATE_NAMES[bot.state]}</span></span>
        <div class="health-bar"><div class="health-fill" style="width:${bot.health}%;background:${hpColor}"></div></div>
        <div class="bot-info"><span>Kills: ${bot.kills}</span><span>HP: ${Math.max(0,bot.health).toFixed(0)}</span><span>${bot.alive ? 'ALIVE' : 'DEAD'}</span></div>
        ${bot.target && bot.target.alive ? `<div class="bot-info" style="color:#ff6b6b">Target: ${bot.target.name}</div>` : ''}
      </div>`;
    }
    document.getElementById('bot-list').innerHTML = html;

    let logHtml = '';
    let recentEntries = this.log.entries.slice(-80);
    for (let e of recentEntries) {
      logHtml += `<div class="log-entry ${e.type}">${e.text}</div>`;
    }
    document.getElementById('log-list').innerHTML = logHtml;
    let logPanel = document.getElementById('log-panel');
    logPanel.scrollTop = logPanel.scrollHeight;
  }

  pause() {
    if (!this.running) return;
    this.paused = !this.paused;
    document.getElementById('btn-pause').textContent = this.paused ? 'Resume' : 'Pause';
    if (!this.paused) {
      this.lastTime = performance.now();
      requestAnimationFrame((t) => this.loop(t));
    }
  }

  restart() {
    this.running = false;
    document.getElementById('ranking-overlay').classList.remove('show');
    this.start();
  }
}

export default Game;
