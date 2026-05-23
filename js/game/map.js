import SeededRandom from '../core/random.js';
import { TILE, MAP_W, MAP_H, TILE_FLOOR, TILE_WALL, TILE_COVER } from '../core/constants.js';

class GameMap {
  constructor(seed) {
    this.rng = new SeededRandom(seed);
    this.grid = [];
    this.coverList = [];
    this.walkableSpawns = [];
    this.generate();
  }
  generate() {
    for (let y = 0; y < MAP_H; y++) {
      this.grid[y] = [];
      for (let x = 0; x < MAP_W; x++) this.grid[y][x] = TILE_WALL;
    }
    this.carveRooms(1, 1, MAP_W - 2, MAP_H - 2, 4);
    this.placeCover();
    this.walkableSpawns = [];
    for (let y = 2; y < MAP_H - 2; y++)
      for (let x = 2; x < MAP_W - 2; x++)
        if (this.grid[y][x] === TILE_FLOOR) this.walkableSpawns.push({x, y});
  }
  carveRooms(x1, y1, w, h, depth) {
    if (depth <= 0 || w < 6 || h < 6) {
      let rw = Math.min(w, this.rng.nextInt(5, Math.min(12, w)));
      let rh = Math.min(h, this.rng.nextInt(5, Math.min(10, h)));
      let rx = x1 + this.rng.nextInt(0, Math.max(0, w - rw));
      let ry = y1 + this.rng.nextInt(0, Math.max(0, h - rh));
      for (let y = ry; y < ry + rh && y < MAP_H - 1; y++)
        for (let x = rx; x < rx + rw && x < MAP_W - 1; x++)
          this.grid[y][x] = TILE_FLOOR;
      return;
    }
    if (w > h && w > 12) {
      let split = x1 + this.rng.nextInt(Math.ceil(w * 0.3), Math.floor(w * 0.7));
      let cy = y1 + this.rng.nextInt(0, Math.max(0, h - 3));
      for (let y = Math.max(y1, cy); y < Math.min(y1 + h, cy + 3); y++)
        for (let x = x1; x < x1 + w; x++)
          if (y >= 0 && y < MAP_H && x >= 0 && x < MAP_W) this.grid[y][x] = TILE_FLOOR;
      this.carveRooms(x1, y1, split - x1, h, depth - 1);
      this.carveRooms(split, y1, x1 + w - split, h, depth - 1);
    } else if (h > 10) {
      let split = y1 + this.rng.nextInt(Math.ceil(h * 0.3), Math.floor(h * 0.7));
      let cx = x1 + this.rng.nextInt(0, Math.max(0, w - 3));
      for (let x = Math.max(x1, cx); x < Math.min(x1 + w, cx + 3); x++)
        for (let y = y1; y < y1 + h; y++)
          if (y >= 0 && y < MAP_H && x >= 0 && x < MAP_W) this.grid[y][x] = TILE_FLOOR;
      this.carveRooms(x1, y1, w, split - y1, depth - 1);
      this.carveRooms(x1, split, w, y1 + h - split, depth - 1);
    } else {
      let rw = this.rng.nextInt(4, Math.min(10, w));
      let rh = this.rng.nextInt(4, Math.min(8, h));
      let rx = x1 + this.rng.nextInt(0, Math.max(0, w - rw));
      let ry = y1 + this.rng.nextInt(0, Math.max(0, h - rh));
      for (let y = ry; y < ry + rh && y < MAP_H - 1; y++)
        for (let x = rx; x < rx + rw && x < MAP_W - 1; x++)
          this.grid[y][x] = TILE_FLOOR;
    }
  }
  placeCover() {
    this.coverList = [];
    let count = this.rng.nextInt(40, 70);
    for (let i = 0; i < count; i++) {
      let x = this.rng.nextInt(2, MAP_W - 3);
      let y = this.rng.nextInt(2, MAP_H - 3);
      if (this.grid[y][x] === TILE_FLOOR) {
        this.grid[y][x] = TILE_COVER;
        this.coverList.push({x, y});
      }
    }
  }
  isWalkable(x, y) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
    return this.grid[y][x] !== TILE_WALL;
  }
  isWall(x, y) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return true;
    return this.grid[y][x] === TILE_WALL;
  }
  isCover(x, y) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
    return this.grid[y][x] === TILE_COVER;
  }
  isBlocked(x, y) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return true;
    return this.grid[y][x] !== TILE_FLOOR;
  }
  hasLineOfSight(x1, y1, x2, y2) {
    let dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    let sx = x1 < x2 ? 1 : -1, sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    let cx = x1, cy = y1;
    while (true) {
      if (cx === x2 && cy === y2) return true;
      if (cx < 0 || cx >= MAP_W || cy < 0 || cy >= MAP_H) return false;
      if (this.grid[cy][cx] !== TILE_FLOOR) {
        if (!(cx === x1 && cy === y1)) return false;
      }
      let e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
  }
  bfs(sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return [{x: sx, y: sy}];
    if (!this.isWalkable(tx, ty)) return null;
    let visited = new Uint8Array(MAP_W * MAP_H);
    let parent = new Int32Array(MAP_W * MAP_H * 2);
    let idx = (x, y) => y * MAP_W + x;
    let q = [sx + ',' + sy];
    visited[idx(sx, sy)] = 1;
    let dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    while (q.length > 0) {
      let [cx, cy] = q.shift().split(',').map(Number);
      for (let [dx, dy] of dirs) {
        let nx = cx + dx, ny = cy + dy;
        let ni = idx(nx, ny);
        if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
        if (visited[ni]) continue;
        if (!this.isWalkable(nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          if (!this.isWalkable(cx + dx, cy) || !this.isWalkable(cx, cy + dy)) continue;
        }
        visited[ni] = 1;
        parent[ni * 2] = cx;
        parent[ni * 2 + 1] = cy;
        if (nx === tx && ny === ty) {
          let path = [{x: nx, y: ny}];
          let px = nx, py = ny;
          while (px !== sx || py !== sy) {
            let pi = idx(px, py);
            let ppx = parent[pi * 2], ppy = parent[pi * 2 + 1];
            path.unshift({x: ppx, y: ppy});
            px = ppx; py = ppy;
          }
          return path;
        }
        q.push(nx + ',' + ny);
      }
    }
    return null;
  }
}

export default GameMap;
