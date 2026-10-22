// In development, use Vite's same-origin proxy so browser hostnames such as
// localhost and 127.0.0.1 don't trigger backend CORS failures.
const API_URL = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_URL || '/api');

export async function api(path, options = {}) {
  const token = localStorage.getItem('clinic_token');
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${API_URL}${path}`, { ...options, headers, body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('clinic:expired'));
    const error = new Error(data?.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    error.details = data?.details;
    throw error;
  }
  return data;
}

export const get = (path) => api(path);
export const post = (path, body) => api(path, { method: 'POST', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
