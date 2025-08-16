// src/lib/estimate/refine.ts
import { z } from 'zod';

// ---------- Types ----------
export const RefineRequestSchema = z.object({
  hs6: z.string().regex(/^\d{6}$/, 'Must be exactly 6 digits'),
});

export const RefineCandidateSchema = z.object({
  code10: z.string().regex(/^\d{10}$/, 'Must be exactly 10 digits'),
  description: z.string().min(1, 'Description required'),
  confidence: z.number().min(0).max(100, 'Confidence must be 0-100'),
});

export const RefineResponseSchema = z.object({
  candidates: z.array(RefineCandidateSchema),
});

export type RefineRequest = z.infer<typeof RefineRequestSchema>;
export type RefineCandidate = z.infer<typeof RefineCandidateSchema>;
export type RefineResponse = z.infer<typeof RefineResponseSchema>;

// ---------- Core Logic ----------
/**
 * Find 10-digit HS candidates from a 6-digit base code.
 * Returns candidates sorted by confidence (highest first).
 */
export async function findRefineCandidates(
  hs6: string,
  supabaseClient: any, // TODO: type properly when we have Supabase types
): Promise<RefineCandidate[]> {
  if (!/^\d{6}$/.test(hs6)) {
    throw new Error('Invalid HS6 code');
  }

  try {
    // Query for 10-digit codes that start with this 6-digit prefix
    const { data, error } = await supabaseClient
      .from('hts_lines')
      .select('code, description')
      .like('code', `${hs6}%`)
      .eq('code_len', 10)
      .order('code')
      .limit(10);

    if (error) {
      console.error('Supabase error:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Score and sort candidates
    const candidates = data
      .map((row: any) => ({
        code10: String(row.code || ''),
        description: String(row.description || 'Unknown'),
        confidence: calculateConfidence(hs6, String(row.code || '')),
      }))
      .filter((c: { code10: string }) => c.code10.length === 10)
      .sort((a: { confidence: number }, b: { confidence: number }) => b.confidence - a.confidence)
      .slice(0, 6); // Limit to top 6

    return candidates;
  } catch (error) {
    console.error('Error finding refine candidates:', error);
    return [];
  }
}

/**
 * Calculate confidence score (0-100) for a 10-digit code based on 6-digit base.
 * Higher scores for more "logical" progressions.
 */
function calculateConfidence(hs6: string, code10: string): number {
  if (!code10.startsWith(hs6)) return 0;

  const suffix = code10.slice(6);
  if (suffix === '0000') return 95; // Common "general" suffix
  if (suffix === '0001') return 90; // Common "first specific" suffix
  if (suffix === '0002') return 85; // Common "second specific" suffix
  
  // Score based on suffix pattern
  if (/^0+$/.test(suffix)) return 80; // All zeros
  if (/^\d{4}$/.test(suffix)) return 75; // Valid 4-digit suffix
  
  // Lower confidence for unusual patterns
  return Math.max(50, 100 - parseInt(suffix, 10) % 50);
}

/**
 * Validate and sanitize HS6 input
 */
export function validateHs6(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 6) return digits;
  if (digits.length === 4) return digits + '00'; // Auto-pad 4->6
  if (digits.length > 6) return digits.slice(0, 6);
  return null;
}
