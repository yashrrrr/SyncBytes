'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Cloud,
  FileCode,
  Layers,
} from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();
  const [customRoom, setCustomRoom] = useState('');

  const handleCreateDocument = () => {
    const id = `doc-${Math.random().toString(36).substring(2, 9)}`;
    router.push(`/doc/${id}`);
  };

  const handleJoinCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (customRoom.trim()) {
      router.push(`/doc/${customRoom.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-indigo-600/10 blur-[130px] rounded-full pointer-events-none" />

      {/* Nav */}
      <nav className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
            SB
          </div>
          <span className="font-bold text-lg tracking-tight">SyncBytes</span>
        </div>

        <div className="flex items-center gap-4 text-sm font-medium">
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            GitHub
          </a>
          <button
            onClick={handleCreateDocument}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 transition-all text-xs font-semibold"
          >
            Launch Editor
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-4xl mx-auto px-6 pt-12 pb-24 text-center z-10 flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-indigo-400 font-medium mb-8">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Cost-Optimized ($5/mo) AWS Distributed Systems Architecture</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-[1.15]">
          Real-Time Collaborative <br />
          <span className="bg-gradient-to-r from-indigo-400 via-sky-300 to-emerald-400 bg-clip-text text-transparent">
            Document & Canvas Studio
          </span>
        </h1>

        <p className="text-slate-400 text-base sm:text-lg max-w-2xl mb-10 leading-relaxed">
          Typing, sketching, and presence cursors synced at sub-20ms latency.
          Powered by Yjs CRDTs, DynamoDB append-only logs, and SQS serverless S3 compaction.
        </p>

        {/* CTA Controls */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center max-w-md mb-14">
          <button
            onClick={handleCreateDocument}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-xl shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>Create New Document</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <form onSubmit={handleJoinCustom} className="w-full sm:w-auto flex items-center gap-2">
            <input
              type="text"
              placeholder="Join room ID..."
              value={customRoom}
              onChange={(e) => setCustomRoom(e.target.value)}
              className="px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors text-slate-200 placeholder:text-slate-500 w-full sm:w-44"
            />
            <button
              type="submit"
              className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors"
            >
              Join
            </button>
          </form>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left w-full mt-4">
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur">
            <div className="w-9 h-9 rounded-lg bg-indigo-950 border border-indigo-800/50 flex items-center justify-center text-indigo-400 mb-3">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-white text-sm mb-1">Yjs CRDT Synchronization</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Conflict-free concurrent document and canvas editing with local IndexedDB persistence and instant offline recovery.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur">
            <div className="w-9 h-9 rounded-lg bg-emerald-950 border border-emerald-800/50 flex items-center justify-center text-emerald-400 mb-3">
              <Cloud className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-white text-sm mb-1">Serverless S3 Compaction</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              DynamoDB append-only delta logs asynchronously compacted into consolidated S3 snapshots via SQS & AWS Lambda.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur">
            <div className="w-9 h-9 rounded-lg bg-sky-950 border border-sky-800/50 flex items-center justify-center text-sky-400 mb-3">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-white text-sm mb-1">Zero-NAT Cost Architecture</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Custom Caddy reverse proxy on single public subnet avoiding $50+/mo ALB & NAT Gateway AWS charges.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        SyncBytes • Real-Time Collaborative Architecture • Built with Next.js, Node.js, Yjs & Terraform
      </footer>
    </div>
  );
}
