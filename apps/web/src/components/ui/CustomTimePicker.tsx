import { useEffect, useRef, useState } from 'react';

interface CustomTimePickerProps {
  id?: string;
  name?: string;
  value: string; // "HH:mm" (24-hour) or '' for a date-only reminder
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

/**
 * Wall-clock time picker: hour and minute columns in a popover. Two clicks
 * commit (hour then minute, in either order) — no native `<input type="time">`,
 * per the project's custom-component rule. `value` stays a plain `HH:mm`
 * string so the field is round-trippable as JSON.
 */
export function CustomTimePicker({
  id,
  name,
  value,
  onChange,
  placeholder = 'No time',
  disabled = false,
  className = '',
}: CustomTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Staged picks; committing needs both halves (or a half from `value`).
  const [pendingHour, setPendingHour] = useState<string | null>(null);
  const [pendingMinute, setPendingMinute] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hourRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const minuteRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [currentHour, currentMinute] = value.split(':');
  const activeHour = pendingHour ?? (currentHour || null);
  const activeMinute = pendingMinute ?? (currentMinute || null);

  function openPanel() {
    setPendingHour(null);
    setPendingMinute(null);
    setIsOpen(true);
  }

  function closePanel() {
    setPendingHour(null);
    setPendingMinute(null);
    setIsOpen(false);
  }

  function commit(hour: string, minute: string) {
    onChange(`${hour}:${minute}`);
    closePanel();
  }

  function pickHour(hour: string) {
    if (pendingMinute) {
      commit(hour, pendingMinute);
      return;
    }
    setPendingHour(hour);
  }

  function pickMinute(minute: string) {
    const hour = pendingHour ?? currentHour;
    if (hour) {
      commit(hour, minute);
      return;
    }
    setPendingMinute(minute);
  }

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setPendingHour(null);
        setPendingMinute(null);
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Keep the active choices visible when the panel opens or the selection moves.
  useEffect(() => {
    if (!isOpen) return;
    const scrollIntoView = (element: HTMLButtonElement | null) => {
      if (element && typeof element.scrollIntoView === 'function') {
        element.scrollIntoView({ block: 'nearest' });
      }
    };
    scrollIntoView(activeHour ? (hourRefs.current[activeHour] ?? null) : null);
    scrollIntoView(activeMinute ? (minuteRefs.current[activeMinute] ?? null) : null);
  }, [isOpen, activeHour, activeMinute]);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? closePanel() : openPanel())}
        className="w-full min-h-[44px] sm:min-h-[40px] flex items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition-all duration-200 hover:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
      >
        <span className="flex items-center gap-2 truncate">
          <svg
            className="h-4 w-4 shrink-0 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          <span className={value ? 'text-slate-100 font-medium' : 'text-slate-500'}>
            {value || placeholder}
          </span>
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-emerald-400' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="Pick a time"
          className="absolute left-0 right-0 sm:right-auto top-full z-50 mt-1.5 w-full sm:w-72 rounded-2xl border border-slate-700/90 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="grid grid-cols-2 gap-2 mb-2 text-center text-xs font-medium text-slate-400">
            <div>Hour</div>
            <div>Minute</div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
              {HOURS.map((hour) => {
                const isActive = hour === activeHour;
                return (
                  <button
                    key={hour}
                    type="button"
                    ref={(element) => {
                      hourRefs.current[hour] = element;
                    }}
                    aria-label={`Hour ${hour}`}
                    aria-pressed={isActive}
                    onClick={() => pickHour(hour)}
                    className={`h-8 shrink-0 rounded-lg text-xs font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                        : 'text-slate-200 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    {hour}
                  </button>
                );
              })}
            </div>
            <div className="flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
              {MINUTES.map((minute) => {
                const isActive = minute === activeMinute;
                return (
                  <button
                    key={minute}
                    type="button"
                    ref={(element) => {
                      minuteRefs.current[minute] = element;
                    }}
                    aria-label={`Minute ${minute}`}
                    aria-pressed={isActive}
                    onClick={() => pickMinute(minute)}
                    className={`h-8 shrink-0 rounded-lg text-xs font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                        : 'text-slate-200 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    {minute}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2 text-xs">
            <button
              type="button"
              onClick={() => {
                onChange('');
                closePanel();
              }}
              className="font-medium text-emerald-400 hover:text-emerald-300 transition"
            >
              No time
            </button>
            <button
              type="button"
              onClick={closePanel}
              className="text-slate-400 hover:text-slate-200 transition"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
