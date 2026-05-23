class Bullet {
  constructor(x, y, tx, ty, shooter) {
    this.x = x; this.y = y;
    this.tx = tx; this.ty = ty;
    this.shooter = shooter;
    this.alive = true;
    this.hit = false;
    this.hitTarget = null;
    this.birth = performance.now();
    this.lifetime = 200;
  }
}

export default Bullet;
