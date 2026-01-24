const DEBUG_MODE = process.env.DEBUG === "true" || process.env.DEBUG === "1";

class Logger {
  constructor() {
    this.debugMode = DEBUG_MODE;
    this.counters = new Map();
  }

  setDebugMode(enabled) {
    this.debugMode = enabled;
  }

  isDebugMode() {
    return this.debugMode;
  }

  info(...args) {
    console.log(...args);
  }

  error(...args) {
    console.error("[ERROR]", ...args);
  }

  debug(...args) {
    if (this.debugMode) {
      console.log("[DEBUG]", ...args);
    }
  }

  warn(...args) {
    console.warn("[WARN]", ...args);
  }

  // Progress tracking methods
  incrementCounter(name, amount = 1) {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + amount);
  }

  getCounter(name) {
    return this.counters.get(name) || 0;
  }

  resetCounters() {
    this.counters.clear();
  }

  logCounters() {
    if (this.debugMode && this.counters.size > 0) {
      console.log("[STATS]", Object.fromEntries(this.counters));
    }
  }
}

export const logger = new Logger();
