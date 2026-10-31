'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import * as Y from 'yjs';
import type { WebsocketProvider } from 'y-websocket';
import type { UserPresence } from '@syncbytes/crdt';

// Dynamically load Excalidraw with custom white-labeled MainMenu and WelcomeScreen
let excalidrawLib: any = null;

const ExcalidrawComponent = dynamic(
  async () => {
    const mod = await import('@excalidraw/excalidraw');
    excalidrawLib = mod;
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
  const lastPointerSyncRef = useRef<number>(0);

  // Preload excalidrawLib on client mount if not already loaded
  useEffect(() => {
    if (!excalidrawLib && typeof window !== 'undefined') {
      import('@excalidraw/excalidraw').then((mod) => {
        excalidrawLib = mod;
      });
    }
  }, []);

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
        captureUpdate: excalidrawLib?.CaptureUpdateAction?.NEVER ?? 'NEVER',
      });
      setTimeout(() => {
        isSyncingFromRemoteRef.current = false;
      }, 50);
    }
  }, [excalidrawAPI, excalidrawElementsMap]);

  // Observe remote Yjs updates and update Excalidraw scene using reconcileElements
  useEffect(() => {
    if (!excalidrawAPI) return;

    const handleRemoteChanges = (_events: Y.YEvent<any>[], transaction: Y.Transaction) => {
      // Ignore transactions originated by this local Excalidraw instance
      if (transaction.origin === 'excalidraw-local') return;

      const remoteElements = Array.from(excalidrawElementsMap.values());
      const localAppState = excalidrawAPI.getAppState ? excalidrawAPI.getAppState() : {};
      const localElements = excalidrawAPI.getSceneElementsIncludingDeleted
        ? excalidrawAPI.getSceneElementsIncludingDeleted()
        : [];

      let finalElements: any[] = remoteElements;
      if (excalidrawLib?.reconcileElements) {
        const restoredRemote = excalidrawLib.restoreElements
          ? excalidrawLib.restoreElements(remoteElements, localElements)
          : remoteElements;

        finalElements = excalidrawLib.reconcileElements(
          localElements,
          restoredRemote,
          localAppState
        );
      }

      isSyncingFromRemoteRef.current = true;
      excalidrawAPI.updateScene({
        elements: finalElements,
        captureUpdate: excalidrawLib?.CaptureUpdateAction?.NEVER ?? 'NEVER',
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

  // Helper to sync elements to Yjs with dirty-checking and deep cloning
  const syncElementsToYjs = useCallback(
    (elementsToSync: readonly any[]) => {
      if (isSyncingFromRemoteRef.current) return;
      if (!elementsToSync || elementsToSync.length === 0) return;

      doc.transact(() => {
        elementsToSync.forEach((el) => {
          const current = excalidrawElementsMap.get(el.id);
          const hasChanged =
            !current ||
            current.version !== el.version ||
            current.versionNonce !== el.versionNonce ||
            current.x !== el.x ||
            current.y !== el.y ||
            current.width !== el.width ||
            current.height !== el.height ||
            current.isDeleted !== el.isDeleted ||
            (Array.isArray(el.points) &&
              (!current.points ||
                current.points.length !== el.points.length ||
                current.points[current.points.length - 1]?.[0] !==
                  el.points[el.points.length - 1]?.[0] ||
                current.points[current.points.length - 1]?.[1] !==
                  el.points[el.points.length - 1]?.[1]));

          if (hasChanged) {
            // Deep clone so that future in-place mutations by Excalidraw's engine do NOT
            // alter the stored reference in memory, allowing subsequent diffs to detect changes accurately
            excalidrawElementsMap.set(el.id, JSON.parse(JSON.stringify(el)));
          }
        });
      }, 'excalidraw-local');
    },
    [doc, excalidrawElementsMap]
  );

  // Handle local user edits and push to Y.Doc
  const handleOnChange = useCallback(
    (elements: readonly any[], _appState: any) => {
      syncElementsToYjs(elements);
    },
    [syncElementsToYjs]
  );

  // Broadcast mouse pointer to peers via Yjs awareness and sync in-progress drawing strokes
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

      // While the user is actively drawing/dragging, broadcast real-time stroke coordinates throttled (~35ms)
      if (payload.button === 'down' && excalidrawAPI) {
        const now = Date.now();
        if (now - lastPointerSyncRef.current > 35) {
          lastPointerSyncRef.current = now;
          const liveElements = excalidrawAPI.getSceneElementsIncludingDeleted();
          syncElementsToYjs(liveElements);
        }
      } else if (payload.button === 'up' && excalidrawAPI) {
        // Sync final state on pointer up
        const liveElements = excalidrawAPI.getSceneElementsIncludingDeleted();
        syncElementsToYjs(liveElements);
      }
    },
    [provider, localUser, excalidrawAPI, syncElementsToYjs]
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
