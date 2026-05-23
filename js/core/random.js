class SeededRandom {
  constructor(seed) { this.seed = seed % 2147483647; if (this.seed <= 0) this.seed += 2147483646; }
  next() { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; }
  nextInt(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
  pick(arr) { return arr[this.nextInt(0, arr.length - 1)]; }
}

export default SeededRandom;
