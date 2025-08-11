import { expandQuery } from '@/lib/synonyms';

test('expands sneakers and fixes snekaers', () => {
  const a = expandQuery('sneakers');
  expect(a).toEqual(expect.arrayContaining(['sneakers', 'trainers', 'running shoes']));
  const b = expandQuery('snekaers');
  expect(b).toContain('sneakers');
});
