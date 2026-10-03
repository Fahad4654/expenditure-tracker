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
}

export function CustomSelect({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  disabled = false,
  className = '',
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

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

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(options.length - 1);
      } else {
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < options.length) {
        const option = options[highlightedIndex];
        if (!option.disabled) {
          onChange(option.value);
          setIsOpen(false);
        }
      } else {
        setIsOpen((prev) => !prev);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className="w-full min-h-[44px] sm:min-h-[40px] flex items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition-all duration-200 hover:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.color ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: selectedOption.color }}
            />
          ) : null}
          <span className={selectedOption ? 'text-slate-100 font-medium' : 'text-slate-500'}>
            {selectedOption ? selectedOption.label : placeholder}
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

      {isOpen ? (
        <div
          role="listbox"
          tabIndex={-1}
          className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-slate-700/90 bg-slate-900/95 p-1.5 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2.5 text-center text-xs text-slate-500">No options available</div>
          ) : (
            options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isHighlighted = idx === highlightedIndex;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    if (!opt.disabled) {
                      onChange(opt.value);
                      setIsOpen(false);
                    }
                  }}
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
                    <svg className="h-4 w-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
