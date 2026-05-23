import { TILE, MAP_W, MAP_H, TILE_WALL, TILE_COVER, STATES } from '../core/constants.js';
import Bullet from '../game/bullet.js';

class AIController {
  constructor(game) { this.game = game; }

  update(bot, dt) {
    if (!bot.alive) { bot.state = STATES.DEAD; return; }
    if (bot.cooldown > 0) bot.cooldown -= dt;
    bot.survivalTime += dt;

    // Decay noise level
    bot.noiseLevel = Math.max(0, bot.noiseLevel - 80 * dt);

    // Detect visible enemies
    let visibleEnemies = this.detectEnemies(bot);
    let closestVisible = null;
    let closestDist = Infinity;
    for (let e of visibleEnemies) {
      let d = this.game.dist(bot, e);
      if (d < closestDist) { closestDist = d; closestVisible = e; }
    }

    // Detect noisy enemies (hearing)
    let heardEnemy = this.detectNoisyEnemies(bot);

    if (closestVisible) {
      bot.lastEnemyPos = { x: closestVisible.x, y: closestVisible.y };
    }

    // Hearing updates target info even without line of sight
    if (heardEnemy && !closestVisible) {
      bot.heardEnemy = heardEnemy.enemy;
      bot.heardEnemyPos = { x: heardEnemy.enemy.x, y: heardEnemy.enemy.y };
      if (!bot.lastEnemyPos) {
        bot.lastEnemyPos = { x: heardEnemy.enemy.x, y: heardEnemy.enemy.y };
      }
    }

    // Hearing reaction: loud noises (shots) grab attention in any state
    if (heardEnemy && !closestVisible && heardEnemy.noise > 100) {
      if (bot.state !== STATES.ATTACKING && bot.state !== STATES.SEEKING_COVER && bot.state !== STATES.FLEEING) {
        bot.target = heardEnemy.enemy;
        bot.lastEnemyPos = { x: heardEnemy.enemy.x, y: heardEnemy.enemy.y };
        bot.state = STATES.SEEKING_ENEMY;
      }
    }

    switch (bot.state) {
      case STATES.EXPLORING:
        this.doExploring(bot, closestVisible, closestDist, heardEnemy);
        break;
      case STATES.SEEKING_ENEMY:
        this.doSeekingEnemy(bot, closestVisible, closestDist);
        break;
      case STATES.CHASING:
        this.doChasing(bot, closestVisible, closestDist);
        break;
      case STATES.ATTACKING:
        this.doAttacking(bot, closestVisible, closestDist);
        break;
      case STATES.SEEKING_COVER:
        this.doSeekingCover(bot);
        break;
      case STATES.IN_COVER:
        this.doInCover(bot, closestVisible, closestDist);
        break;
      case STATES.FLEEING:
        this.doFleeing(bot);
        break;
    }

    // React to being shot — decide to fight back or keep running
    if (bot.alive && bot.lastDamageTime > 0 && this.game.time - bot.lastDamageTime < 0.5) {
      bot.lastDamageTime = 0;
      if (bot.state === STATES.SEEKING_COVER) {
        // Got shot while running for cover — stop and fight back
        if (bot.health < 20 || bot.personality === 'Coward') {
          // Too hurt — keep running for cover
        } else {
          bot.state = STATES.ATTACKING;
          bot.target = bot.attacker;
        }
      } else if (bot.state !== STATES.ATTACKING && bot.state !== STATES.FLEEING) {
        if (bot.health < 30 || bot.personality === 'Coward') {
          bot.state = STATES.SEEKING_COVER;
        } else if (bot.personality === 'Sniper') {
          bot.state = Math.random() < 0.5 ? STATES.SEEKING_COVER : STATES.ATTACKING;
        } else {
          let shooter = bot.target;
          if (shooter && shooter.alive) {
            let dist = this.game.dist(bot, shooter);
            if (dist < bot.weaponRange * 0.8) {
              bot.state = STATES.ATTACKING;
            } else {
              bot.state = Math.random() < 0.5 ? STATES.SEEKING_COVER : STATES.ATTACKING;
            }
          } else {
            bot.state = STATES.ATTACKING;
          }
        }
      }
    }

    if (bot.alive && bot.health <= 15 && bot.state !== STATES.FLEEING && bot.state !== STATES.Dead && bot.state !== STATES.SEEKING_COVER) {
      bot.state = STATES.FLEEING;
      this.game.log.add(`${bot.name} is fleeing (critical health)`, 'cover');
    }

    bot.tileX = Math.floor(bot.x / TILE);
    bot.tileY = Math.floor(bot.y / TILE);

    let moved = Math.abs(bot.x - bot.lastMoveX) + Math.abs(bot.y - bot.lastMoveY);
    if (moved < 0.5) {
      bot.stuckTimer += dt;
      if (bot.stuckTimer > 1.5) {
        this.recoverFromStuck(bot);
      }
    } else {
      bot.stuckTimer = 0;
      bot.lastMoveX = bot.x;
      bot.lastMoveY = bot.y;
    }
  }

  detectEnemies(bot) {
    let enemies = [];
    for (let other of this.game.bots) {
      if (other === bot || !other.alive) continue;
      let d = this.game.dist(bot, other);
      if (d > bot.visionRadius) continue;
      let t1x = Math.floor(bot.x / TILE), t1y = Math.floor(bot.y / TILE);
      let t2x = Math.floor(other.x / TILE), t2y = Math.floor(other.y / TILE);
      if (this.game.map.hasLineOfSight(t1x, t1y, t2x, t2y)) {
        enemies.push(other);
      }
    }
    return enemies;
  }

  detectNoisyEnemies(bot) {
    let best = null;
    let bestNoise = 0;
    for (let other of this.game.bots) {
      if (other === bot || !other.alive) continue;
      if (other.noiseLevel <= 0) continue;
      let d = this.game.dist(bot, other);
      // Noise falls off with distance
      let effectiveNoise = other.noiseLevel * (1 - d / bot.hearingRadius);
      if (effectiveNoise > bestNoise && d < bot.hearingRadius) {
        bestNoise = effectiveNoise;
        best = { enemy: other, distance: d, noise: effectiveNoise };
      }
    }
    return best;
  }

  doExploring(bot, closest, dist, heard) {
    if (closest && dist < bot.weaponRange) {
      let p = bot.personality;
      if (p === 'Sniper' && dist < 60) {
        bot.state = STATES.SEEKING_COVER;
        return;
      }
      bot.target = closest;
      bot.state = STATES.ATTACKING;
      return;
    }
    // React to heard noise - investigate the source
    if (heard && !closest) {
      bot.target = heard.enemy;
      bot.lastEnemyPos = { x: heard.enemy.x, y: heard.enemy.y };
      bot.state = STATES.SEEKING_ENEMY;
      return;
    }
    // Pick new destination only when current path is exhausted
    if (!bot.path || bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
      let candidates = this.game.map.walkableSpawns;
      if (candidates.length > 0) {
        bot.destination = candidates[Math.floor(Math.random() * candidates.length)];
        bot.path = this.game.map.aStar(bot.tileX, bot.tileY, bot.destination.x, bot.destination.y) || [];
        bot.pathIndex = 0;
      }
    }
    if (bot.path && bot.path.length > 0 && bot.pathIndex < bot.path.length) {
      this.moveAlongPath(bot);
    }
  }

  doSeekingEnemy(bot, closest, dist) {
    if (closest && dist < bot.weaponRange) {
      bot.target = closest;
      bot.state = STATES.ATTACKING;
      return;
    }
    if (bot.lastEnemyPos) {
      let tx = Math.floor(bot.lastEnemyPos.x / TILE);
      let ty = Math.floor(bot.lastEnemyPos.y / TILE);
      // If bot is already at the last known enemy position, give up and explore
      if (bot.tileX === tx && bot.tileY === ty) {
        bot.lastEnemyPos = null;
        bot.state = STATES.EXPLORING;
        return;
      }
      // Only recompute path when needed
      if (!bot.path || bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
        bot.path = this.game.map.aStar(bot.tileX, bot.tileY, tx, ty) || [];
        bot.pathIndex = 0;
      }
      if (bot.path && bot.path.length > 0) {
        this.moveAlongPath(bot);
      }
    } else {
      bot.state = STATES.EXPLORING;
    }
    // Fall back to exploring if path was never found
    if (!bot.path || bot.path.length === 0) {
      bot.state = STATES.EXPLORING;
    }
  }

  doChasing(bot, closest, dist) {
    if (!closest || !closest.alive) { bot.state = STATES.EXPLORING; return; }
    if (dist > bot.weaponRange * 1.5) { bot.state = STATES.EXPLORING; return; }

    let p = bot.personality;
    let attackRange = p === 'Sniper' ? bot.weaponRange * 0.8 : (p === 'Aggressive' ? bot.weaponRange * 0.5 : bot.weaponRange * 0.6);

    if (dist <= attackRange) {
      bot.state = STATES.ATTACKING;
      return;
    }
    let tx = Math.floor(closest.x / TILE);
    let ty = Math.floor(closest.y / TILE);
    // Don't chase into the same tile — switch to attacking instead
    if (bot.tileX === tx && bot.tileY === ty) {
      bot.state = STATES.ATTACKING;
      return;
    }
    if (!bot.path || bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
      bot.path = this.game.map.aStar(bot.tileX, bot.tileY, tx, ty) || [];
      bot.pathIndex = 0;
    }
    if (bot.path && bot.path.length > 0) {
      this.moveAlongPath(bot);
    }
  }

  doAttacking(bot, closest, dist) {
    if (!closest || !closest.alive) {
      bot.target = null;
      bot.state = STATES.EXPLORING;
      return;
    }
    if (dist > bot.weaponRange * 1.5) {
      bot.state = STATES.EXPLORING;
      return;
    }

    let t1x = bot.tileX, t1y = bot.tileY;
    let t2x = closest.tileX, t2y = closest.tileY;
    let hasLOS = this.game.map.hasLineOfSight(t1x, t1y, t2x, t2y);

    if (!hasLOS) {
      let p = bot.personality;
      if (p === 'Sniper') {
        bot.state = STATES.SEEKING_COVER;
        return;
      }
      // Try to flank: find a walkable tile near the enemy that has LOS
      if (!bot.path || bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
        let flankPos = this.findFlankPosition(bot, closest);
        if (flankPos) {
          bot.path = this.game.map.aStar(bot.tileX, bot.tileY, flankPos.x, flankPos.y) || [];
          bot.pathIndex = 0;
        } else {
          // Can't flank — fallback to chasing
          bot.state = STATES.CHASING;
          return;
        }
      }
      if (bot.path && bot.path.length > 0) {
        this.moveAlongPath(bot);
        return;
      } else {
        // No flank path available — fallback
        bot.state = STATES.CHASING;
        return;
      }
    }

    let p = bot.personality;
    if (p === 'Sniper' && dist < 60) {
      bot.state = STATES.SEEKING_COVER;
      return;
    }
    if (p === 'Aggressive' && dist > 100) {
      bot.state = STATES.CHASING;
      return;
    }

    if (bot.cooldown <= 0) {
      this.shoot(bot, closest);
      bot.cooldown = bot.cooldownMax;
    }

    bot.direction = Math.atan2(closest.y - bot.y, closest.x - bot.x);
  }

  doSeekingCover(bot) {
    // Only compute new path when needed
    if (!bot.path || bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
      let cover = this.findBestCover(bot);
      if (cover) {
        bot.coverTile = cover;
        let adjDirs = [[-1,0],[1,0],[0,-1],[0,1]];
        let bestAdj = null;
        let bestAdjDist = Infinity;
        for (let [dx, dy] of adjDirs) {
          let ax = cover.x + dx;
          let ay = cover.y + dy;
          if (this.game.map.grid[ay] && this.game.map.grid[ay][ax] === 0) {
            let ad = Math.abs(bot.x - (ax * TILE + TILE/2)) + Math.abs(bot.y - (ay * TILE + TILE/2));
            if (ad < bestAdjDist) { bestAdjDist = ad; bestAdj = { x: ax, y: ay }; }
          }
        }
        let targetTile = bestAdj;
        if (targetTile) {
          bot.path = this.game.map.aStar(bot.tileX, bot.tileY, targetTile.x, targetTile.y) || [];
          bot.pathIndex = 0;
          if (bot.path.length === 0) {
            bot.state = STATES.FLEEING;
            return;
          }
        } else {
          bot.state = STATES.FLEEING;
          return;
        }
      } else {
        bot.state = STATES.FLEEING;
        return;
      }
    }
    if (bot.path && bot.path.length > 0 && bot.pathIndex < bot.path.length) {
      this.moveAlongPath(bot);
    }
    // Check if reached cover
    if (bot.coverTile) {
      let d = Math.abs(bot.x - (bot.coverTile.x * TILE + TILE/2)) + Math.abs(bot.y - (bot.coverTile.y * TILE + TILE/2));
      if (d < TILE * 1.5) {
        bot.state = STATES.IN_COVER;
        bot.peekTimer = 2 + Math.random() * 3;
        this.game.log.add(`${bot.name} took cover`, 'cover');
      }
    }
  }

  doInCover(bot, closest, dist) {
    // If enemy is visible and close, attack immediately regardless of peek timer
    if (closest && closest.alive && dist < bot.weaponRange) {
      bot.target = closest;
      bot.state = STATES.ATTACKING;
      return;
    }
    // If hearing an enemy nearby, stop hiding and go investigate
    if (bot.heardEnemy && bot.heardEnemy.alive) {
      let hearDist = this.game.dist(bot, bot.heardEnemy);
      if (hearDist < bot.hearingRadius) {
        bot.target = bot.heardEnemy;
        bot.lastEnemyPos = { x: bot.heardEnemy.x, y: bot.heardEnemy.y };
        bot.state = STATES.SEEKING_ENEMY;
        return;
      }
    }
    // Recover HP while in cover
    if (bot.lastDamageTime === 0 || this.game.time - bot.lastDamageTime > 4) {
      bot.health = Math.min(bot.maxHealth, bot.health + 5 * (1 / 60));
    }
    bot.peekTimer -= 1 / 60;
    if (bot.peekTimer <= 0) {
      if (closest && closest.alive && dist < bot.weaponRange) {
        let t1x = bot.tileX, t1y = bot.tileY;
        let t2x = closest.tileX, t2y = closest.tileY;
        if (this.game.map.hasLineOfSight(t1x, t1y, t2x, t2y) && bot.cooldown <= 0) {
          this.shoot(bot, closest);
          bot.cooldown = bot.cooldownMax;
        }
        bot.state = STATES.ATTACKING;
        return;
      }
      bot.peekTimer = 1 + Math.random() * 2;
    }
    if (bot.health > 60 && Math.random() < 0.005) {
      bot.state = STATES.EXPLORING;
    }
  }

  findFlankPosition(bot, enemy) {
    let etx = enemy.tileX;
    let ety = enemy.tileY;
    // Check tiles in a ring around the enemy (radius 2-6 tiles)
    let dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    for (let r = 2; r <= 6; r++) {
      // Shuffle directions for variety
      let shuffled = [...dirs].sort(() => Math.random() - 0.5);
      for (let [dx, dy] of shuffled) {
        let fx = etx + dx * r;
        let fy = ety + dy * r;
        if (!this.game.map.isWalkable(fx, fy)) continue;
        // Check LOS from this position to the enemy
        if (this.game.map.hasLineOfSight(fx, fy, etx, ety)) {
          // Check it's within weapon range
          let fpx = fx * TILE + TILE / 2;
          let fpy = fy * TILE + TILE / 2;
          let d = Math.sqrt((bot.x - fpx) ** 2 + (bot.y - fpy) ** 2);
          if (d < bot.weaponRange * 1.2) {
            return { x: fx, y: fy };
          }
        }
      }
    }
    return null;
  }

  doFleeing(bot) {
    // Gradual recovery: regenerate HP when out of combat
    if (bot.lastDamageTime === 0 || this.game.time - bot.lastDamageTime > 4) {
      bot.health = Math.min(bot.maxHealth, bot.health + 5 * (1 / 60));
    }
    if (bot.health > 50 && Math.random() < 0.01) {
      bot.state = STATES.EXPLORING;
      return;
    }
    // Only compute new path when needed
    if (!bot.path || bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
      let fleeTarget = this.findFleePosition(bot);
      if (fleeTarget) {
        bot.path = this.game.map.aStar(bot.tileX, bot.tileY, fleeTarget.x, fleeTarget.y) || [];
        bot.pathIndex = 0;
      }
    }
    if (bot.path && bot.path.length > 0 && bot.pathIndex < bot.path.length) {
      this.moveAlongPath(bot);
    }
  }

  findBestCover(bot) {
    let best = null;
    let bestScore = -Infinity;
    let enemyPos = bot.lastEnemyPos || { x: bot.x + 200, y: bot.y };

    for (let cover of this.game.map.coverList) {
      let cx = cover.x * TILE + TILE / 2;
      let cy = cover.y * TILE + TILE / 2;
      let dToBot = Math.sqrt((bot.x - cx) ** 2 + (bot.y - cy) ** 2);
      let dToEnemy = Math.sqrt((enemyPos.x - cx) ** 2 + (enemyPos.y - cy) ** 2);

      if (dToBot > 300) continue;
      if (dToBot < TILE) continue;

      let blocksFire = !this.game.map.hasLineOfSight(cover.x, cover.y, bot.tileX, bot.tileY);

      let score = 0;
      score += blocksFire ? 50 : 0;
      score += dToEnemy * 0.1;
      score -= dToBot * 0.3;
      score -= 10;

      if (bot.personality === 'Sniper') score += blocksFire ? 30 : 0;
      if (bot.personality === 'Coward') score += 20;

      let adjWalkable = false;
      for (let [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        if (this.game.map.isWalkable(cover.x + dx, cover.y + dy)) { adjWalkable = true; break; }
      }
      if (!adjWalkable) continue;

      if (score > bestScore) { bestScore = score; best = { x: cover.x, y: cover.y }; }
    }
    return best;
  }

  findFleePosition(bot) {
    let enemyPos = bot.lastEnemyPos || { x: bot.x + 200, y: bot.y };
    let best = null;
    let bestDist = 0;
    let candidates = this.game.map.walkableSpawns;
    let max = Math.min(candidates.length, 50);
    for (let i = 0; i < max; i++) {
      let c = candidates[Math.floor(Math.random() * candidates.length)];
      let cx = c.x * TILE + TILE / 2;
      let cy = c.y * TILE + TILE / 2;
      let d = Math.sqrt((cx - enemyPos.x) ** 2 + (cy - enemyPos.y) ** 2);
      let dToBot = Math.sqrt((cx - bot.x) ** 2 + (cy - bot.y) ** 2);
      if (d > bestDist && dToBot < 400) { bestDist = d; best = c; }
    }
    return best;
  }

  moveAlongPath(bot) {
    if (!bot.path || bot.path.length === 0) return;
    if (bot.pathIndex >= bot.path.length) {
      bot.path = [];
      return;
    }
    let target = bot.path[bot.pathIndex];
    // Skip cover tiles in the path — they're walkable for A* but blocked for movement
    while (this.game.map.isCover(target.x, target.y) && bot.pathIndex < bot.path.length) {
      bot.pathIndex++;
      target = bot.path[bot.pathIndex];
    }
    if (!target) { bot.path = []; return; }
    let tx = target.x * TILE + TILE / 2;
    let ty = target.y * TILE + TILE / 2;
    let dx = tx - bot.x;
    let dy = ty - bot.y;
    let d = Math.sqrt(dx * dx + dy * dy);
    if (d < 3) {
      bot.pathIndex++;
      return;
    }
    let speedMult = (bot.state === STATES.FLEEING || bot.state === STATES.SEEKING_COVER) ? 1.8 : 1;
    let moveX = (dx / d) * bot.speed * speedMult * (1 / 60);
    let moveY = (dy / d) * bot.speed * speedMult * (1 / 60);
    let oldX = bot.x;
    let oldY = bot.y;
    this.tryMove(bot, moveX, moveY);
    // If completely blocked on this path step, skip to next
    if (Math.abs(bot.x - oldX) < 0.1 && Math.abs(bot.y - oldY) < 0.1) {
      bot.pathIndex++;
      return;
    }
    bot.direction = Math.atan2(ty - bot.y, tx - bot.x);
  }

  tryMove(bot, dx, dy) {
    let nx = bot.x + dx;
    let ny = bot.y + dy;
    let margin = bot.radius - 2;
    let corners = [
      {x: nx - margin, y: ny - margin},
      {x: nx + margin, y: ny - margin},
      {x: nx - margin, y: ny + margin},
      {x: nx + margin, y: ny + margin}
    ];
    let blocked = false;
    for (let c of corners) {
      let tx = Math.floor(c.x / TILE);
      let ty = Math.floor(c.y / TILE);
      if (this.game.map.isBlocked(tx, ty)) { blocked = true; break; }
    }
    let moved = false;
    if (!blocked) {
      bot.x = nx;
      bot.y = ny;
      moved = true;
    } else {
      let nx2 = bot.x + dx;
      let corners2 = [
        {x: nx2 - margin, y: bot.y - margin},
        {x: nx2 + margin, y: bot.y - margin},
        {x: nx2 - margin, y: bot.y + margin},
        {x: nx2 + margin, y: bot.y + margin}
      ];
      let blockedX = false;
      for (let c of corners2) {
        let tx = Math.floor(c.x / TILE);
        let ty = Math.floor(c.y / TILE);
        if (this.game.map.isBlocked(tx, ty)) { blockedX = true; break; }
      }
      if (!blockedX) { bot.x = nx2; moved = true; }

      if (!moved) {
        let ny2 = bot.y + dy;
        let corners3 = [
          {x: bot.x - margin, y: ny2 - margin},
          {x: bot.x + margin, y: ny2 - margin},
          {x: bot.x - margin, y: ny2 + margin},
          {x: bot.x + margin, y: ny2 + margin}
        ];
        let blockedY = false;
        for (let c of corners3) {
          let tx = Math.floor(c.x / TILE);
          let ty = Math.floor(c.y / TILE);
          if (this.game.map.isBlocked(tx, ty)) { blockedY = true; break; }
        }
        if (!blockedY) { bot.y = ny2; moved = true; }
      }
    }
    // Footsteps make quiet noise
    if (moved) bot.noiseLevel = Math.max(bot.noiseLevel, 50);
  }

  shoot(bot, target) {
    let inaccuracy = (1 - bot.shotAccuracy) * 30;
    let tx = target.x + (Math.random() - 0.5) * inaccuracy;
    let ty = target.y + (Math.random() - 0.5) * inaccuracy;
    let bullet = new Bullet(bot.x, bot.y, tx, ty, bot);
    this.game.bullets.push(bullet);
    bot.direction = Math.atan2(ty - bot.y, tx - bot.x);
    // Shooting is loud
    bot.noiseLevel = 300;
    this.resolveBullet(bullet);
  }

  resolveBullet(bullet) {
    let t1x = Math.floor(bullet.x / TILE), t1y = Math.floor(bullet.y / TILE);
    let t2x = Math.floor(bullet.tx / TILE), t2y = Math.floor(bullet.ty / TILE);

    let dx = Math.abs(t2x - t1x), dy = Math.abs(t2y - t1y);
    let sx = t1x < t2x ? 1 : -1, sy = t1y < t2y ? 1 : -1;
    let err = dx - dy;
    let cx = t1x, cy = t1y;

    while (true) {
      if (cx === t2x && cy === t2y) break;
      if (cx < 0 || cx >= MAP_W || cy < 0 || cy >= MAP_H) { bullet.alive = false; return; }
      let tile = this.game.map.grid[cy][cx];
      if (tile === TILE_WALL || tile === TILE_COVER) {
        bullet.tx = cx * TILE + TILE / 2;
        bullet.ty = cy * TILE + TILE / 2;
        bullet.alive = false;
        return;
      }
      let e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }

    let hitBot = null;
    let hitDist = Infinity;
    for (let other of this.game.bots) {
      if (other === bullet.shooter || !other.alive) continue;
      let d = Math.sqrt((other.x - bullet.tx) ** 2 + (other.y - bullet.ty) ** 2);
      if (d < other.radius + 5 && d < hitDist) {
        hitDist = d;
        hitBot = other;
      }
    }

    if (hitBot) {
      bullet.hit = true;
      bullet.hitTarget = hitBot;
      let damage = 12 + Math.random() * 10;
      hitBot.health -= damage;
      hitBot.attacker = bullet.shooter;
      hitBot.lastEnemyPos = { x: bullet.shooter.x, y: bullet.shooter.y };
      hitBot.target = bullet.shooter;
      hitBot.lastDamageTime = this.game.time;
      this.game.log.add(`${bullet.shooter.name} hit ${hitBot.name} for ${damage.toFixed(0)} dmg`, 'hit');
      this.addBloodSplat(hitBot.x, hitBot.y, 5);

      if (hitBot.health <= 0) {
        hitBot.health = 0;
        hitBot.alive = false;
        hitBot.state = STATES.DEAD;
        hitBot.deathKiller = bullet.shooter.name;
        bullet.shooter.kills++;
        this.game.log.add(`${bullet.shooter.name} killed ${hitBot.name}!`, 'kill');
        this.addBloodSplat(hitBot.x, hitBot.y, 20);
      }

      if (hitBot.alive && hitBot.state !== STATES.Dead) {
        if (hitBot.health < 30 || hitBot.personality === 'Coward') {
          hitBot.state = STATES.SEEKING_COVER;
          this.game.log.add(`${hitBot.name} seeks cover`, 'cover');
        } else if (hitBot.personality === 'Sniper') {
          // Snipers prefer to reposition and shoot from range
          hitBot.state = Math.random() < 0.5 ? STATES.SEEKING_COVER : STATES.ATTACKING;
        } else {
          // Aggressive bots fight back, others flip-flop based on distance
          let dist = this.game.dist(hitBot, bullet.shooter);
          if (dist < hitBot.weaponRange * 0.8) {
            hitBot.state = STATES.ATTACKING;
          } else {
            hitBot.state = Math.random() < 0.5 ? STATES.SEEKING_COVER : STATES.ATTACKING;
          }
        }
      }
    }
  }

  addBloodSplat(x, y, count) {
    let drops = [];
    for (let i = 0; i < count; i++) {
      drops.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        r: 1 + Math.random() * 2.5
      });
    }
    this.game.bloodSplats.push({ drops, a: 0.7 + Math.random() * 0.3, c: '#8b0000' });
  }

  recoverFromStuck(bot) {
    bot.stuckTimer = 0;
    // First try: find any walkable tile nearby via BFS
    let dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    let best = null;
    for (let r = 1; r <= 4; r++) {
      for (let [dx, dy] of dirs) {
        let nx = bot.tileX + dx * r;
        let ny = bot.tileY + dy * r;
        if (this.game.map.isWalkable(nx, ny) && !this.game.map.isCover(nx, ny)) {
          best = {x: nx, y: ny};
          break;
        }
      }
      if (best) break;
    }
    if (best) {
      bot.path = this.game.map.aStar(bot.tileX, bot.tileY, best.x, best.y) || [];
      bot.pathIndex = 0;
    } else {
      // Last resort: teleport to nearest walkable floor tile
      for (let r = 1; r <= 6; r++) {
        for (let [dx, dy] of dirs) {
          let nx = bot.tileX + dx * r;
          let ny = bot.tileY + dy * r;
          if (this.game.map.isWalkable(nx, ny) && !this.game.map.isCover(nx, ny)) {
            bot.x = nx * TILE + TILE / 2;
            bot.y = ny * TILE + TILE / 2;
            bot.lastMoveX = bot.x;
            bot.lastMoveY = bot.y;
            bot.path = [];
            return;
          }
        }
      }
      bot.path = [];
    }
  }
}

export default AIController;
