import { use } from 'react';
import { CollaborativeWorkspace } from '@/components/collaborative-workspace';

interface DocumentPageProps {
  params: Promise<{ id: string }>;
}

export default function DocumentPage({ params }: DocumentPageProps) {
  const resolvedParams = use(params);
  return <CollaborativeWorkspace docId={resolvedParams.id} />;
}
