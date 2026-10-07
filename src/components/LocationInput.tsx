import React, { useId } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Fixed choices; when supplied the control renders as a select. */
  options?: string[];
  placeholder?: string;
  /** Leading glyph, e.g. a coloured dot or a MapPin. */
  icon?: React.ReactNode;
  /** Validation message. Present means the field is in its error state. */
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * One labelled location field, with focus, error and disabled states wired up.
 *
 * Renders a native `<select>` when `options` are given (the Kumbh pickup and
 * drop points are a fixed list) and a free-text `<input>` otherwise, so the same
 * component covers both without the caller changing anything else.
 */
export const LocationInput: React.FC<Props> = ({
  label,
  value,
  onChange,
  options,
  placeholder,
  icon,
  error,
  required = false,
  disabled = false,
}) => {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const hasError = !!error;

  const frame = [
    'flex items-center gap-2.5 w-full rounded-xl border bg-white px-3',
    'transition focus-within:ring-2 focus-within:ring-offset-0',
    hasError
      ? 'border-red-400 focus-within:border-red-500 focus-within:ring-red-100'
      : 'border-stone-200 focus-within:border-orange-500 focus-within:ring-orange-100',
    disabled ? 'opacity-60 cursor-not-allowed bg-stone-50' : '',
  ].join(' ');

  const control =
    'w-full bg-transparent py-3 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none disabled:cursor-not-allowed';

  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-xs font-semibold text-stone-600">
        {label}
        {required && <span className="text-orange-600 ml-0.5" aria-hidden="true">*</span>}
      </label>

      <div className={frame}>
        {icon && <span className="shrink-0 text-stone-400">{icon}</span>}

        {options ? (
          <select
            id={fieldId}
            value={value}
            disabled={disabled}
            required={required}
            aria-invalid={hasError}
            aria-describedby={hasError ? errorId : undefined}
            onChange={(e) => onChange(e.target.value)}
            className={`${control} appearance-none cursor-pointer`}
          >
            <option value="">{placeholder ?? `Select ${label.toLowerCase()}`}</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={fieldId}
            type="text"
            value={value}
            disabled={disabled}
            required={required}
            placeholder={placeholder}
            aria-invalid={hasError}
            aria-describedby={hasError ? errorId : undefined}
            onChange={(e) => onChange(e.target.value)}
            className={control}
          />
        )}
      </div>

      {hasError && (
        <p id={errorId} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
};
