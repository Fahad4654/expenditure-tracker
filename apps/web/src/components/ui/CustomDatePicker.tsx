import { useEffect, useRef, useState } from 'react';

interface CustomDatePickerProps {
  id?: string;
  name?: string;
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

const DAYS_HEADER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const date = new Date(year, month, day);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function CustomDatePicker({
  id,
  name,
  value,
  onChange,
  placeholder = 'Select date',
  disabled = false,
  className = '',
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize displayed month/year based on value or today
  const initialDate = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(
    isNaN(initialDate.getTime()) ? new Date().getFullYear() : initialDate.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    isNaN(initialDate.getTime()) ? new Date().getMonth() : initialDate.getMonth(),
  );

  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        setViewYear(d.getFullYear());
        setViewMonth(d.getMonth());
      }
    }
  }, [value]);

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

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Build calendar matrix
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  // Get day of week for 1st of month (0 = Sun, 1 = Mon... convert to Monday = 0)
  let startDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6;

  const todayStr = getTodayString();

  const days: Array<{ day: number; currentMonth: boolean; dateStr: string }> = [];

  // Previous month padding days
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const day = prevMonthDays - i;
    const pm = viewMonth === 0 ? 11 : viewMonth - 1;
    const py = viewMonth === 0 ? viewYear - 1 : viewYear;
    const dateStr = `${py}-${String(pm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days.push({ day, currentMonth: false, dateStr });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, currentMonth: true, dateStr });
  }

  // Next month padding days to complete 42 cells (6 rows)
  const remainingCells = 42 - days.length;
  for (let d = 1; d <= remainingCells; d++) {
    const nm = viewMonth === 11 ? 0 : viewMonth + 1;
    const ny = viewMonth === 11 ? viewYear + 1 : viewYear;
    const dateStr = `${ny}-${String(nm + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, currentMonth: false, dateStr });
  }

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-h-[44px] sm:min-h-[40px] flex items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition-all duration-200 hover:border-slate-600 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
      >
        <span className="flex items-center gap-2 truncate">
          <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span className={value ? 'text-slate-100 font-medium' : 'text-slate-500'}>
            {value ? formatDisplayDate(value) : placeholder}
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
        <div className="absolute left-0 right-0 sm:right-auto top-full z-50 mt-1.5 sm:w-72 rounded-2xl border border-slate-700/90 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-slate-100">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          {/* Days of week */}
          <div className="grid grid-cols-7 gap-1 mb-2 text-center text-xs font-medium text-slate-400">
            {DAYS_HEADER.map((dh) => (
              <div key={dh}>{dh}</div>
            ))}
          </div>

          {/* Day Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {days.map((item, idx) => {
              const isSelected = item.dateStr === value;
              const isToday = item.dateStr === todayStr;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    onChange(item.dateStr);
                    setIsOpen(false);
                  }}
                  className={`h-8 w-8 mx-auto flex items-center justify-center rounded-lg text-xs font-medium transition-all duration-150 ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                      : isToday
                      ? 'border border-emerald-500/50 text-emerald-400 font-semibold'
                      : item.currentMonth
                      ? 'text-slate-200 hover:bg-slate-800 hover:text-slate-100'
                      : 'text-slate-600 hover:bg-slate-800/40'
                  }`}
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          {/* Quick select Today */}
          <div className="mt-3 pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
            <button
              type="button"
              onClick={() => {
                onChange(todayStr);
                setIsOpen(false);
              }}
              className="font-medium text-emerald-400 hover:text-emerald-300 transition"
            >
              Select Today
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
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
