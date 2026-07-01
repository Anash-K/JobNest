'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { getHealth, ApiClientError } from '@/lib/api-client';
import type { HealthCheckResponse } from '@jobhunter/shared';

/**
 * API + database connectivity indicator in the top bar.
 * Polls health endpoint on mount — lightweight fault visibility for local dev.
 */
export function ApiStatusBadge() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const data = await getHealth();
        if (!cancelled) {
          setHealth(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setHealth(null);
          setError(err instanceof ApiClientError ? err.message : 'API offline');
        }
      }
    }

    void check();
    const interval = setInterval(() => void check(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return <Badge variant="destructive">API Offline</Badge>;
  }

  if (!health) {
    return <Badge variant="secondary">Checking...</Badge>;
  }

  if (health.status === 'degraded') {
    return <Badge variant="warning">DB Degraded</Badge>;
  }

  return (
    <Badge variant="success">
      API OK · {health.database.latencyMs ?? 0}ms
    </Badge>
  );
}
