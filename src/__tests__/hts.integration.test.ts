import { searchHTS } from '@/lib/hts';

// Simple OK payload
const okPayload = {
  results: [
    {
      htsno: '6404110000',
      htsnoFormatted: '6404.11.0000',
      description: 'Sports footwear',
      general_rate: '8.5%',
    },
  ],
};

function makeFetch(status = 200, body: any = okPayload, delayMs = 0) {
  return jest.fn(async () => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (status >= 400) return new Response(JSON.stringify({ error: 'nope' }), { status });
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

test('success path returns items', async () => {
  const fetchImpl = makeFetch();
  const res = await searchHTS('sneakers', { limit: 50 }, { fetchImpl });
  expect(res.items[0].hsCode10).toBe('6404110000');
  expect(res.meta.degraded).toBe(false);
});

test('429 triggers retry/backoff then succeeds', async () => {
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify(okPayload), { status: 200 }),
    ) as unknown as typeof fetch;

  const res = await searchHTS('sneakers', {}, { fetchImpl });
  expect(res.items.length).toBe(1);
  expect(res.meta.degraded).toBe(false);
});

test('timeout uses cached results and flags degraded', async () => {
  // warm cache fast
  const fast = makeFetch(200, okPayload, 0);
  await searchHTS('sneakers', {}, { fetchImpl: fast });

  // now slow to force timeout
  const slow = makeFetch(200, okPayload, 9999);
  const res = await searchHTS('sneakers', { timeoutMs: 10 }, { fetchImpl: slow });
  expect(res.meta.degraded).toBe(true);
  expect(res.items.length).toBe(1);
});

test('hard error with no cache throws', async () => {
  const bad = makeFetch(500, {});
  await expect(searchHTS('unknownthing', {}, { fetchImpl: bad })).rejects.toThrow(
    /HTS search failed/i,
  );
});
