"use client";
import {useMemo, useRef, useState} from "react";
import type {ReactNode} from "react";

/**
 * Tagging a teammate, shared by every internal writing surface (ticket notes, the resolution
 * step log) so one `@` behaves the same everywhere.
 *
 * The server will only accept a mention whose name still appears in the body, so the people
 * picked here are carried alongside the text and filtered at submit time — see `mentionIdsIn`.
 */
export type MentionPerson = {userId: number; name: string; username: string | null};

/** What goes into the text for this person: their handle, or their display name for an
 *  account that has not been given one yet. */
export const mentionLabel = (person: MentionPerson) => person.username || person.name;

/** The `@partial` being typed at the caret, or null when the caret is not in a mention.
 *  A handle has no space in it, but the display-name fallback does, so the term may still
 *  contain one — it stops at a newline or a second `@`. */
const PENDING = /(?:^|\s)@([^@\n]*)$/;

/** The ids actually still referenced by the text — a name deleted after tagging is dropped. */
export function mentionIdsIn(body: string, picked: MentionPerson[]): number[] {
  return [
    ...new Set(
      picked
        // Either form still counts as a tag: the handle that was inserted, or a display name
        // typed out by hand or left over from a note written before handles existed.
        .filter((p) => body.includes("@" + mentionLabel(p)) || body.includes("@" + p.name))
        .map((p) => p.userId),
    ),
  ];
}

/** Renders a posted note with its `@names` marked, longest name first so "@Anita Rao" wins over "@Anita". */
export function MentionText({body, people}: {body: string; people: MentionPerson[]}): ReactNode {
  const names = useMemo(
    () =>
      [...new Set(people.flatMap((p) => [mentionLabel(p), p.name]))]
        // Longest first so "@anita.rao" wins over "@anita" and "@Anita Rao" over "@Anita".
        .sort((a, b) => b.length - a.length),
    [people],
  );
  if (!names.length || !body.includes("@")) return body;
  const pattern = new RegExp("@(" + names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g");
  const out: ReactNode[] = [];
  let at = 0;
  for (const match of body.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > at) out.push(body.slice(at, start));
    out.push(<strong key={start} className="mention-tag">{match[0]}</strong>);
    at = start + match[0].length;
  }
  if (at < body.length) out.push(body.slice(at));
  return out;
}

export function MentionBox({
  value, onChange, people, onPick, rows = 3, placeholder, disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  people: MentionPerson[];
  /** Called with every teammate the writer picks; the caller keeps the list for submit. */
  onPick: (person: MentionPerson) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  // The highlighted option is held as the person's id rather than an index, so a changing
  // search term cannot leave the highlight pointing at a different teammate.
  const [activeId, setActiveId] = useState<number>();
  const ref = useRef<HTMLTextAreaElement>(null);
  const match = value.match(PENDING);
  const options = useMemo(() => {
    if (!match) return [];
    const term = match[1].toLowerCase();
    return people
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.username ?? "").toLowerCase().includes(term),
      )
      // A handle match is what the writer is most likely typing towards, so it ranks first.
      .sort((a, b) => {
        const score = (p: MentionPerson) => ((p.username ?? "").toLowerCase().startsWith(term) ? 0 : 1);
        return score(a) - score(b);
      })
      .slice(0, 8);
  }, [match, people]);

  const active = Math.max(0, options.findIndex((p) => p.userId === activeId));

  function pick(person: MentionPerson) {
    onChange(value.replace(PENDING, (m) => m.slice(0, m.lastIndexOf("@")) + "@" + mentionLabel(person) + " "));
    onPick(person);
    ref.current?.focus();
  }

  return (
    <div className="mention-box">
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (!options.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActiveId(options[(active + 1) % options.length].userId); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActiveId(options[(active - 1 + options.length) % options.length].userId); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(options[active]); }
          else if (e.key === "Escape") { e.preventDefault(); onChange(value + " "); }
        }}
      />
      {options.length > 0 && (
        <div className="card mention-menu" role="listbox" aria-label="Tag a teammate">
          {options.map((person, i) => (
            <button
              key={person.userId}
              type="button"
              role="option"
              aria-selected={i === active}
              className={"mention-option" + (i === active ? " active" : "")}
              onMouseDown={(e) => { e.preventDefault(); pick(person); }}
            >
              <span className="mention-option-handle">@{mentionLabel(person)}</span>
              {person.username && <span className="mention-option-name">{person.name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
