import { supabaseClient } from './supaClient';

// Safe UUID generator
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback for browsers without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r =
      (crypto && crypto.getRandomValues
        ? crypto.getRandomValues(new Uint8Array(1))[0]
        : Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getSessionId() {
  let sid = typeof localStorage !== 'undefined' ? localStorage.getItem('session_id') : null;
  if (!sid) {
    sid = generateUUID();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('session_id', sid);
    }
  }
  return sid;
}

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
  | 'alternate_selected';

export type EventPayload = {
  event_type: EventType;
  search_term?: string;
  normalized_term?: string;
  suggested_codes?: Suggested[];
  suggestions_count?: number;
  clicked_code?: string;
  origin_country?: string;
  hs_code?: string;
  price_usd?: number | null;
  qty?: number | null;
  weight_kg?: number | null;
  rate?: number | null;
  duty_usd?: number | null;
  estimator_loaded?: boolean;
  code_changed?: boolean;
  error_message?: string;
  stage?: string;
};

function deviceType(ua: string): string {
  const s = ua.toLowerCase();
  if (/ipad|tablet/.test(s)) return 'tablet';
  if (/mobi|iphone|android/.test(s)) return 'mobile';
  if (!ua) return 'unknown';
  return 'desktop';
}

export async function logEvent(e: EventPayload) {
  try {
    const session_id = getSessionId();
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const ref = typeof document !== 'undefined' ? document.referrer : '';

    const ctx = { device_type: deviceType(ua), referrer_url: ref, user_agent: ua };
    const row = { session_id, ...ctx, ...e };

    const { error } = await supabaseClient.from('user_events').insert(row);
    // if (error) console.error('logEvent error', error, e);
  } catch {
    // never break UX on telemetry
  }
}
