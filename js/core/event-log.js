class EventLog {
  constructor() { this.entries = []; }
  add(text, type) { this.entries.push({ t: performance.now(), text, type: type || '' }); }
  clear() { this.entries = []; }
}

export default EventLog;
