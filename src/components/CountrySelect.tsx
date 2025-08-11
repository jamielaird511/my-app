'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { COUNTRIES, Country } from '@/lib/countries';

type Props = {
  label?: string;
  value?: string | null; // ISO code (e.g., "CN")
  onChange: (code: string | null, country?: Country) => void;
  placeholder?: string;
  frequentlyUsed?: string[];
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
};

function normalize(s: string) {
  return s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function CountrySelect({
  label = 'Country of origin',
  value,
  onChange,
  placeholder = 'Type a country…',
  frequentlyUsed = ['CN', 'CA', 'MX'],
  disabled,
  id = 'country',
  name = 'country',
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const baseList = useMemo(() => {
    const fav = new Set(frequentlyUsed.map((c) => c.toUpperCase()));
    const pinned = COUNTRIES.filter((c) => fav.has(c.code));
    const rest = COUNTRIES.filter((c) => !fav.has(c.code));
    return [...pinned, ...rest];
  }, [frequentlyUsed]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return baseList;
    return baseList.filter(
      (c) => normalize(c.name).includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [query, baseList]);

  const selected = value ? baseList.find((c) => c.code === value.toUpperCase()) : undefined;

  useEffect(() => {
    if (!open) setActiveIndex(-1);
  }, [open]);

  function select(country: Country | null) {
    onChange(country ? country.code : null, country || undefined);
    setOpen(false);
    if (country) setQuery(country.name);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min((i ?? -1) + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max((i ?? 0) - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && filtered[activeIndex]) select(filtered[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  useEffect(() => {
    function onDocClick(ev: MouseEvent) {
      if (!open) return;
      const t = ev.target as Node;
      if (!inputRef.current?.parentElement?.contains(t)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (selected && !open) setQuery(selected.name);
    if (!selected && !open) setQuery('');
  }, [selected?.code, open]);

  const listId = `${id}-listbox`;

  return (
    <div className={`w-full ${className}`}>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="text"
          autoComplete="off"
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {/* dropdown */}
        {open && (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-white shadow-lg"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-500">No matches</li>
            )}
            {filtered.map((c, idx) => {
              const active = idx === activeIndex;
              const isSelected = c.code === selected?.code;
              return (
                <li
                  key={c.code}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(c);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`cursor-pointer px-3 py-2 text-sm hover:bg-gray-50 ${active ? 'bg-gray-50' : ''} ${isSelected ? 'bg-indigo-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span>{c.name}</span>
                    <span className="ml-2 text-xs text-gray-500">{c.code}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
