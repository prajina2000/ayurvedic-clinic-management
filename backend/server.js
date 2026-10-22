import app from './app.js';
import { env } from './config/env.js';
import { closeDB, connectDB } from './config/db.js';

let server;
try {
  await connectDB();
  server = app.listen(env.port, () => console.log(`Ayurvedic Clinic API listening on http://localhost:${env.port}`));
} catch (error) {
  console.error('Could not connect to PostgreSQL. Check DATABASE_URL and ensure PostgreSQL is running.', error.message);
  await closeDB();
  process.exitCode = 1;
}

async function shutdown() {
  if (server) await new Promise((resolve) => server.close(resolve));
  await closeDB();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
