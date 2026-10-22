import { makeDocument } from './recordUtils.js';

export async function audit(db, { actorId, action, entity, entityId, details = {} }, session) {
  await db.collection('audit_log').insertOne(makeDocument({ actor_id: actorId || null, action, entity, entity_id: entityId || null, details }), { session });
}
