import { io, type Socket } from 'socket.io-client';
export const connectSocket = (token: string): Socket => io(import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000', { auth: { token }, withCredentials: true });

