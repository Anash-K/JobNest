import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import WebSocket from 'ws';

// Singleton Supabase admin client using the Service Role Key
// Never expose this to the frontend.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    transport: WebSocket as any
  }
});
