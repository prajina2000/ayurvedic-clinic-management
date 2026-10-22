import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

const transactionContext = new AsyncLocalStorage();
let prisma;
let database;

export async function connectDB() {
  if (database) return database;
  prisma = new PrismaClient();
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    database = new PrismaDatabase();
    return database;
  } catch (error) {
    await prisma.$disconnect().catch(() => {});
    prisma = undefined;
    throw error;
  }
}

export function getDb() {
  if (!database) throw new Error('PostgreSQL is not connected');
  return database;
}

export async function closeDB() {
  const current = prisma;
  database = undefined;
  prisma = undefined;
  if (current) await current.$disconnect();
}

export async function withTransaction(callback) {
  const active = transactionContext.getStore();
  if (active) return callback(database, active);
  if (!prisma) throw new Error('PostgreSQL is not connected');

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(
        (transaction) => transactionContext.run(transaction, () => callback(database, transaction)),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 },
      );
    } catch (error) {
      if (attempt >= 3 || !isRetryableTransactionError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

class PrismaDatabase {
  collection(name) {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error('Invalid database collection name');
    return new PrismaCollection(name);
  }

  async command() {
    await executor().$queryRaw`SELECT 1`;
    return { ok: 1 };
  }
}

class PrismaCollection {
  constructor(name) { this.name = name; }

  find(filter = {}, options = {}) { return new PrismaCursor(this, filter, options); }

  async findOne(filter = {}, options = {}) {
    const rows = await new PrismaCursor(this, filter, { ...options, limit: 1 }).toArray();
    return rows[0] || null;
  }

  async insertOne(document, options = {}) {
    const data = structuredClone(document);
    const key = String(data._id ?? data.id ?? randomUUID());
    data._id ??= key;
    await executor(options.session).clinicDocument.create({ data: { collectionName: this.name, documentId: key, data } });
    return { acknowledged: true, insertedId: key };
  }

  async insertMany(documents, options = {}) {
    const insertedIds = {};
    for (const [index, document] of documents.entries()) {
      const result = await this.insertOne(document, options);
      insertedIds[index] = result.insertedId;
    }
    return { acknowledged: true, insertedCount: documents.length, insertedIds };
  }

  async updateOne(filter, update, options = {}) {
    return mutateWithLock(options.session, async (client) => {
      let current = await this.#findOne(filter, client);
      if (!current && options.upsert) {
        const created = makeUpsertDocument(filter, update);
        await this.#insert(created, client);
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: created._id };
      }
      if (!current) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      const updated = applyUpdate(current, update, false);
      await this.#replace(current, updated, client);
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    });
  }

  async findOneAndUpdate(filter, update, options = {}) {
    return mutateWithLock(options.session, async (client) => {
      const current = await this.#findOne(filter, client);
      if (current) {
        const updated = applyUpdate(current, update, false);
        await this.#replace(current, updated, client);
        return options.returnDocument === 'before' ? current : updated;
      }
      if (!options.upsert) return null;
      const created = makeUpsertDocument(filter, update);
      await this.#insert(created, client);
      return created;
    });
  }

  async replaceOne(filter, replacement, options = {}) {
    return mutateWithLock(options.session, async (client) => {
      const current = await this.#findOne(filter, client);
      if (!current) {
        if (!options.upsert) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        const created = { ...structuredClone(replacement) };
        created._id ??= String(created.id || randomUUID());
        created.id ??= String(created._id);
        await this.#insert(created, client);
        return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedId: created._id };
      }
      const updated = { ...structuredClone(replacement), _id: current._id ?? current.id ?? replacement._id };
      await this.#replace(current, updated, client);
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    });
  }

  async deleteOne(filter, options = {}) {
    return mutateWithLock(options.session, async (client) => {
      const current = await this.#findOne(filter, client);
      if (!current) return { acknowledged: true, deletedCount: 0 };
      await client.clinicDocument.delete({ where: documentKey(this.name, current._id ?? current.id) });
      return { acknowledged: true, deletedCount: 1 };
    });
  }

  async countDocuments(filter = {}, options = {}) {
    const client = executor(options.session);
    if (!Object.keys(filter).length) return client.clinicDocument.count({ where: { collectionName: this.name } });
    return (await this.#all(client)).filter((document) => matchesFilter(document, filter)).length;
  }

  // Indexes are declared in the checked-in Prisma migration, not created at request time.
  async createIndex() { return null; }

  aggregate(pipeline = [], options = {}) { return new PrismaAggregateCursor(this, pipeline, options); }

  list(session) { return this.#all(executor(session)); }

  async #all(client = executor()) {
    const rows = await client.clinicDocument.findMany({ where: { collectionName: this.name }, select: { data: true } });
    return rows.map(({ data }) => data);
  }

  async #findOne(filter, client) {
    return (await this.#all(client)).find((document) => matchesFilter(document, filter)) || null;
  }

  async #insert(document, client) {
    const key = String(document._id ?? document.id ?? randomUUID());
    const data = { ...document, _id: document._id ?? key };
    await client.clinicDocument.create({ data: { collectionName: this.name, documentId: key, data } });
    return data;
  }

  async #replace(previous, next, client) {
    const key = String(previous._id ?? previous.id);
    next._id ??= key;
    await client.clinicDocument.update({ where: documentKey(this.name, key), data: { data: next } });
  }
}

class PrismaCursor {
  constructor(collection, filter, options) {
    this.collection = collection;
    this.filter = filter;
    this.options = options;
    this.order = {};
    this.offset = 0;
    this.rowLimit = null;
    this.projection = options.projection || null;
  }
  sort(order) { this.order = order || {}; return this; }
  skip(count) { this.offset = Math.max(0, Number(count) || 0); return this; }
  limit(count) { this.rowLimit = Math.max(0, Number(count) || 0); return this; }
  project(fields) { this.projection = fields; return this; }

  async toArray() {
    const rows = (await this.collection.list(this.options.session)).filter((document) => matchesFilter(document, this.filter));
    if (Object.keys(this.order).length) rows.sort((left, right) => compareDocuments(left, right, this.order));
    const page = rows.slice(this.offset, this.rowLimit === null ? undefined : this.offset + this.rowLimit);
    return page.map((document) => projectDocument(document, this.projection));
  }
}

class PrismaAggregateCursor {
  constructor(collection, pipeline, options) { this.collection = collection; this.pipeline = pipeline; this.options = options; }
  async toArray() {
    let rows = [];
    for (const stage of this.pipeline) {
      if (stage.$match) rows = (await this.collection.list(this.options.session)).filter((document) => matchesFilter(document, stage.$match));
      if (stage.$group) {
        const { _id, ...accumulators } = stage.$group;
        const groups = new Map();
        for (const row of rows) {
          const groupKey = _id === null ? null : readPath(row, String(_id).replace(/^\$/, ''));
          const key = JSON.stringify(groupKey);
          const bucket = groups.get(key) || { _id: groupKey };
          for (const [name, expression] of Object.entries(accumulators)) {
            if (expression?.$sum === undefined) continue;
            const value = typeof expression.$sum === 'string' && expression.$sum.startsWith('$') ? readPath(row, expression.$sum.slice(1)) : expression.$sum;
            bucket[name] = Number(bucket[name] || 0) + Number(value || 0);
          }
          groups.set(key, bucket);
        }
        rows = [...groups.values()];
      }
    }
    return rows;
  }
}

function executor(session) {
  const client = session || transactionContext.getStore() || prisma;
  if (!client) throw new Error('PostgreSQL is not connected');
  return client;
}

async function mutateWithLock(session, callback) {
  const active = session || transactionContext.getStore();
  if (active) return callback(active);
  return withTransaction((database, transaction) => callback(transaction));
}

function documentKey(collectionName, documentId) {
  return { collectionName_documentId: { collectionName, documentId: String(documentId) } };
}

function makeUpsertDocument(filter, update) {
  const initial = {};
  for (const [field, value] of Object.entries(filter || {})) {
    assertFieldName(field);
    if (field.startsWith('$') || isOperatorObject(value)) continue;
    initial[field] = value;
  }
  if (initial.id === undefined && initial._id !== undefined && typeof initial._id === 'string' && !initial._id.includes(':')) initial.id = initial._id;
  const inserted = applyUpdate(initial, update, true);
  inserted._id ??= String(inserted.id || randomUUID());
  return inserted;
}

function applyUpdate(current, update, inserting) {
  if (!Object.keys(update || {}).some((key) => key.startsWith('$'))) return { ...structuredClone(update), _id: current._id ?? update._id };
  const next = structuredClone(current);
  for (const [field, value] of Object.entries(update.$setOnInsert || {})) if (inserting) setPath(next, field, value);
  for (const [field, value] of Object.entries(update.$set || {})) setPath(next, field, value);
  for (const [field, value] of Object.entries(update.$inc || {})) setPath(next, field, Number(readPath(next, field) || 0) + Number(value));
  for (const [field, value] of Object.entries(update.$max || {})) if (readPath(next, field) === undefined || readPath(next, field) < value) setPath(next, field, value);
  for (const field of Object.keys(update.$unset || {})) unsetPath(next, field);
  return next;
}

function matchesFilter(document, filter = {}) {
  return Object.entries(filter || {}).every(([field, expected]) => {
    if (field === '$or') return (expected || []).some((part) => matchesFilter(document, part));
    if (field === '$and') return (expected || []).every((part) => matchesFilter(document, part));
    if (field.startsWith('$')) throw new Error(`Unsupported query operator ${field}`);
    assertFieldName(field.split('.')[0]);
    const actual = readPath(document, field);
    if (!isOperatorObject(expected)) return jsonEqual(actual, expected);
    return Object.entries(expected).every(([operator, operand]) => {
      if (operator === '$options') return true;
      if (operator === '$regex') {
        const regex = new RegExp(String(operand), String(expected.$options || '').includes('i') ? 'i' : '');
        return regex.test(String(actual ?? ''));
      }
      if (operator === '$exists') return hasPath(document, field) === Boolean(operand);
      if (operator === '$eq') return jsonEqual(actual, operand);
      if (operator === '$ne') return !jsonEqual(actual, operand);
      if (operator === '$in') return (operand || []).some((candidate) => stringEqual(actual, candidate));
      if (operator === '$nin') return !(operand || []).some((candidate) => stringEqual(actual, candidate));
      if (['$gt', '$gte', '$lt', '$lte'].includes(operator)) {
        if (actual === undefined || actual === null) return false;
        const comparison = compareFilterValues(actual, operand);
        return ({ $gt: comparison > 0, $gte: comparison >= 0, $lt: comparison < 0, $lte: comparison <= 0 })[operator];
      }
      throw new Error(`Unsupported query operator ${operator}`);
    });
  });
}

function isOperatorObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && Object.keys(value).some((key) => key.startsWith('$')));
}
function jsonEqual(left, right) { return JSON.stringify(left ?? null) === JSON.stringify(right ?? null); }
function stringEqual(left, right) { return left !== undefined && left !== null && right !== null && String(left) === String(right); }
function compareFilterValues(left, right) {
  if (typeof right === 'number') return Number(left) - right;
  return String(left).localeCompare(String(right));
}
function compareDocuments(left, right, order) {
  for (const [field, direction] of Object.entries(order)) {
    assertFieldName(field.split('.')[0]);
    const a = readPath(left, field); const b = readPath(right, field);
    if (a === b) continue;
    const result = a === undefined || a === null ? 1 : b === undefined || b === null ? -1 : typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    if (result) return Number(direction) < 0 ? -result : result;
  }
  return 0;
}
function projectDocument(document, projection) {
  if (!projection || !Object.keys(projection).length) return document;
  const entries = Object.entries(projection);
  const include = entries.filter(([, value]) => Boolean(value)).map(([field]) => field);
  if (include.length) return Object.fromEntries(include.filter((field) => readPath(document, field) !== undefined).map((field) => [field, readPath(document, field)]));
  const result = { ...document };
  for (const [field, value] of entries) if (!value) unsetPath(result, field);
  return result;
}
function assertFieldName(field) { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) throw new Error('Invalid document field name'); }
function readPath(value, path) { return String(path).split('.').reduce((current, part) => current?.[part], value); }
function hasPath(value, path) { const parts = String(path).split('.'); let current = value; for (const part of parts) { if (!current || !Object.hasOwn(current, part)) return false; current = current[part]; } return true; }
function setPath(target, path, value) { const parts = path.split('.'); let current = target; for (const part of parts.slice(0, -1)) current = current[part] ||= {}; current[parts.at(-1)] = value; }
function unsetPath(target, path) { const parts = path.split('.'); let current = target; for (const part of parts.slice(0, -1)) current = current?.[part]; if (current) delete current[parts.at(-1)]; }
function isRetryableTransactionError(error) { return error?.code === 'P2034' || error?.code === 'P2002'; }
