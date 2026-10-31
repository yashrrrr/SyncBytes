'use client';

import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import type { WebsocketProvider } from 'y-websocket';
import * as Y from 'yjs';
import type { UserPresence } from '@syncbytes/crdt';
import {
  Bold,
  Italic,
  Code,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
} from 'lucide-react';

interface RichTextEditorProps {
  doc: Y.Doc;
  provider: WebsocketProvider | null;
  localUser: UserPresence;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  doc,
  provider,
  localUser,
}) => {
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          history: false, // Collaboration extension handles distributed undo/redo
        }),
        Collaboration.configure({
          document: doc,
        }),
        ...(provider
          ? [
              CollaborationCursor.configure({
                provider,
                user: {
                  name: localUser.name,
                  color: localUser.color,
                },
              }),
            ]
          : []),
      ],
      editorProps: {
        attributes: {
          class:
            'prose prose-invert max-w-none focus:outline-none min-h-[500px] p-6 text-slate-100 text-base leading-relaxed',
        },
      },
      immediatelyRender: false,
    },
    [doc, provider]
  );

  if (!editor) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Initializing collaborative editor...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-xl border border-slate-800 shadow-xl overflow-hidden">
      {/* Editor Formatting Toolbar */}
      <div className="flex items-center gap-1 p-2 bg-slate-950/80 border-b border-slate-800/80">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-2 rounded hover:bg-slate-800 text-slate-300 transition-colors ${
            editor.isActive('bold') ? 'bg-slate-800 text-indigo-400 font-bold' : ''
          }`}
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-2 rounded hover:bg-slate-800 text-slate-300 transition-colors ${
            editor.isActive('italic') ? 'bg-slate-800 text-indigo-400 font-bold' : ''
          }`}
          title="Italic (Ctrl+I)"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`p-2 rounded hover:bg-slate-800 text-slate-300 transition-colors ${
            editor.isActive('code') ? 'bg-slate-800 text-indigo-400 font-bold' : ''
          }`}
          title="Inline Code"
        >
          <Code className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-800 mx-1" />

        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`p-2 rounded hover:bg-slate-800 text-slate-300 transition-colors ${
            editor.isActive('heading', { level: 1 }) ? 'bg-slate-800 text-indigo-400 font-bold' : ''
          }`}
          title="Heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-2 rounded hover:bg-slate-800 text-slate-300 transition-colors ${
            editor.isActive('heading', { level: 2 }) ? 'bg-slate-800 text-indigo-400 font-bold' : ''
          }`}
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-800 mx-1" />

        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded hover:bg-slate-800 text-slate-300 transition-colors ${
            editor.isActive('bulletList') ? 'bg-slate-800 text-indigo-400 font-bold' : ''
          }`}
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-2 rounded hover:bg-slate-800 text-slate-300 transition-colors ${
            editor.isActive('orderedList') ? 'bg-slate-800 text-indigo-400 font-bold' : ''
          }`}
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`p-2 rounded hover:bg-slate-800 text-slate-300 transition-colors ${
            editor.isActive('blockquote') ? 'bg-slate-800 text-indigo-400 font-bold' : ''
          }`}
          title="Blockquote"
        >
          <Quote className="w-4 h-4" />
        </button>
      </div>

      {/* Main Document Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
