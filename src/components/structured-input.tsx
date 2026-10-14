"use client";
import type { PickerOption,StructuredField } from "@/lib/ticket-contract";
import { OptionSelect } from "./intake/option-select";
import { MultiSelect } from "./multi-select";
import { Field } from "./ui";
export function StructuredInput({
  field,
  value,
  onChange,
}: {
  field: StructuredField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "multiselect" && field.module)
    return (
      <Field
        label={field.label + (field.required ? " *" : "")}
        wide
        hint={field.helper}
      >
        <MultiSelect
          module={field.module}
          multi={field.multi}
          value={Array.isArray(value) ? (value as PickerOption[]) : []}
          onChange={onChange}
        />
      </Field>
    );
  return (
    <Field
      label={field.label + (field.required ? " *" : "")}
      wide={field.type === "textarea"}
      hint={
        field.weight ? `${field.weight}% of weighted evaluation` : field.helper
      }
    >
      {field.type === "rating" ? (
        <div className="rating-buttons">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              className={Number(value) === n ? "active" : ""}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ))}
        </div>
      ) : field.type === "select" ? (
        <OptionSelect
          options={field.options || []}
          value={String(value || "")}
          onChange={(v) => onChange(String(v))}
        />
      ) : field.type === "textarea" ? (
        <textarea
          rows={2}
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type={field.type}
          min={field.type === "number" ? 0 : undefined}
          value={String(value ?? "")}
          onChange={(e) =>
            onChange(
              field.type === "number" && e.target.value !== ""
                ? Number(e.target.value)
                : e.target.value,
            )
          }
        />
      )}
    </Field>
  );
}
