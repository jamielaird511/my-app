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
  /** Current value (ISO country code). Accepts either value or selected for compatibility. */
  value?: string;
  selected?: string;

  /** Change handlers. Accepts either onChange or setSelected for compatibility. */
  onChange?: (code: string) => void;
  setSelected?: (code: string) => void;

  /** Optional list of options; falls back to DEFAULTS. */
  options?: Option[];

  /** Styling/behavior passthroughs. */
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
  className,
  disabled,
  placeholder = 'Select country',
}: Props) {
  const v = value ?? selected ?? '';

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
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
