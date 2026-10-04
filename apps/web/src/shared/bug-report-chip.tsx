import type { ReactNode } from 'react';

/** Small outline pill used for bug severity and status. */
export function Chip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
