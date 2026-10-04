export interface ChoiceOption {
  value: string;
  label: string;
}

/**
 * Tap-friendly radio / checkbox chips with no client JS: the native input is
 * visually hidden but still focusable, the label shows the state. Selection is
 * not colour alone — a thicker border and bold text as well (`has-[:checked]`).
 */
export function ChoiceGroup({
  id,
  label,
  name,
  type,
  options,
  selected,
  hint,
  required,
}: {
  id: string;
  label: string;
  name: string;
  type: "radio" | "checkbox";
  options: readonly ChoiceOption[];
  selected: readonly string[];
  hint?: string;
  /** Radio groups only: the browser blocks submitting until one is chosen. */
  required?: boolean;
}) {
  return (
    <div role="group" aria-labelledby={id} className="card space-y-3">
      <div>
        <p id={id} className="font-semibold">
          {label}
        </p>
        {hint ? <p className="text-muted text-sm">{hint}</p> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="border-field-border bg-surface has-[:checked]:border-active has-[:checked]:bg-tint-active has-[:checked]:text-active has-[:focus-visible]:outline-active flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-center text-[15px] last:odd:col-span-2 has-[:checked]:border-2 has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
          >
            <input
              type={type}
              name={name}
              value={o.value}
              required={required}
              defaultChecked={selected.includes(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}
