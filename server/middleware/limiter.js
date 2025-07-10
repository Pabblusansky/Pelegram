import rateLimit from 'express-rate-limit';

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 1000, 
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' },
  skip: (req) => {
    return req.url.startsWith('/uploads') || req.url.startsWith('/media');
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10, 
  message: { error: 'Too many authentication attempts, please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, 
});

const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, 
  max: 25, 
  message: { error: 'Too many file uploads, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 60, 
  message: { error: 'Too many message requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export {
  generalLimiter,
  authLimiter,
  uploadLimiter,
  messageLimiter
};