import axios from 'axios';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api', withCredentials: true });
let accessToken: string | null = null; export const setAccessToken = (token: string | null) => { accessToken = token; };
api.interceptors.request.use(c => { if (accessToken) c.headers.Authorization = `Bearer ${accessToken}`; return c; });

