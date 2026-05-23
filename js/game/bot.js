import { TILE, BOT_NAMES, STATES } from '../core/constants.js';

class Bot {
  constructor(id, x, y, personality, color) {
    this.id = id;
    this.name = BOT_NAMES[id];
    this.color = color;
    this.personality = personality;
    this.x = x; this.y = y;
    this.tileX = Math.floor(x / TILE);
    this.tileY = Math.floor(y / TILE);
    this.health = 100;
    this.maxHealth = 100;
    this.speed = 60 + Math.random() * 30;
    this.alive = true;
    this.state = STATES.EXPLORING;
    this.target = null;
    this.attacker = null;
    this.lastEnemyPos = null;
    this.kills = 0;
    this.survivalTime = 0;
    this.cooldown = 0;
    this.cooldownMax = 0.4 + Math.random() * 0.3;
    this.visionRadius = 150 + Math.random() * 80;
    this.weaponRange = 200 + Math.random() * 80;
    this.destination = null;
    this.path = [];
    this.pathIndex = 0;
    this.stuckTimer = 0;
    this.lastMoveX = x;
    this.lastMoveY = y;
    this.coverTile = null;
    this.peekTimer = 0;
    this.direction = Math.random() * Math.PI * 2;
    this.radius = 10;
    this.deathKiller = null;
    this.lastShotTime = 0;
    this.shotAccuracy = 0.7 + Math.random() * 0.25;
  }
}

export default Bot;
