import axios from 'axios';

// Backend URL. Empty = same origin: in development the Vite proxy forwards /api to the
// backend, so the app also works when opened from a phone. Set VITE_API_URL in production.
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401/403 errors when a logged-in session has expired.
// Guest requests carry no token, so they must not trigger the redirect.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const sentToken = Boolean(error.config?.headers?.Authorization);
    if (sentToken && (error.response?.status === 401 || error.response?.status === 403)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
