import { Router } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import type { toNodeHandler as ToNodeHandlerFn } from 'better-auth/node';
import { getAuth } from '../lib/auth';

// Trace hint only, never executed: keeps this specifier visible to Vercel's
// file tracer (@vercel/nft) so better-auth/node's ESM-only build gets
// included in the deployed function. The actual load below is hidden from
// tsc's dynamic-import-to-require downleveling (see importEsm), which the
// tracer can't see through either — hence needing this hint at all.
if (process.env.__BETTER_AUTH_TRACE_HINT__) {
  require('better-auth/node');
}

// tsc's CommonJS output downlevels `import()` into `require()`, which can't
// load better-auth/node's ESM-only build. `new Function` hides this call
// from that downleveling so it stays a genuine dynamic import.
const importEsm: (specifier: string) => Promise<{ toNodeHandler: typeof ToNodeHandlerFn }> = new Function(
  'specifier',
  'return import(specifier)'
) as never;

const router = Router();

let handlerPromise: Promise<(req: IncomingMessage, res: ServerResponse) => Promise<void>> | null = null;

// Hand off all routing under /api/v1/auth to Better Auth handler
router.all('*', async (req, res) => {
  if (!handlerPromise) {
    handlerPromise = Promise.all([importEsm('better-auth/node'), getAuth()]).then(([{ toNodeHandler }, auth]) =>
      toNodeHandler(auth)
    );
  }
  const handler = await handlerPromise;
  await handler(req, res);
});

export const authRouter: Router = router;
