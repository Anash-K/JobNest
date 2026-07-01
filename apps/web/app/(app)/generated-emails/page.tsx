import { Suspense } from 'react';
import GeneratedEmailsContent from './GeneratedEmailsContent';

export default function GeneratedEmailsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading…</div>}>
      <GeneratedEmailsContent />
    </Suspense>
  );
}
