import { env } from '../config/env.js';
export function clinicDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
