// src/lib/analytics.ts (or wherever you keep this)
import { supabaseClient } from './supaClient';

/* ------------------------------------------------------------------ */
/* UUID (no-runtime-errors on Safari / older browsers / SSR)          */
/* ------------------------------------------------------------------ */
function safeRandomHexByte(): string {
  // Best source first
  if (typeof globalThis !== 'undefined') {
    const g: any = globalThis as any;
    if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
      const b = new Uint8Array(1);
      g.crypto.getRandomValues(b);
      return b[0].toString(16).padStart(2, '0');
    }
  }
  // Fallback: Math.random (not cryptographically strong, but fine for session IDs)
  return Math.floor(Math.random() * 256)
    .toString(16)
    .padStart(2, '0');
}

function generateUUID(): string {
  // Try native if available (and really a function)
  const g: any = typeof globalThis !== 'undefined' ? (globalThis as any) : {};
  if (g.crypto && typeof g.crypto.randomUUID === 'function') {
    try {
      return g.crypto.randomUUID();
    } catch {
      // fall through to manual generation
    }
  }

  // RFC4122-ish v4 UUID
  // x = random hex; y = variant nibble (8..b)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const byte = parseInt(safeRandomHexByte(), 16);
    const v = c === 'x' ? byte : (byte & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ------------------------------------------------------------------ */
/* Stable per-browser session id (localStorage)                        */
/* ------------------------------------------------------------------ */
function getSessionId(): string {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const key = 'session_id';
      let sid = window.localStorage.getItem(key);
      if (!sid) {
        sid = generateUUID();
        window.localStorage.setItem(key, sid);
      }
      return sid;
    }
  } catch {
    // ignore storage errors
  }
  // SSR or storage blocked — still return a UUID (ephemeral)
  return generateUUID();
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
type Suggested = { code: string; confidence: number; label?: string };

export type EventType =
  | 'search_performed'
  | 'suggestions_shown'
  | 'search_failed'
  | 'result_clicked'
  | 'estimator_loaded'
  | 'estimate_requested'
  | 'estimate_success'
  | 'estimate_failed'
  | 'estimate_auto_updated'
  | 'code_changed'
  | 'origin_selected'
  | 'alternate_selected'
  | 'de_minimis_applied'
  | 'estimator_error';

export type EventPayload = {
  event_type: EventType;

  // search
  search_term?: string;
  normalized_term?: string;

  // suggestions
  suggested_codes?: Suggested[];
  suggestions_count?: number;

  // clicks
  clicked_code?: string;

  // estimator inputs
  origin_country?: string;
  hs_code?: string;
  price_usd?: number | null;
  qty?: number | null;
  weight_kg?: number | null;

  // estimator outputs
  rate?: number | null;
  duty_usd?: number | null;

  // misc flags
  estimator_loaded?: boolean;
  code_changed?: boolean;

  // errors / stages
  error_message?: string;
  stage?: string;

  // any extra fields we may add ad-hoc
  [key: string]: unknown;
};

/* ------------------------------------------------------------------ */
/* Context helpers                                                     */
/* ------------------------------------------------------------------ */
function getDeviceType(ua: string): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  const s = (ua || '').toLowerCase();
  if (!s) return 'unknown';
  if (/ipad|tablet/.test(s)) return 'tablet';
  if (/mobi|iphone|android/.test(s)) return 'mobile';
  return 'desktop';
}

function getUA(): string {
  try {
    return typeof navigator !== 'undefined' ? (navigator.userAgent ?? '') : '';
  } catch {
    return '';
  }
}

function getReferrer(): string {
  try {
    return typeof document !== 'undefined' ? (document.referrer ?? '') : '';
  } catch {
    return '';
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */
export async function logEvent(e: EventPayload): Promise<void> {
  try {
    const session_id = getSessionId();
    const ua = getUA();
    const referrer_url = getReferrer();

    const context = {
      session_id,
      device_type: getDeviceType(ua),
      referrer_url,
      user_agent: ua,
    };

    const row = { ...context, ...e };

    // Fire-and-forget; never block UX on failures.
    const { error } = await supabaseClient.from('user_events').insert(row);
    // Optional debug:
    // if (error) console.warn('logEvent failed', error, row);
  } catch {
    // Swallow – telemetry must never throw.
  }
}
