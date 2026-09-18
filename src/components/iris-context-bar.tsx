/**
 * Enhanced Context Bar UI
 * Compact horizontal strip displayed directly above the chat bar.
 * Features:
 * - Real-time auto pickup from conversation and typing
 * - Momence Class Selector (search sessions across studios)
 * - Momence Member Selector (search live members)
 * - Studio selector (5 locations)
 * - Studio-specific Area selector with capacities (His Space, Her Space, Brain Cell, Studio 1 22pax, etc.)
 * - Category selector
 * - Conditional Subcategory selector strictly matching chosen category
 * - Trainer, When/Timing, and Impact tabs
 */

"use client";

import { useState, useMemo, useEffect } from "react";
import {
  MapPin,
  Tag,
  Layers,
  Compass,
  User,
  Users,
  Calendar,
  Clock,
  AlertTriangle,
  X,
  ChevronDown,
  RotateCcw,
  Search,
  Loader2,
  Check,
  CheckCircle2,
} from "lucide-react";
import type { IrisTurn } from "@/lib/iris-contract";
import {
  STUDIOS,
  TRAINERS,
  CATEGORY_MAP,
  OCCURRED_OPTIONS,
  getStudioRoomsForStudio,
} from "@/lib/constants";
import { api, Modal } from "./ui";
import type { MomenceRecord } from "@/lib/momence";
import { indiaDate } from "@/lib/display";

interface ContextBarProps {
  turn?: IrisTurn;
  pendingContext?: Record<string, unknown>;
  liveContext?: Record<string, unknown>;
  onContextChange: (updates: Record<string, string | undefined>) => void;
  onResetContext?: () => void;
}

export function IrisContextBar({
  turn,
  pendingContext = {},
  liveContext = {},
  onContextChange,
  onResetContext,
}: ContextBarProps) {
  const collected = (turn?.collected || {}) as Record<string, unknown>;

  // Priority: Pending User Override > Real-Time Live Message Heuristics > Server Collected Facts
  const currentStudio = String(pendingContext.studio ?? liveContext.studio ?? collected.studio ?? "");
  const currentCategory = String(pendingContext.category ?? liveContext.category ?? collected.category ?? "");
  const currentSubcategory = String(pendingContext.subcategory ?? liveContext.subcategory ?? collected.subcategory ?? "");
  const currentArea = String(pendingContext.area ?? liveContext.area ?? collected.area ?? "");
  const currentTrainer = String(pendingContext.trainer ?? liveContext.trainer ?? collected.trainer ?? "");
  const currentClass = String(
    pendingContext.classFormat ??
    pendingContext.className ??
    liveContext.classFormat ??
    collected.classFormat ??
    collected.className ??
    ""
  );
  const currentMember = String(
    pendingContext.memberName ??
    liveContext.memberName ??
    (collected.studioReport ? "" : (collected.memberName ?? ""))
  );
  const currentWhen = String(pendingContext.incidentAt ?? liveContext.incidentAt ?? collected.incidentAt ?? "");
  const currentImpact = String(
    pendingContext.isClassImpacted ??
    liveContext.isClassImpacted ??
    collected.isClassImpacted ??
    ""
  );

  // Studio-specific rooms & capacities
  const studioRooms = useMemo(() => {
    return getStudioRoomsForStudio(currentStudio);
  }, [currentStudio]);

  // Subcategory list is STRICTLY conditional on category
  const availableSubcategories = useMemo(() => {
    if (!currentCategory || !CATEGORY_MAP[currentCategory]) {
      return [];
    }
    return CATEGORY_MAP[currentCategory] || [];
  }, [currentCategory]);

  // Modals for Momence selectors
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);

  // Momence Class search state
  const [classQuery, setClassQuery] = useState("");
  const [classResults, setClassResults] = useState<MomenceRecord[]>([]);
  const [classLoading, setClassLoading] = useState(false);

  // Momence Member search state
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<MomenceRecord[]>([]);
  const [memberLoading, setMemberLoading] = useState(false);

  // Live query for Momence classes
  useEffect(() => {
    if (!classModalOpen) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setClassLoading(true);
      const params = new URLSearchParams({ module: "sessions", q: classQuery.trim(), page: "0" });
      if (currentStudio) params.set("studio", currentStudio);
      api<{ items: MomenceRecord[]; source: string }>(`/api/momence?${params}`, { signal: controller.signal })
        .then((res) => setClassResults(res.items || []))
        .catch((err) => {
          if (err.name !== "AbortError") setClassResults([]);
        })
        .finally(() => setClassLoading(false));
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [classModalOpen, classQuery, currentStudio]);

  // Live query for Momence members
  useEffect(() => {
    if (!memberModalOpen) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setMemberLoading(true);
      const params = new URLSearchParams({ module: "members", q: memberQuery.trim(), page: "0" });
      api<{ items: MomenceRecord[]; source: string }>(`/api/momence?${params}`, { signal: controller.signal })
        .then((res) => setMemberResults(res.items || []))
        .catch((err) => {
          if (err.name !== "AbortError") setMemberResults([]);
        })
        .finally(() => setMemberLoading(false));
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [memberModalOpen, memberQuery]);

  const activeCount = [
    currentStudio,
    currentCategory,
    currentSubcategory,
    currentArea,
    currentTrainer,
    currentClass,
    currentMember,
    currentWhen,
    currentImpact,
  ].filter(Boolean).length;

  return (
    <>
      <div className="iris-context-bar">
        <div className="context-tag">
          <span>Context</span>
          {activeCount > 0 && <span className="context-count-badge">{activeCount}</span>}
        </div>

        <div className="context-tabs-row">
          {/* 1. Momence Member Selector Tab */}
          <div
            className={`context-tab ${currentMember ? "active" : ""}`}
            onClick={() => setMemberModalOpen(true)}
            title="Search and select Momence member"
          >
            <Users size={11} className="tab-icon" />
            <span className="tab-label">{currentMember || "+ Member"}</span>
            {currentMember ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onContextChange({ memberName: undefined, memberEmail: undefined, memberId: undefined });
                }}
                className="tab-clear"
                title="Clear member"
              >
                <X size={10} />
              </button>
            ) : (
              <ChevronDown size={9} className="tab-chevron" />
            )}
          </div>

          {/* 2. Momence Class Selector Tab */}
          <div
            className={`context-tab ${currentClass ? "active" : ""}`}
            onClick={() => setClassModalOpen(true)}
            title="Search live classes and private sessions from Momence"
          >
            <Calendar size={11} className="tab-icon" />
            <span className="tab-label">{currentClass || "+ Class"}</span>
            {currentClass ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onContextChange({ classFormat: undefined, className: undefined, sessionId: undefined });
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

          {/* 3. Studio Tab */}
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

          {/* 4. Studio-Specific Area Tab with Pax Capacities */}
          <div className={`context-tab ${currentArea ? "active" : ""}`}>
            <Compass size={11} className="tab-icon" />
            <span className="tab-label">{currentArea || "+ Area"}</span>
            <select
              aria-label="Area"
              value={currentArea}
              onChange={(e) => onContextChange({ area: e.target.value || undefined })}
              className="tab-select"
            >
              <option value="">-- Choose Room / Area --</option>
              {studioRooms.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.description}
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

          {/* 5. Category Tab */}
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

          {/* 6. Subcategory Tab (STRICTLY CONDITIONAL on Category) */}
          <div
            className={`context-tab ${currentSubcategory ? "active" : ""} ${!currentCategory ? "opacity-60" : ""}`}
            title={currentCategory ? "Select subcategory" : "Please choose a Category first"}
          >
            <Layers size={11} className="tab-icon" />
            <span className="tab-label">
              {currentSubcategory || (currentCategory ? "+ Subcategory" : "+ Subcategory (pick category)")}
            </span>
            <select
              aria-label="Subcategory"
              value={currentSubcategory}
              disabled={!currentCategory}
              onChange={(e) => onContextChange({ subcategory: e.target.value || undefined })}
              className="tab-select"
            >
              <option value="">
                {currentCategory ? "-- Choose Subcategory --" : "-- Pick Category First --"}
              </option>
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

          {/* 7. Trainer Tab */}
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

          {/* 8. When / Timing Tab */}
          <div className={`context-tab ${currentWhen ? "active" : ""}`}>
            <Clock size={11} className="tab-icon" />
            <span className="tab-label">{currentWhen || "+ When"}</span>
            <select
              aria-label="Incident time"
              value={currentWhen}
              onChange={(e) => onContextChange({ incidentAt: e.target.value || undefined })}
              className="tab-select"
            >
              <option value="">-- When did it happen? --</option>
              {OCCURRED_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            {currentWhen ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onContextChange({ incidentAt: undefined });
                }}
                className="tab-clear"
                title="Clear timing"
              >
                <X size={10} />
              </button>
            ) : (
              <ChevronDown size={9} className="tab-chevron" />
            )}
          </div>

          {/* 9. Class Impact Tab */}
          <div className={`context-tab ${currentImpact ? "active" : ""}`}>
            <AlertTriangle size={11} className="tab-icon" />
            <span className="tab-label">{currentImpact ? `Impact: ${currentImpact}` : "+ Impact"}</span>
            <select
              aria-label="Class Impact"
              value={currentImpact}
              onChange={(e) => onContextChange({ isClassImpacted: e.target.value || undefined })}
              className="tab-select"
            >
              <option value="">-- Is class impacted? --</option>
              <option value="Yes, blocking now">Yes, blocking now</option>
              <option value="Not yet, but it will be">Not yet, but it will be</option>
              <option value="No immediate disruption">No immediate disruption</option>
            </select>
            {currentImpact ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onContextChange({ isClassImpacted: undefined });
                }}
                className="tab-clear"
                title="Clear impact"
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

      {/* MOMENCE CLASS SELECTOR MODAL */}
      <Modal
        open={classModalOpen}
        onClose={() => setClassModalOpen(false)}
        title="Select Class from Momence"
        description={
          currentStudio
            ? `Searching live scheduled sessions for ${currentStudio}`
            : "Search all active classes and private sessions across studios"
        }
        size="normal"
      >
        <div className="space-y-3">
          <div className="search-input">
            <Search size={14} />
            <input
              type="text"
              autoFocus
              placeholder="Search by class name, format, or instructor…"
              value={classQuery}
              onChange={(e) => setClassQuery(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="max-h-[340px] overflow-y-auto space-y-1.5 pr-1">
            {classLoading ? (
              <div className="py-8 text-center text-xs text-muted">
                <Loader2 size={16} className="animate-spin inline mr-2" />
                Loading Momence sessions…
              </div>
            ) : classResults.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted">
                {classQuery ? "No matching sessions found." : "Type to search Momence sessions."}
              </div>
            ) : (
              classResults.map((item) => {
                const startsAt = item.raw.startsAt ? String(item.raw.startsAt) : "";
                const isCurrent =
                  currentClass === item.name || currentClass.includes(item.name);
                return (
                  <div
                    key={String(item.id)}
                    onClick={() => {
                      onContextChange({
                        classFormat: item.name,
                        className: item.name,
                        sessionId: String(item.id),
                        ...(item.subtitle.includes("·")
                          ? { trainer: item.subtitle.split("·")[0]?.trim() }
                          : {}),
                      });
                      setClassModalOpen(false);
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      isCurrent
                        ? "bg-accent/15 border-accent text-accent"
                        : "bg-surface-2 hover:bg-surface-3 border-border"
                    }`}
                  >
                    <div className="min-w-0">
                      <strong className="text-xs block font-semibold truncate">{item.name}</strong>
                      <p className="text-[10px] text-muted truncate mt-0.5">
                        {item.subtitle}
                        {startsAt ? ` · ${indiaDate(startsAt)}` : ""}
                      </p>
                    </div>
                    {isCurrent && <Check size={14} className="text-accent ml-2 shrink-0" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      {/* MOMENCE MEMBER SELECTOR MODAL */}
      <Modal
        open={memberModalOpen}
        onClose={() => setMemberModalOpen(false)}
        title="Select Member from Momence"
        description="Search registered members by name, email, or phone number."
        size="normal"
      >
        <div className="space-y-3">
          <div className="search-input">
            <Search size={14} />
            <input
              type="text"
              autoFocus
              placeholder="Search member by name or email…"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="max-h-[340px] overflow-y-auto space-y-1.5 pr-1">
            {memberLoading ? (
              <div className="py-8 text-center text-xs text-muted">
                <Loader2 size={16} className="animate-spin inline mr-2" />
                Loading Momence members…
              </div>
            ) : memberResults.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted">
                {memberQuery ? "No matching members found." : "Type a member name or email to search."}
              </div>
            ) : (
              memberResults.map((item) => {
                const isCurrent = currentMember === item.name;
                const email = item.raw.email ? String(item.raw.email) : "";
                const phone = item.raw.phone ? String(item.raw.phone) : "";
                return (
                  <div
                    key={String(item.id)}
                    onClick={() => {
                      onContextChange({
                        memberName: item.name,
                        memberEmail: email || undefined,
                        memberId: String(item.id),
                      });
                      setMemberModalOpen(false);
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      isCurrent
                        ? "bg-accent/15 border-accent text-accent"
                        : "bg-surface-2 hover:bg-surface-3 border-border"
                    }`}
                  >
                    <div className="min-w-0">
                      <strong className="text-xs block font-semibold truncate">{item.name}</strong>
                      <p className="text-[10px] text-muted truncate mt-0.5">
                        {item.subtitle || email || phone || "Member"}
                      </p>
                    </div>
                    {isCurrent && <Check size={14} className="text-accent ml-2 shrink-0" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
