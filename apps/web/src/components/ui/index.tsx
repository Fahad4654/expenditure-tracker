import React, {
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { CustomSelect } from './CustomSelect';
import { CustomDatePicker } from './CustomDatePicker';

export { CustomSelect, CustomDatePicker };

/** Shared surface for text-like controls. Kept in one place so forms agree. */
export const inputClass =
  'w-full min-h-[44px] sm:min-h-[40px] rounded-xl border border-slate-700/80 bg-slate-900/90 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all duration-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50';

export const labelClass = 'mb-1.5 block text-sm font-medium text-slate-300';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-500 text-slate-950 hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-emerald-500/50 disabled:text-slate-950/60 shadow-lg shadow-emerald-500/10',
  secondary:
    'border border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-600 hover:bg-slate-800 active:bg-slate-950',
  ghost: 'text-slate-300 hover:bg-slate-800/80 hover:text-slate-100 active:bg-slate-800',
  danger: 'border border-rose-800 bg-rose-950/60 text-rose-300 hover:bg-rose-900/60 active:bg-rose-950',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 min-h-[44px] sm:min-h-[40px] rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className = '',
}: {
  label: string;
  htmlFor: string;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`w-full ${className}`}>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-400" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function Select({
  children,
  value,
  onChange,
  id,
  name,
  disabled,
  className,
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = React.Children.toArray(children)
    .filter(
      (child): child is React.ReactElement<{ value?: string; children?: ReactNode; disabled?: boolean }> =>
        React.isValidElement(child) && child.type === 'option',
    )
    .map((child) => ({
      value: String(child.props.value ?? ''),
      label: String(child.props.children ?? child.props.value ?? ''),
      disabled: Boolean(child.props.disabled),
    }));

  const handleChange = (val: string) => {
    if (onChange) {
      const event = {
        target: { value: val, name: name ?? id ?? '' },
        currentTarget: { value: val, name: name ?? id ?? '' },
      } as unknown as React.ChangeEvent<HTMLSelectElement>;
      onChange(event);
    }
  };

  return (
    <CustomSelect
      id={id}
      name={name}
      value={String(value ?? '')}
      onChange={handleChange}
      options={options}
      disabled={disabled}
      className={className}
    />
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400"
    />
  );
}

export function FullPageLoading({ label = 'Loading your session' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-400">
      <Spinner label={label} />
      <p className="text-sm font-medium">{label}…</p>
    </div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-900/80 bg-rose-950/60 px-4 py-3 text-sm font-medium text-rose-300 backdrop-blur-sm"
    >
      {children}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-800/80 bg-slate-900/20 px-6 py-12 text-center">
      <p className="font-semibold text-slate-300">{title}</p>
      {body ? <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">{body}</p> : null}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 sm:p-6 backdrop-blur-sm ${className}`}>
      {children}
    </section>
  );
}

