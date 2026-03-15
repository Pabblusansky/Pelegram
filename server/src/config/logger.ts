type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const CURRENT_LEVEL = (process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info')) as LogLevel;

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[CURRENT_LEVEL];
}

function formatMessage(level: LogLevel, message: string, ...args: unknown[]): unknown[] {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  return [prefix, message, ...args];
}

const logger = {
  error(message: string, ...args: unknown[]): void {
    if (shouldLog('error')) {
      console.error(...formatMessage('error', message, ...args));
    }
  },
  warn(message: string, ...args: unknown[]): void {
    if (shouldLog('warn')) {
      console.warn(...formatMessage('warn', message, ...args));
    }
  },
  info(message: string, ...args: unknown[]): void {
    if (shouldLog('info')) {
      console.log(...formatMessage('info', message, ...args));
    }
  },
  debug(message: string, ...args: unknown[]): void {
    if (shouldLog('debug')) {
      console.log(...formatMessage('debug', message, ...args));
    }
  },
};

export default logger;
