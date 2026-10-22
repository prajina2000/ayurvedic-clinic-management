export const validate = (schema, source = 'body') => (req, res, next) => {
  const parsed = schema.safeParse(req[source]);
  if (!parsed.success) return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
  req[source] = parsed.data;
  next();
};
