/**
 * Context Bar UI
 * Interactive sticky tab bar at the top of the chat box.
 * Displays tabs for Studio, Category, Subcategory, Area, Trainer, and Class.
 * Dropdown options allow users to select or override context to send along with messages.
 */

"use client";

import { useMemo } from "react";
import {
  MapPin,
  Tag,
  Layers,
  Compass,
  User,
  Dumbbell,
  X,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import type { IrisTurn } from "@/lib/iris-contract";
import {
  STUDIOS,
  TRAINERS,
  STUDIO_AREAS,
  CLASS_FORMATS,
  CATEGORY_MAP,
} from "@/lib/constants";

interface ContextBarProps {
  turn?: IrisTurn;
  pendingContext?: Record<string, string>;
  onContextChange: (updates: Record<string, string | undefined>) => void;
  onResetContext?: () => void;
}

export function IrisContextBar({
  turn,
  pendingContext = {},
  onContextChange,
  onResetContext,
}: ContextBarProps) {
  const collected = (turn?.collected || {}) as Record<string, unknown>;

  // Values prioritize pending user selections, then server-collected values
  const currentStudio = String(pendingContext.studio ?? collected.studio ?? "");
  const currentCategory = String(pendingContext.category ?? collected.category ?? "");
  const currentSubcategory = String(pendingContext.subcategory ?? collected.subcategory ?? "");
  const currentArea = String(pendingContext.area ?? collected.area ?? "");
  const currentTrainer = String(pendingContext.trainer ?? collected.trainer ?? "");
  const currentClass = String(pendingContext.classFormat ?? collected.classFormat ?? "");

  // Subcategory list dynamically based on chosen category
  const availableSubcategories = useMemo(() => {
    if (!currentCategory || !CATEGORY_MAP[currentCategory]) {
      return Object.values(CATEGORY_MAP).flat().slice(0, 30);
    }
    return CATEGORY_MAP[currentCategory] || [];
  }, [currentCategory]);

  const activeCount = [
    currentStudio,
    currentCategory,
    currentSubcategory,
    currentArea,
    currentTrainer,
    currentClass,
  ].filter(Boolean).length;

  return (
    <div className="iris-context-bar border-b border-stone-200/80 dark:border-stone-800 bg-stone-50/90 dark:bg-[#15151c]/90 backdrop-blur px-3.5 py-2">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Active Context {activeCount > 0 && `(${activeCount})`}</span>
          <span className="text-[10px] font-normal lowercase tracking-normal text-stone-400">
            · Select or override fields to send with your message
          </span>
        </div>
        {activeCount > 0 && onResetContext && (
          <button
            type="button"
            onClick={onResetContext}
            className="text-[10px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 flex items-center gap-1 transition-colors"
            title="Reset selected context"
          >
            <RotateCcw size={10} />
            <span>Reset</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {/* Studio Tab */}
        <div
          className={`context-tab-chip group relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all ${
            currentStudio
              ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200 font-medium"
              : "bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-750 text-stone-600 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-700"
          }`}
        >
          <MapPin size={12} className={currentStudio ? "text-amber-600 dark:text-amber-400 flex-shrink-0" : "text-stone-400 flex-shrink-0"} />
          <div className="relative flex items-center">
            <select
              aria-label="Select Studio"
              value={currentStudio}
              onChange={(e) => onContextChange({ studio: e.target.value || undefined })}
              className="appearance-none bg-transparent pr-4 outline-none cursor-pointer max-w-[140px] truncate text-xs"
            >
              <option value="">Studio...</option>
              {STUDIOS.map((s) => (
                <option key={s.id} value={s.name} className="dark:bg-stone-900">
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown size={10} className="pointer-events-none absolute right-0 opacity-50" />
          </div>
          {currentStudio && (
            <button
              type="button"
              onClick={() => onContextChange({ studio: undefined })}
              className="ml-0.5 rounded-full hover:bg-amber-500/20 p-0.5"
              title="Clear studio"
            >
              <X size={10} />
            </button>
          )}
        </div>

        {/* Category Tab */}
        <div
          className={`context-tab-chip group relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all ${
            currentCategory
              ? "bg-blue-500/10 border-blue-500/30 text-blue-900 dark:text-blue-200 font-medium"
              : "bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-750 text-stone-600 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-700"
          }`}
        >
          <Tag size={12} className={currentCategory ? "text-blue-600 dark:text-blue-400 flex-shrink-0" : "text-stone-400 flex-shrink-0"} />
          <div className="relative flex items-center">
            <select
              aria-label="Select Category"
              value={currentCategory}
              onChange={(e) => {
                const cat = e.target.value || undefined;
                onContextChange({ category: cat, subcategory: undefined });
              }}
              className="appearance-none bg-transparent pr-4 outline-none cursor-pointer max-w-[140px] truncate text-xs"
            >
              <option value="">Category...</option>
              {Object.keys(CATEGORY_MAP).map((cat) => (
                <option key={cat} value={cat} className="dark:bg-stone-900">
                  {cat}
                </option>
              ))}
            </select>
            <ChevronDown size={10} className="pointer-events-none absolute right-0 opacity-50" />
          </div>
          {currentCategory && (
            <button
              type="button"
              onClick={() => onContextChange({ category: undefined, subcategory: undefined })}
              className="ml-0.5 rounded-full hover:bg-blue-500/20 p-0.5"
              title="Clear category"
            >
              <X size={10} />
            </button>
          )}
        </div>

        {/* Subcategory Tab */}
        <div
          className={`context-tab-chip group relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all ${
            currentSubcategory
              ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-900 dark:text-indigo-200 font-medium"
              : "bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-750 text-stone-600 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-700"
          }`}
        >
          <Layers size={12} className={currentSubcategory ? "text-indigo-600 dark:text-indigo-400 flex-shrink-0" : "text-stone-400 flex-shrink-0"} />
          <div className="relative flex items-center">
            <select
              aria-label="Select Subcategory"
              value={currentSubcategory}
              onChange={(e) => onContextChange({ subcategory: e.target.value || undefined })}
              className="appearance-none bg-transparent pr-4 outline-none cursor-pointer max-w-[150px] truncate text-xs"
            >
              <option value="">Subcategory...</option>
              {availableSubcategories.map((sub) => (
                <option key={sub} value={sub} className="dark:bg-stone-900">
                  {sub}
                </option>
              ))}
            </select>
            <ChevronDown size={10} className="pointer-events-none absolute right-0 opacity-50" />
          </div>
          {currentSubcategory && (
            <button
              type="button"
              onClick={() => onContextChange({ subcategory: undefined })}
              className="ml-0.5 rounded-full hover:bg-indigo-500/20 p-0.5"
              title="Clear subcategory"
            >
              <X size={10} />
            </button>
          )}
        </div>

        {/* Area Tab */}
        <div
          className={`context-tab-chip group relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all ${
            currentArea
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200 font-medium"
              : "bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-750 text-stone-600 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-700"
          }`}
        >
          <Compass size={12} className={currentArea ? "text-emerald-600 dark:text-emerald-400 flex-shrink-0" : "text-stone-400 flex-shrink-0"} />
          <div className="relative flex items-center">
            <select
              aria-label="Select Area"
              value={currentArea}
              onChange={(e) => onContextChange({ area: e.target.value || undefined })}
              className="appearance-none bg-transparent pr-4 outline-none cursor-pointer max-w-[130px] truncate text-xs"
            >
              <option value="">Area...</option>
              {STUDIO_AREAS.map((a) => (
                <option key={a} value={a} className="dark:bg-stone-900">
                  {a}
                </option>
              ))}
            </select>
            <ChevronDown size={10} className="pointer-events-none absolute right-0 opacity-50" />
          </div>
          {currentArea && (
            <button
              type="button"
              onClick={() => onContextChange({ area: undefined })}
              className="ml-0.5 rounded-full hover:bg-emerald-500/20 p-0.5"
              title="Clear area"
            >
              <X size={10} />
            </button>
          )}
        </div>

        {/* Trainer Tab */}
        <div
          className={`context-tab-chip group relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all ${
            currentTrainer
              ? "bg-purple-500/10 border-purple-500/30 text-purple-900 dark:text-purple-200 font-medium"
              : "bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-750 text-stone-600 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-700"
          }`}
        >
          <User size={12} className={currentTrainer ? "text-purple-600 dark:text-purple-400 flex-shrink-0" : "text-stone-400 flex-shrink-0"} />
          <div className="relative flex items-center">
            <select
              aria-label="Select Trainer"
              value={currentTrainer}
              onChange={(e) => onContextChange({ trainer: e.target.value || undefined })}
              className="appearance-none bg-transparent pr-4 outline-none cursor-pointer max-w-[130px] truncate text-xs"
            >
              <option value="">Trainer...</option>
              {TRAINERS.map((t) => (
                <option key={t} value={t} className="dark:bg-stone-900">
                  {t}
                </option>
              ))}
            </select>
            <ChevronDown size={10} className="pointer-events-none absolute right-0 opacity-50" />
          </div>
          {currentTrainer && (
            <button
              type="button"
              onClick={() => onContextChange({ trainer: undefined })}
              className="ml-0.5 rounded-full hover:bg-purple-500/20 p-0.5"
              title="Clear trainer"
            >
              <X size={10} />
            </button>
          )}
        </div>

        {/* Class Format Tab */}
        <div
          className={`context-tab-chip group relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all ${
            currentClass
              ? "bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200 font-medium"
              : "bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-750 text-stone-600 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-700"
          }`}
        >
          <Dumbbell size={12} className={currentClass ? "text-rose-600 dark:text-rose-400 flex-shrink-0" : "text-stone-400 flex-shrink-0"} />
          <div className="relative flex items-center">
            <select
              aria-label="Select Class Format"
              value={currentClass}
              onChange={(e) => onContextChange({ classFormat: e.target.value || undefined })}
              className="appearance-none bg-transparent pr-4 outline-none cursor-pointer max-w-[130px] truncate text-xs"
            >
              <option value="">Class...</option>
              <option value="Group" className="dark:bg-stone-900">Group Class</option>
              <option value="Private" className="dark:bg-stone-900">Private (PT)</option>
              <option value="Semi-Private" className="dark:bg-stone-900">Semi-Private</option>
              {CLASS_FORMATS.map((cf) => (
                <option key={cf} value={cf} className="dark:bg-stone-900">
                  {cf}
                </option>
              ))}
            </select>
            <ChevronDown size={10} className="pointer-events-none absolute right-0 opacity-50" />
          </div>
          {currentClass && (
            <button
              type="button"
              onClick={() => onContextChange({ classFormat: undefined })}
              className="ml-0.5 rounded-full hover:bg-rose-500/20 p-0.5"
              title="Clear class"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
