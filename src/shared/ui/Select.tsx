import { useId } from 'react';
import { cn } from '@/shared/lib/cn';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  hideLabel?: boolean;
  className?: string;
  id?: string;
}

/** Styled native <select> – keeps full keyboard/screen-reader support for free. */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel,
  className,
  id,
}: SelectProps<T>) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label
        htmlFor={selectId}
        className={cn('text-xs font-medium text-muted', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={(e) => {
            const next = options.find((o) => o.value === e.target.value);
            if (next) onChange(next.value);
          }}
          className="h-9 w-full appearance-none rounded border border-border bg-surface-2 pl-3 pr-8 text-sm text-text focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted"
        >
          ▾
        </span>
      </div>
    </div>
  );
}
