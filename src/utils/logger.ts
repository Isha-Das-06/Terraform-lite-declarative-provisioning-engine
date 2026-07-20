export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel) {
    this.level = level;
  }

  debug(message: string, data?: any) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`[DEBUG] ${message}`, data || "");
    }
  }

  info(message: string, data?: any) {
    if (this.level <= LogLevel.INFO) {
      console.log(`[INFO] ${message}`, data || "");
    }
  }

  warn(message: string, data?: any) {
    if (this.level <= LogLevel.WARN) {
      console.warn(`[WARN] ${message}`, data || "");
    }
  }

  error(message: string, error?: any) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`[ERROR] ${message}`, error?.message || error || "");
    }
  }

  success(message: string) {
    console.log(`✓ ${message}`);
  }

  failure(message: string) {
    console.log(`✗ ${message}`);
  }
}

export const logger = new Logger();
