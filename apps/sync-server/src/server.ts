import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from './config.js';
import { DocumentRoom } from './room.js';

const rooms = new Map<string, DocumentRoom>();

function getOrCreateRoom(docId: string): DocumentRoom {
  let room = rooms.get(docId);
  if (!room) {
    room = new DocumentRoom(docId);
    rooms.set(docId, room);
    console.log(`[Server] Active room created: ${docId} (Total rooms: ${rooms.size})`);
  }
  return room;
}

const server = http.createServer((req, res) => {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);

  // Health check endpoint for ECS / ALB
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'healthy',
        activeRooms: rooms.size,
        uptime: process.uptime(),
        timestamp: Date.now(),
      })
    );
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const host = request.headers.host || 'localhost';
  const url = new URL(request.url || '/', `http://${host}`);
  const pathname = url.pathname;

  // Handle /ws/:docId or /ws?room=:docId
  let docId: string | null = null;
  if (pathname.startsWith('/ws/')) {
    docId = pathname.replace('/ws/', '').trim();
  } else if (url.searchParams.has('room')) {
    docId = url.searchParams.get('room')?.trim() || null;
  }

  if (!docId) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request, docId);
  });
});

wss.on('connection', async (ws: WebSocket, _request: http.IncomingMessage, docId: string) => {
  try {
    const room = getOrCreateRoom(docId);
    await room.addConnection(ws);
    console.log(`[WS] Client joined document: "${docId}" (${room.conns.size} connected)`);
  } catch (err: any) {
    console.error(`[WS] Connection error on document "${docId}":`, err.message);
    ws.close(1011, 'Internal Server Error');
  }
});

server.listen(config.port, config.host, () => {
  console.log(`🚀 SyncBytes WebSocket Server listening on http://${config.host}:${config.port}`);
  console.log(`📡 WebSocket endpoint ready at ws://${config.host}:${config.port}/ws/:docId`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('\n[Server] Shutting down gracefully...');
  server.close(() => {
    console.log('[Server] HTTP/WS server closed.');
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
