export function notFound(req, res) { res.status(404).json({ error: 'Route not found: ' + req.method + ' ' + req.path }); }
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.code === '23505' || error.code === 'P2002') return res.status(409).json({ error: 'A record with these details already exists' });
  if (error.code === '23503' || error.code === 'P2003') return res.status(400).json({ error: 'This record is referenced by another record and cannot be changed' });
  if (error.name === 'ZodError') return res.status(400).json({ error: 'Validation failed', details: error.issues });
  console.error(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal server error' });
}
