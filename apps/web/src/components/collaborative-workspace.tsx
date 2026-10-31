'use client';

import React, { useState, useEffect } from 'react';
import { useYjsRoom } from '../hooks/use-yjs-room';
import { RichTextEditor } from './editor/rich-text-editor';
import { ExcalidrawCanvas } from './canvas/excalidraw-canvas';
import {
  FileText,
  LayoutGrid,
  Columns,
  Share2,
  Wifi,
  WifiOff,
  Users,
  Copy,
  Check,
} from 'lucide-react';

interface CollaborativeWorkspaceProps {
  docId: string;
}

type WorkspaceViewMode = 'split' | 'doc' | 'canvas';

export const CollaborativeWorkspace: React.FC<CollaborativeWorkspaceProps> = ({ docId }) => {
  const {
    doc,
    provider,
    status,
    localUser,
    onlineUsers,
    excalidrawElementsMap,
    metadataMap,
  } = useYjsRoom(docId);

  const [viewMode, setViewMode] = useState<WorkspaceViewMode>('split');
  const [title, setTitle] = useState('Untitled Document');
  const [copied, setCopied] = useState(false);

  // Sync title from metadataMap
  useEffect(() => {
    const handleMetaUpdate = () => {
      const remoteTitle = metadataMap.get('title');
      if (remoteTitle && remoteTitle !== title) {
        setTitle(remoteTitle);
      }
    };

    handleMetaUpdate();
    metadataMap.observe(handleMetaUpdate);
    return () => {
      metadataMap.unobserve(handleMetaUpdate);
    };
  }, [metadataMap, title]);

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    metadataMap.set('title', newTitle);
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/60 backdrop-blur px-4 flex items-center justify-between shrink-0 z-40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              SB
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="bg-transparent hover:bg-slate-800/60 focus:bg-slate-800/90 text-sm font-semibold px-2 py-1 rounded outline-none border border-transparent focus:border-slate-700 transition-colors w-52 md:w-72"
              placeholder="Document Title"
            />
          </div>

          {/* Connection Status Pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              status === 'connected'
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
                : status === 'connecting'
                ? 'bg-amber-950/40 text-amber-400 border-amber-800/50'
                : 'bg-rose-950/40 text-rose-400 border-rose-800/50'
            }`}
          >
            {status === 'connected' ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Live Sync</span>
              </>
            ) : status === 'connecting' ? (
              <>
                <Wifi className="w-3 h-3 animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                <span>Offline Cache</span>
              </>
            )}
          </div>
        </div>

        {/* View Mode Controls */}
        <div className="flex items-center p-1 bg-slate-950 rounded-lg border border-slate-800">
          <button
            onClick={() => setViewMode('doc')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'doc'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Doc</span>
          </button>
          <button
            onClick={() => setViewMode('split')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'split'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Split</span>
          </button>
          <button
            onClick={() => setViewMode('canvas')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'canvas'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Canvas</span>
          </button>
        </div>

        {/* Collaborators & Sharing */}
        <div className="flex items-center gap-3">
          {/* Active online user avatars */}
          <div className="flex items-center -space-x-2 overflow-hidden">
            {onlineUsers.slice(0, 5).map((user) => (
              <div
                key={user.id}
                title={`${user.name} (${user.id === localUser.id ? 'You' : 'Collaborator'})`}
                style={{ backgroundColor: user.color }}
                className="w-7 h-7 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold text-white shadow uppercase"
              >
                {user.name.slice(0, 2)}
              </div>
            ))}
            {onlineUsers.length > 5 && (
              <div className="w-7 h-7 rounded-full bg-slate-800 border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-300">
                +{onlineUsers.length - 5}
              </div>
            )}
          </div>

          {/* Share Button */}
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copied ? 'Link Copied' : 'Share'}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 min-h-0 overflow-hidden p-3 gap-3 flex">
        {(viewMode === 'doc' || viewMode === 'split') && (
          <div className={`h-full ${viewMode === 'split' ? 'w-1/2' : 'w-full'} transition-all duration-200`}>
            <RichTextEditor doc={doc} provider={provider} localUser={localUser} />
          </div>
        )}

        {(viewMode === 'canvas' || viewMode === 'split') && (
          <div className={`h-full ${viewMode === 'split' ? 'w-1/2' : 'w-full'} transition-all duration-200`}>
            <ExcalidrawCanvas
              doc={doc}
              excalidrawElementsMap={excalidrawElementsMap}
              provider={provider}
              localUser={localUser}
              onlineUsers={onlineUsers}
            />
          </div>
        )}
      </main>
    </div>
  );
};
