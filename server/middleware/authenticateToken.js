import jwt from 'jsonwebtoken';

// const SECRET_KEY = process.env.SECRET_KEY || 'default_secret';

export const authenticateToken = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next(); // Allow preflight requests to pass
  }

  if (!process.env.SECRET_KEY) {
      console.error("AUTH_MIDDLEWARE: SECRET_KEY not found in process.env!");
      return res.status(500).json({ error: 'Server configuration error (secret missing in middleware)' });
  }
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    console.log('No authorization header provided');
    return res.status(401).json({ error: 'Access denied. No authorization header.' });
  }
  
  const token = authHeader.split(' ')[1];

  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET_KEY);
    req.user = decoded; // Attach user data to the request object
    next();
  } catch (error) {
    console.error('Invalid or expired token:', error);
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

export default authenticateToken;