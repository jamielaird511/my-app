'use client';

type Option = { code: string; name: string };

const DEFAULTS: Option[] = [
  { code: 'US', name: 'United States' },
  { code: 'CN', name: 'China' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AU', name: 'Australia' },
];

type Props = {
  /** Controlled value. Accepts null/undefined for "no selection". */
  value?: string | null;
  /** Back-compat alias some callers use. */
  selected?: string | null;

  /** Change handlers: either is fine. */
  onChange?: (code: string) => void;
  setSelected?: (code: string) => void;

  /** Optional list and “frequently used” codes to surface first. */
  options?: Option[];
  frequentlyUsed?: string[];

  /** Misc. */
  className?: string;
  disabled?: boolean;
  placeholder?: string;
};

export default function CountrySelect({
  value,
  selected,
  onChange,
  setSelected,
  options = DEFAULTS,
  frequentlyUsed,
  className,
  disabled,
  placeholder = 'Select country…',
}: Props) {
  // normalize to a string for the <select>
  const v = value ?? selected ?? '';

  // simple prioritization: frequent first (deduped), then the rest
  const seen = new Set<string>();
  const prioritized: Option[] = [
    ...(frequentlyUsed
      ? frequentlyUsed
          .map((code) => options.find((o) => o.code === code))
          .filter((o): o is Option => !!o)
      : []),
    ...options,
  ].filter((o) => (seen.has(o.code) ? false : (seen.add(o.code), true)));

  return (
    <select
      value={v}
      onChange={(e) => {
        const code = e.target.value;
        onChange?.(code);
        setSelected?.(code);
      }}
      disabled={disabled}
      className={className ?? 'border rounded-lg px-3 py-2 text-sm'}
      aria-label="Country"
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {prioritized.map((o) => (
        <option key={o.code} value={o.code}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
