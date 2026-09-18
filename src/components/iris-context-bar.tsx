/**
 * Compact Context Bar UI
 * Modern, slim horizontal strip at the top of the chat box.
 * Compact pill tabs for Studio, Category, Subcategory, Area, Trainer, and Class.
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
    <div className="iris-context-bar">
      <div className="context-tag">
        <span>Context</span>
        {activeCount > 0 && <span className="context-count-badge">{activeCount}</span>}
      </div>

      <div className="context-tabs-row">
        {/* Studio Tab */}
        <div className={`context-tab ${currentStudio ? "active" : ""}`}>
          <MapPin size={11} className="tab-icon" />
          <span className="tab-label">{currentStudio || "+ Studio"}</span>
          <select
            aria-label="Studio"
            value={currentStudio}
            onChange={(e) => onContextChange({ studio: e.target.value || undefined })}
            className="tab-select"
          >
            <option value="">-- Choose Studio --</option>
            {STUDIOS.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          {currentStudio ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onContextChange({ studio: undefined });
              }}
              className="tab-clear"
              title="Clear studio"
            >
              <X size={10} />
            </button>
          ) : (
            <ChevronDown size={9} className="tab-chevron" />
          )}
        </div>

        {/* Category Tab */}
        <div className={`context-tab ${currentCategory ? "active" : ""}`}>
          <Tag size={11} className="tab-icon" />
          <span className="tab-label">{currentCategory || "+ Category"}</span>
          <select
            aria-label="Category"
            value={currentCategory}
            onChange={(e) => {
              const cat = e.target.value || undefined;
              onContextChange({ category: cat, subcategory: undefined });
            }}
            className="tab-select"
          >
            <option value="">-- Choose Category --</option>
            {Object.keys(CATEGORY_MAP).map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          {currentCategory ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onContextChange({ category: undefined, subcategory: undefined });
              }}
              className="tab-clear"
              title="Clear category"
            >
              <X size={10} />
            </button>
          ) : (
            <ChevronDown size={9} className="tab-chevron" />
          )}
        </div>

        {/* Subcategory Tab */}
        <div className={`context-tab ${currentSubcategory ? "active" : ""}`}>
          <Layers size={11} className="tab-icon" />
          <span className="tab-label">{currentSubcategory || "+ Subcategory"}</span>
          <select
            aria-label="Subcategory"
            value={currentSubcategory}
            onChange={(e) => onContextChange({ subcategory: e.target.value || undefined })}
            className="tab-select"
          >
            <option value="">-- Choose Subcategory --</option>
            {availableSubcategories.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
          {currentSubcategory ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onContextChange({ subcategory: undefined });
              }}
              className="tab-clear"
              title="Clear subcategory"
            >
              <X size={10} />
            </button>
          ) : (
            <ChevronDown size={9} className="tab-chevron" />
          )}
        </div>

        {/* Area Tab */}
        <div className={`context-tab ${currentArea ? "active" : ""}`}>
          <Compass size={11} className="tab-icon" />
          <span className="tab-label">{currentArea || "+ Area"}</span>
          <select
            aria-label="Area"
            value={currentArea}
            onChange={(e) => onContextChange({ area: e.target.value || undefined })}
            className="tab-select"
          >
            <option value="">-- Choose Area --</option>
            {STUDIO_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          {currentArea ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onContextChange({ area: undefined });
              }}
              className="tab-clear"
              title="Clear area"
            >
              <X size={10} />
            </button>
          ) : (
            <ChevronDown size={9} className="tab-chevron" />
          )}
        </div>

        {/* Trainer Tab */}
        <div className={`context-tab ${currentTrainer ? "active" : ""}`}>
          <User size={11} className="tab-icon" />
          <span className="tab-label">{currentTrainer || "+ Trainer"}</span>
          <select
            aria-label="Trainer"
            value={currentTrainer}
            onChange={(e) => onContextChange({ trainer: e.target.value || undefined })}
            className="tab-select"
          >
            <option value="">-- Choose Trainer --</option>
            {TRAINERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {currentTrainer ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onContextChange({ trainer: undefined });
              }}
              className="tab-clear"
              title="Clear trainer"
            >
              <X size={10} />
            </button>
          ) : (
            <ChevronDown size={9} className="tab-chevron" />
          )}
        </div>

        {/* Class Format Tab */}
        <div className={`context-tab ${currentClass ? "active" : ""}`}>
          <Dumbbell size={11} className="tab-icon" />
          <span className="tab-label">{currentClass || "+ Class"}</span>
          <select
            aria-label="Class Format"
            value={currentClass}
            onChange={(e) => onContextChange({ classFormat: e.target.value || undefined })}
            className="tab-select"
          >
            <option value="">-- Choose Class / Format --</option>
            <option value="Group">Group Class</option>
            <option value="Private">Private (PT)</option>
            <option value="Semi-Private">Semi-Private</option>
            {CLASS_FORMATS.map((cf) => (
              <option key={cf} value={cf}>
                {cf}
              </option>
            ))}
          </select>
          {currentClass ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onContextChange({ classFormat: undefined });
              }}
              className="tab-clear"
              title="Clear class"
            >
              <X size={10} />
            </button>
          ) : (
            <ChevronDown size={9} className="tab-chevron" />
          )}
        </div>
      </div>

      {activeCount > 0 && onResetContext && (
        <button
          type="button"
          onClick={onResetContext}
          className="context-reset-btn"
          title="Clear all active context"
        >
          <RotateCcw size={9} />
          <span>Clear</span>
        </button>
      )}
    </div>
  );
}
