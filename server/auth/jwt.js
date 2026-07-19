import jwt from 'jsonwebtoken';

// Verifies the Supabase Auth JWT sent as `Authorization: Bearer <token>`. Uses the project's
// shared JWT secret (HS256) — if this project is ever switched to Supabase's newer asymmetric
// signing keys, this needs to move to JWKS verification instead.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing Authorization: Bearer token' });

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'SUPABASE_JWT_SECRET not configured' });

  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
