import { randomUUID } from 'node:crypto';

export function makeDocument(fields = {}, actorId = null) {
  const now = new Date().toISOString();
  const id = fields.id || randomUUID();
  return { _id: id, id, ...fields, created_by: fields.created_by ?? actorId, created_at: fields.created_at || now, updated_at: fields.updated_at || now };
}

export function toRecord(document) {
  if (!document) return null;
  const { _id, ...record } = document;
  return { ...record, id: document.id || String(_id) };
}

export function toRecords(documents) {
  return documents.map(toRecord);
}

export function updatedFields(fields = {}) {
  return { ...fields, updated_at: new Date().toISOString() };
}

export function dateOnly(value) {
  return String(value || '').slice(0, 10);
}
