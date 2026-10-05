import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  color?: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<SelectOption>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  /** Adds a filter box above the list — for long option sets (e.g. categories). */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Offers a × in the trigger so a picked value can be cleared again. */
  clearable?: boolean;
}

const SEARCH_INPUT_CLASS =
  'w-full min-h-[40px] rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all duration-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25';

export function CustomSelect({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  disabled = false,
  className = '',
  searchable = false,
  searchPlaceholder = 'Search…',
  clearable = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // A disabled option ("Choose a category", "No note", "Tag a transaction…")
  // is a placeholder, never a choice: its label backs the trigger's empty
  // state and the empty-list message, but it is never listed.
  const placeholderOption = options.find((opt) => opt.disabled);
  const selectableOptions = options.filter((opt) => !opt.disabled);
  const selectedOption = selectableOptions.find((opt) => opt.value === value);
  const placeholderText = placeholderOption?.label ?? placeholder;

  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = normalizedQuery
    ? selectableOptions.filter((opt) => opt.label.toLowerCase().includes(normalizedQuery))
    : selectableOptions;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const open = (highlightFirst = false) => {
    setQuery('');
    setHighlightedIndex(highlightFirst ? 0 : -1);
    setIsOpen(true);
  };

  const close = (refocusTrigger = false) => {
    setIsOpen(false);
    setQuery('');
    setHighlightedIndex(-1);
    if (refocusTrigger) triggerRef.current?.focus();
  };

  const pick = (option?: SelectOption) => {
    if (!option || option.disabled) return;
    onChange(option.value);
    close(true);
  };

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        open(true);
      } else {
        setHighlightedIndex((prev) => (prev < visibleOptions.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        open();
        setHighlightedIndex(Math.max(visibleOptions.length - 1, 0));
      } else {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : visibleOptions.length - 1));
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < visibleOptions.length) {
        pick(visibleOptions[highlightedIndex]);
      } else {
        setIsOpen((prev) => !prev);
      }
    } else if (e.key === 'Escape') {
      if (isOpen) close();
    }
  };

  // Typing lives here, so Space inserts a character instead of selecting.
  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        visibleOptions.length === 0
          ? -1
          : prev < visibleOptions.length - 1
            ? prev + 1
            : 0,
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        visibleOptions.length === 0
          ? -1
          : prev > 0
            ? prev - 1
            : visibleOptions.length - 1,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(visibleOptions[highlightedIndex] ?? visibleOptions[0]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      close();
    }
  };

  const showClear = clearable && !disabled && value !== '';

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleTriggerKeyDown}
        className={`w-full min-h-[44px] sm:min-h-[40px] flex items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition-all duration-200 hover:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99] ${
          showClear ? 'pr-16' : ''
        }`}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.color ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: selectedOption.color }}
            />
          ) : null}
          <span className={selectedOption ? 'text-slate-100 font-medium' : 'text-slate-500'}>
            {selectedOption ? selectedOption.label : placeholderText}
          </span>
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-emerald-400' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {showClear ? (
        <button
          type="button"
          aria-label="Clear"
          onClick={() => onChange('')}
          className="absolute right-8 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-700/70 hover:text-slate-200 focus-visible:outline-2 focus-visible:outline-emerald-500"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      ) : null}

      {isOpen ? (
        <div
          role="listbox"
          tabIndex={-1}
          className={`absolute left-0 right-0 top-full z-50 mt-1.5 ${
            searchable ? 'max-h-72' : 'max-h-60'
          } overflow-y-auto rounded-xl border border-slate-700/90 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150`}
        >
          {searchable ? (
            <div className="sticky top-0 z-10 -mx-1.5 -mt-1.5 mb-1 bg-slate-900 px-1.5 pt-1.5 pb-1">
              <input
                type="text"
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                autoFocus
                onChange={(event) => {
                  const next = event.target.value;
                  setQuery(next);
                  setHighlightedIndex(next.trim() === '' ? -1 : 0);
                }}
                onKeyDown={handleSearchKeyDown}
                className={SEARCH_INPUT_CLASS}
              />
            </div>
          ) : null}

          {visibleOptions.length === 0 ? (
            <div className="px-3 py-2.5 text-center text-xs text-slate-500">
              {normalizedQuery
                ? `No matches for “${query.trim()}”`
                : placeholderOption
                  ? placeholderOption.label
                  : 'No options available'}
            </div>
          ) : (
            visibleOptions.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlighted = idx === highlightedIndex;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => pick(opt)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`flex cursor-pointer items-center justify-between min-h-[40px] px-3 py-2 rounded-lg text-sm transition-colors duration-150 ${
                    opt.disabled
                      ? 'cursor-not-allowed opacity-40'
                      : isSelected
                      ? 'bg-emerald-500/15 text-emerald-400 font-semibold'
                      : isHighlighted
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    {opt.color ? (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: opt.color }}
                      />
                    ) : null}
                    <span>{opt.label}</span>
                  </span>
                  {isSelected ? (
                    <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
