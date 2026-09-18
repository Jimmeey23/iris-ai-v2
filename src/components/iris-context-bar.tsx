/**
 * PHASE 2: Context Bar UI
 * Sticky context bar showing extracted/confirmed studio, category, class, trainer, area
 * with dropdown options to override or confirm
 */

"use client";

import { useState, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import type { IrisTurn } from "@/lib/iris-contract";
import { STUDIOS } from "@/lib/constants";

interface ContextBarProps {
  turn?: IrisTurn;
  onContextChange: (updates: Record<string, unknown>) => void;
}

interface ContextField {
  key: string;
  label: string;
  value?: string;
  options?: string[];
}

export function IrisContextBar({ turn, onContextChange }: ContextBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [fields, setFields] = useState<ContextField[]>([]);

  useEffect(() => {
    if (!turn?.collected) return;

    const newFields: ContextField[] = [];
    const c = turn.collected as Record<string, unknown>;

    // Studio
    if (c.studio || !turn.fieldKey) {
      newFields.push({
        key: "studio",
        label: "Studio",
        value: String(c.studio || ""),
        options: STUDIOS.map((s) => s.name),
      });
    }

    // Category (hardcoded taxonomy)
    const CATEGORIES = [
      "Safety and Security",
      "Repair and Maintenance",
      "Tech Issues",
      "Theft and Lost Items",
      "Class Operations and Booking",
    ];
    
    if (c.category || !turn.fieldKey) {
      newFields.push({
        key: "category",
        label: "Category",
        value: String(c.category || ""),
        options: CATEGORIES,
      });
    }

    // Subcategory (based on selected category)
    if (c.subcategory || !turn.fieldKey) {
      const category = String(c.category || "");
      const SUBCATEGORIES: Record<string, string[]> = {
        "Safety and Security": [
          "Fire/Safety alarm",
          "Electrical hazard",
          "Water/Wet floor",
          "Injury reported",
          "Suspicious activity",
          "Lost and found",
        ],
        "Repair and Maintenance": [
          "Equipment malfunction",
          "Facility damage",
          "Cleanliness issue",
          "HVAC/Temperature",
          "Plumbing",
        ],
        "Tech Issues": [
          "App crash",
          "Login problem",
          "Payment issue",
          "Data sync",
          "Booking system",
        ],
        "Theft and Lost Items": [
          "Missing personal item",
          "Locker issue",
          "Valuables concern",
        ],
        "Class Operations and Booking": [
          "Class booking issue",
          "Trainer concern",
          "Schedule change",
          "Class cancellation",
        ],
      };
      
      newFields.push({
        key: "subcategory",
        label: "Subcategory",
        value: String(c.subcategory || ""),
        options: SUBCATEGORIES[category] || [],
      });
    }

    // Class/Session Type
    if (c.classFormat) {
      newFields.push({
        key: "classFormat",
        label: "Class Type",
        value: String(c.classFormat),
        options: ["Private", "Group", "Semi-Private"],
      });
    }

    // Trainer
    if (c.trainer) {
      newFields.push({
        key: "trainer",
        label: "Trainer",
        value: String(c.trainer),
      });
    }

    // Area
    if (c.area) {
      newFields.push({
        key: "area",
        label: "Area",
        value: String(c.area),
        options: ["Studio floor", "Lounge", "Boutique", "Changing room", "Locker", "Bathroom"],
      });
    }

    setFields(newFields);
  }, [turn?.collected]);

  function handleChange(key: string, value: string) {
    onContextChange({ [key]: value });
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, value } : f))
    );
  }

  function handleRemove(key: string) {
    onContextChange({ [key]: undefined });
    setFields((prev) => prev.filter((f) => f.key !== key));
  }

  if (fields.length === 0) return null;

  return (
    <div className="border-b border-stone-200 bg-stone-50 px-4 py-3">
      <div className="flex flex-wrap gap-2">
        {fields.map((field) => (
          <div
            key={field.key}
            className="group flex items-center gap-1 rounded-lg bg-white px-3 py-2 border border-stone-200 hover:border-stone-300 transition-colors"
          >
            {field.options && field.options.length > 0 ? (
              <select
                value={field.value || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="text-sm bg-transparent outline-none font-medium text-stone-700 cursor-pointer"
                title={field.label}
              >
                <option value="">-- {field.label} --</option>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-medium text-stone-700 truncate max-w-[200px]"
                title={field.label}
              >
                {field.label}: {field.value || "—"}
              </span>
            )}
            <button
              onClick={() => handleRemove(field.key)}
              className="ml-1 p-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-stone-400 hover:text-stone-600"
              title="Remove"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-stone-500 mt-2">
        Context detected from your message. Adjust or confirm the details above.
      </p>
    </div>
  );
}
