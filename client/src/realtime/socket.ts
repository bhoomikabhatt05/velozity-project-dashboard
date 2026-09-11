import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000';

/** Singleton socket instance */
let _socket: Socket | null = null;
let _currentToken: string | null = null;

/**
 * Returns the existing socket if the token hasn't changed.
 * Disconnects and reconnects if the token rotates (e.g. after refresh).
 * Call disconnect() when the user logs out.
 */
export function connectSocket(token: string): Socket {
  if (_socket && _currentToken === token) {
    if (!_socket.connected) _socket.connect();
    return _socket;
  }

  // Token changed or first call — (re)create
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }

  _currentToken = token;
  _socket = io(SOCKET_URL, {
    auth: { token },
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  return _socket;
}

/** Disconnect and clear the singleton (call on logout). */
export function disconnectSocket(): void {
  _socket?.disconnect();
  _socket = null;
  _currentToken = null;
}
