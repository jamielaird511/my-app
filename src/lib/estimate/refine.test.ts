// src/lib/estimate/refine.test.ts
import { validateHs6 } from './refine';

describe('validateHs6', () => {
  it('should return 6 digits for valid 6-digit input', () => {
    expect(validateHs6('123456')).toBe('123456');
    expect(validateHs6('640411')).toBe('640411');
  });

  it('should auto-pad 4-digit input to 6 digits', () => {
    expect(validateHs6('6404')).toBe('640400');
    expect(validateHs6('1234')).toBe('123400');
  });

  it('should truncate input longer than 6 digits', () => {
    expect(validateHs6('1234567890')).toBe('123456');
    expect(validateHs6('6404111234')).toBe('640411');
  });

  it('should handle input with non-digits', () => {
    expect(validateHs6('6404.11')).toBe('640411');
    expect(validateHs6('6404-11')).toBe('640411');
    expect(validateHs6('6404 11')).toBe('640411');
  });

  it('should return null for invalid input', () => {
    expect(validateHs6('')).toBe(null);
    expect(validateHs6('123')).toBe(null);
    expect(validateHs6('abc')).toBe(null);
  });

  it('should handle edge cases gracefully', () => {
    expect(validateHs6('')).toBe(null);
    expect(validateHs6('12345678901234567890')).toBe('123456');
    expect(validateHs6('abc640def411ghi')).toBe('640411');
  });
});

// TODO: Add integration tests for the full refine flow when we have the API working
// For now, we test the public validateHs6 function
