import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SyncBytes | Real-Time Collaborative Hybrid Editor',
  description: 'Production-ready real-time collaborative document and whiteboard workspace powered by Yjs CRDTs.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
