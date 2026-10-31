'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import {
  initHybridDoc,
  getRandomColor,
  type UserPresence,
  type CanvasShape,
} from '@syncbytes/crdt';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface UseYjsRoomReturn {
  doc: Y.Doc;
  provider: WebsocketProvider | null;
  status: ConnectionStatus;
  localUser: UserPresence;
  onlineUsers: UserPresence[];
  shapesMap: Y.Map<CanvasShape>;
  excalidrawElementsMap: Y.Map<any>;
  excalidrawFilesMap: Y.Map<any>;
  textFragment: Y.XmlFragment;
  metadataMap: Y.Map<any>;
}

export function useYjsRoom(docId: string, userName?: string): UseYjsRoomReturn {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [onlineUsers, setOnlineUsers] = useState<UserPresence[]>([]);

  // Stable random user profile for this session
  const localUser = useMemo<UserPresence>(() => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return {
      id: `user-${randomNum}`,
      name: userName || `Collaborator ${randomNum}`,
      color: getRandomColor(),
      cursor: null,
      lastActive: Date.now(),
    };
  }, [userName]);

  // Persistent Y.Doc instance across renders
  const hybrid = useMemo(() => {
    const ydoc = new Y.Doc();
    return initHybridDoc(ydoc);
  }, [docId]);

  const providerRef = useRef<WebsocketProvider | null>(null);

  useEffect(() => {
    // 1. Determine WebSocket URL (support direct connection, port 4000 locally, or Caddy /ws)
    let wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsUrl && typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      if (window.location.port === '3000') {
        // Direct to sync server on local dev port 4000
        wsUrl = `${protocol}//${window.location.hostname}:4000/ws`;
      } else {
        // Via Caddy reverse proxy
        wsUrl = `${protocol}//${window.location.host}/ws`;
      }
    }

    const { doc } = hybrid;

    // 2. Initialize IndexedDB offline persistence provider
    const persistence = new IndexeddbPersistence(`syncbytes-doc-${docId}`, doc);
    persistence.on('synced', () => {
      console.log(`[IndexedDB] Document "${docId}" loaded from local offline storage.`);
    });

    // 3. Initialize WebSocket Provider
    const provider = new WebsocketProvider(wsUrl || 'ws://localhost:4000/ws', docId, doc, {
      connect: true,
    });
    providerRef.current = provider;

    // 4. Set local awareness
    provider.awareness.setLocalStateField('user', localUser);

    // 5. Track connection status
    provider.on('status', (event: { status: ConnectionStatus }) => {
      setStatus(event.status);
    });

    // 6. Track peer awareness updates (presence cursors, users)
    const handleAwarenessChange = () => {
      const states = provider.awareness.getStates();
      const users: UserPresence[] = [];

      states.forEach((state: any, clientID: number) => {
        if (state.user) {
          users.push({
            ...state.user,
            id: String(clientID),
          });
        }
      });

      setOnlineUsers(users);
    };

    provider.awareness.on('change', handleAwarenessChange);

    return () => {
      provider.awareness.off('change', handleAwarenessChange);
      provider.destroy();
      persistence.destroy();
    };
  }, [docId, hybrid, localUser]);

  return {
    doc: hybrid.doc,
    provider: providerRef.current,
    status,
    localUser,
    onlineUsers,
    shapesMap: hybrid.shapesMap,
    excalidrawElementsMap: hybrid.excalidrawElementsMap,
    excalidrawFilesMap: hybrid.excalidrawFilesMap,
    textFragment: hybrid.textFragment,
    metadataMap: hybrid.metadataMap,
  };
}
