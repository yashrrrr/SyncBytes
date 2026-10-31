'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import type { UserPresence } from '@syncbytes/crdt';

// Dynamically load Excalidraw with custom white-labeled MainMenu and WelcomeScreen
const ExcalidrawComponent = dynamic(
  async () => {
    const mod = await import('@excalidraw/excalidraw');
    const Excalidraw = mod.Excalidraw;
    const MainMenu = mod.MainMenu;
    const WelcomeScreen = mod.WelcomeScreen;

    return function CustomExcalidraw(props: any) {
      return (
        <Excalidraw {...props}>
          {/* Custom MainMenu omitting Excalidraw's external URLs, socials, and promotional links */}
          <MainMenu>
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.CommandPalette />
            <MainMenu.DefaultItems.SearchMenu />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>

          {/* White-labeled Welcome Screen */}
          <WelcomeScreen>
            <WelcomeScreen.Hints.MenuHint />
            <WelcomeScreen.Hints.ToolbarHint />
            <WelcomeScreen.Center>
              <WelcomeScreen.Center.Heading>
                SyncBytes Collaborative Studio
              </WelcomeScreen.Center.Heading>
            </WelcomeScreen.Center>
          </WelcomeScreen>
        </Excalidraw>
      );
    };
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium">Loading Whiteboard...</span>
        </div>
      </div>
    ),
  }
);

interface ExcalidrawCanvasProps {
  doc: Y.Doc;
  excalidrawElementsMap: Y.Map<any>;
  provider: WebsocketProvider | null;
  localUser: UserPresence;
  onlineUsers: UserPresence[];
}

export const ExcalidrawCanvas: React.FC<ExcalidrawCanvasProps> = ({
  doc,
  excalidrawElementsMap,
  provider,
  localUser,
  onlineUsers,
}) => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const isSyncingFromRemoteRef = useRef(false);

  // Map online users into Excalidraw Collaborator Map
  const collaborators = useMemo(() => {
    const map = new Map<string, any>();
    onlineUsers.forEach((user) => {
      if (user.id !== localUser.id && user.cursor && user.cursor.view === 'canvas') {
        map.set(user.id, {
          pointer: { x: user.cursor.x, y: user.cursor.y, tool: 'pointer' },
          button: (user.cursor as any).button || 'up',
          selectedElementIds: {},
          username: user.name,
          color: {
            background: user.color,
            stroke: user.color,
          },
        });
      }
    });
    return map;
  }, [onlineUsers, localUser.id]);

  // Update Excalidraw collaborators when presence changes
  useEffect(() => {
    if (!excalidrawAPI) return;
    excalidrawAPI.updateScene({
      collaborators,
    });
  }, [excalidrawAPI, collaborators]);

  // Initial load: populate Excalidraw from Y.Map elements when API is ready
  useEffect(() => {
    if (!excalidrawAPI) return;

    const initialElements = Array.from(excalidrawElementsMap.values());
    if (initialElements.length > 0) {
      isSyncingFromRemoteRef.current = true;
      excalidrawAPI.updateScene({
        elements: initialElements,
      });
      setTimeout(() => {
        isSyncingFromRemoteRef.current = false;
      }, 50);
    }
  }, [excalidrawAPI, excalidrawElementsMap]);

  // Observe remote Yjs updates and update Excalidraw scene
  useEffect(() => {
    if (!excalidrawAPI) return;

    const handleRemoteChanges = (_events: Y.YEvent<any>[], transaction: Y.Transaction) => {
      // Ignore transactions originated by this local Excalidraw instance
      if (transaction.origin === 'excalidraw-local') return;

      const remoteElements = Array.from(excalidrawElementsMap.values());

      isSyncingFromRemoteRef.current = true;
      excalidrawAPI.updateScene({
        elements: remoteElements,
      });

      // Release lock after updateScene finishes
      setTimeout(() => {
        isSyncingFromRemoteRef.current = false;
      }, 50);
    };

    excalidrawElementsMap.observeDeep(handleRemoteChanges);

    return () => {
      excalidrawElementsMap.unobserveDeep(handleRemoteChanges);
    };
  }, [excalidrawAPI, excalidrawElementsMap]);

  // Handle local user edits and push to Y.Doc
  const handleOnChange = useCallback(
    (elements: readonly any[], _appState: any) => {
      if (isSyncingFromRemoteRef.current) return;
      if (!elements || elements.length === 0) return;

      // Group element changes into an atomic Yjs transaction
      doc.transact(() => {
        elements.forEach((el) => {
          const current = excalidrawElementsMap.get(el.id);
          // Only update if element is new or has a newer version / versionNonce
          if (!current || current.version < el.version || current.versionNonce !== el.versionNonce) {
            excalidrawElementsMap.set(el.id, el);
          }
        });
      }, 'excalidraw-local');
    },
    [doc, excalidrawElementsMap]
  );

  // Broadcast mouse pointer to peers via Yjs awareness
  const handlePointerUpdate = useCallback(
    (payload: { pointer: { x: number; y: number }; button: 'down' | 'up' }) => {
      if (!provider) return;

      provider.awareness.setLocalStateField('user', {
        ...localUser,
        cursor: {
          x: payload.pointer.x,
          y: payload.pointer.y,
          view: 'canvas',
          button: payload.button,
        },
        lastActive: Date.now(),
      });
    },
    [provider, localUser]
  );

  return (
    <div
      className="relative w-full h-full overflow-hidden rounded-xl border border-slate-800 shadow-xl"
      style={{ height: '100%', width: '100%' }}
    >
      <ExcalidrawComponent
        excalidrawAPI={(api: any) => setExcalidrawAPI(api)}
        onChange={handleOnChange}
        onPointerUpdate={handlePointerUpdate}
        isCollaborating={true}
        theme="dark"
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: true,
            clearCanvas: true,
            export: {
              saveFileToDisk: true,
            },
            loadScene: false,
            saveToActiveFile: false,
            toggleTheme: false,
          },
        }}
      />
    </div>
  );
};
