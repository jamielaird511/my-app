// src/app/api/hs/refine/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { 
  RefineRequestSchema, 
  RefineResponseSchema, 
  findRefineCandidates,
  validateHs6 
} from '@/lib/estimate/refine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ---------- Supabase Setup ----------
const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const SB_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''
).trim();

if (!SB_URL || !SB_KEY) {
  throw new Error(
    'Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
  );
}

const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

// ---------- Simple In-Memory Cache (60s TTL) ----------
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 1000; // 60 seconds

function getCached(key: string) {
  const cached = cache.get(key);
  if (!cached) return null;
  
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  
  return cached.data;
}

function setCached(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ---------- API Handler ----------
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const hs6Param = url.searchParams.get('hs6');
    
    if (!hs6Param) {
      return NextResponse.json(
        { error: 'Missing hs6 parameter' },
        { status: 400 }
      );
    }

    // Validate input
    const validation = RefineRequestSchema.safeParse({ hs6: hs6Param });
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid hs6 parameter', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { hs6 } = validation.data;
    
    // Check cache first
    const cached = getCached(hs6);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Find candidates
    const candidates = await findRefineCandidates(hs6, sb);
    
    // Validate response
    const response = { candidates };
    const responseValidation = RefineResponseSchema.safeParse(response);
    if (!responseValidation.success) {
      console.error('Response validation failed:', responseValidation.error);
      return NextResponse.json(
        { error: 'Internal validation error' },
        { status: 500 }
      );
    }

    // Cache the result
    setCached(hs6, response);
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Refine API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
