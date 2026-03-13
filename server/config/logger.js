const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const CURRENT_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info');

function shouldLog(level) {
  return LOG_LEVELS[level] <= LOG_LEVELS[CURRENT_LEVEL];
}

function formatMessage(level, message, ...args) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  return [prefix, message, ...args];
}

const logger = {
  error(message, ...args) {
    if (shouldLog('error')) {
      console.error(...formatMessage('error', message, ...args));
    }
  },
  warn(message, ...args) {
    if (shouldLog('warn')) {
      console.warn(...formatMessage('warn', message, ...args));
    }
  },
  info(message, ...args) {
    if (shouldLog('info')) {
      console.log(...formatMessage('info', message, ...args));
    }
  },
  debug(message, ...args) {
    if (shouldLog('debug')) {
      console.log(...formatMessage('debug', message, ...args));
    }
  },
};

export default logger;
