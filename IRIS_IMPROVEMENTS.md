# IRIS Intelligence Improvements — Summary

## What Changed

I've refactored IRIS to be **context-aware, strategically intelligent, and conversation-like** instead of a rigid checklist bot. The changes address all the issues that made the conversation feel static.

---

## 1. Smart Question Selection (`src/lib/iris.ts`)

### Before: Redundant Linear Checklist
```
[IRIS] A member reported an issue...
[USER] I noticed this myself

[IRIS] Is this about a specific member? ❌ (Already obvious!)
```

### After: Context-Aware Inference
- **Skip redundant questions** — If staff said "I noticed it myself," the system now infers it's not member-specific and skips "Is this about a member?"
- **Smarter dedup checks** — Only asks "Has this been reported?" when context suggests it might have been (e.g., old issues, not fresh observations)
- **Understands implications** — When they say "will block classes," the system recognizes urgency and:
  - Prioritizes urgent resolution options
  - Tailors impact questions strategically
  - Fast-tracks to critical path

### Key Functions Added:
```typescript
function detectUrgency(c:Record<string,unknown>):boolean
// Recognizes blocking, safety, or severe impact signals

function extraSlot(category:string,c:Record<string,unknown>)
// Intelligent filtering of category-specific questions
// Skips obvious answers, detects urgency, consolidates related questions
```

---

## 2. Context-Aware Flow Logic

### Smart Member Lookup
- If staff observed the issue themselves (`reportedBy === "I noticed"`), **skip the entire member lookup** — auto-set to "Studio team observation"
- Only ask member details when the issue came from a member

### Strategic Urgency Detection
- When they signal blocking impact, reorder resolution options to show `["Investigate urgently", "Escalate to a manager", ...]` instead of generic list
- Safety/Security tickets now prioritize immediate danger assessment before duplicate checks

### Example Improvement:
```
Before:
[IRIS] Is it blocking a class right now? 
[USER] Not yet, but it will be
[IRIS] How much is this affecting the floor? [generic options]

After:
[IRIS] Is it affecting a live class right now?
[USER] Not yet, but it will be
[IRIS] This will block classes. How severe is the issue? [urgent-first options]
```

---

## 3. Smarter AI Prompting (`src/lib/iris.ts` – runIris)

### Before: Mechanical Template Filling
```javascript
"Ask ONLY this question: ${question}. Keep it under 35 words..."
```

### After: Strategic Contextual Enhancement
```javascript
// AI now understands:
const contextSummary = 
  "This is a ${category}. ${urgency indicators}. Staff said: ${description}"
  
// Enhanced system prompt that tells AI to:
// - Reference what's already been said naturally
// - If urgency signals exist, prioritize critical options
// - Be conversational and strategic, not templated
// - Never recap facts
```

**Before:**
- Generic questions applied to every case
- No synthesis of what's been said
- Missed urgency signals

**After:**
- Questions are contextualized to what's already known
- AI references prior context ("So this mic issue that will hit during evening classes...")
- Urgency is flagged and influences question phrasing
- Feels like talking to a colleague, not a form

---

## 4. Updated AI Voice Setting (`src/lib/settings-contract.ts`)

### New Personality Directive
```
"You're a smart operational assistant helping staff log issues efficiently. 
Be conversational, strategic, and context-aware. Reference what they've told 
you. If they signal urgency or blocking issues, prioritize resolution options. 
Never echo answers, apologize, or recap facts."
```

Previously:
- "Warm, attentive and concise..."
- Generic hospitality tone

Now:
- Operational and strategic
- Context-aware and conversational
- Prioritizes urgency

---

## Why This Works

| Problem | Solution |
|---------|----------|
| Asks "Is this member-specific?" after they said "I noticed it myself" | Smart inference: If `reportedBy === "I noticed"`, skip member lookup entirely |
| Redundant duplicate checks | `detectUrgency()` skips dedup checks on fresh, obvious observations |
| Generic impact questions on urgent issues | Detects blocking/safety, reorders options to urgent-first |
| Static, templated follow-ups | AI now synthesizes context, references prior answers naturally |
| No understanding of workflow | Questions flow strategically: location → impact → resolution based on type |
| Feels like filling a form | Conversational, strategic tone that shows understanding of the problem |

---

## Files Modified

1. **`src/lib/iris.ts`**
   - Added `detectUrgency()` function
   - Enhanced `extraSlot()` with smart filtering
   - Updated main flow logic for context-aware questions
   - Improved AI system prompt with contextual synthesis

2. **`src/lib/settings-contract.ts`**
   - Updated `aiVoice` default to strategic, context-aware tone

---

## Next Steps (Optional)

If you want to further refine:
1. **Add historical context** — Show "Last time this happened (Sept 13), took 3 hours to resolve" when filing similar issues
2. **Member-specific patterns** — Track if a member frequently reports issues vs. one-off problems
3. **Escalation workflows** — Auto-escalate safety/blocking issues with manager notifications
4. **Resolution tracking** — Reference how similar tickets were resolved previously

---

## Testing the Improvement

**Example Scenario:**

```
[IRIS] Hi, I'm Iris — your team's logging assistant...
[STAFF] The mic in studio 1 stopped working

[IRIS] What did you see? [understands it's a fresh observation, context is building]
[STAFF] Earlier today I noticed it stopped working

[IRIS] Got it — undiscovered tech failure, time-sensitive. Is this blocking 
classes right now? [smart follow-up references what's implied]
[STAFF] Not yet, but it will be

[IRIS] This will block classes. Is this affecting anything else, or just the mic? 
[strategic question based on urgency — asking narrowly to resolve fast]
[or resolves to: needs immediate review + escalation options]
```

The conversation now **feels intelligent** because IRIS:
- ✅ Synthesizes what's been said
- ✅ Recognizes urgency patterns
- ✅ Asks strategic questions, not a checklist
- ✅ References prior context naturally
- ✅ Understands workflow implications

---

## 7. The model reads the conversation, not just the first line (19 Sept)

Six defects, all with the same root cause: the model's extraction was discarded after the
opening description, so from turn two onwards the only extractors running were the regex
heuristics — and the model was never allowed to say "that contradicts what you said a
minute ago."

| # | Was | Now |
|---|---|---|
| 1 | `fields` parsed only when `priorField === 'description'` (`iris.ts:620`) | Parsed every turn; written to empty slots only, validated against that field's canonical list |
| 2 | No contradiction check anywhere; a conflicting question was rejected by `mergeProposedTurn` | `conflicts` is the first key in the model's JSON; a `clarify` turn outranks the next question |
| 3 | Closed lists had no escape hatch; an unmatched typed answer was dropped silently | `Something else` on every closed list; a free answer is kept, and an unmatched one is met with the near misses |
| 4 | Session lookup gated on `classRelated` (class categories only) | Also fires whenever a class is disrupted, narrowed by studio and by past/upcoming |
| 5 | Facility categories force-set `memberLookupDone` — nobody could be asked who was affected | `memberImpact` / `impactedMembers`, with the Momence roster as chips |
| 6 | No tests for the flow itself | `npm run check:iris:flow` — 51 assertions replaying the transcripts that went wrong |

### Data bugs fixed along the way

- **"Yes" no longer means "Yesterday."** `normalizeAnswer` matched a bare `/^yes/i`, and
  `OCCURRED_OPTIONS` contains "Yesterday" — so any reply opening with "Yes" rewrote the
  date. Anchored to `/^yes\b/`, and `incidentAt` is no longer re-derived from every message.
- **A maintenance ticket no longer gains a class.** `extractClassContext` read "cycle" in
  *cycle studio* as the *Studio PowerCycle* class format. A class format now survives on a
  facility ticket only when a Momence session is actually linked.
- **One room, one spelling.** "Cycle studio" and "PowerCycle Studio" were both in
  `STUDIO_AREAS`; the alias is resolved and the area list is now per-studio, so a Bandra
  ticket can no longer be filed against "Brain Cell".
- **`Pedal detached / came off`** added to the SC3 playbook as `critical` (was: no keyword
  matched, so Iris asked again and the reporter picked a symptom off the list). Severity now
  reaches `inferPriority`, so a rider-safety fault is filed critical.
- **The bike number is read off the opening line** rather than asked for again.
- **Recognising a fault no longer ends the bike intake** — first-or-recurring, the action
  taken and member impact were being skipped whenever the symptom auto-matched.

### Run it

```bash
npm run check:iris:flow   # replays the transcripts, 51 assertions
npm run check:iris        # the wording/chip contract between the flow and the model
```
