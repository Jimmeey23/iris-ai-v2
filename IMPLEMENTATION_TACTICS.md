# IRIS Enhancement — Implementation Tactics
## Quick Wins You Can Start Today

---

## 1. Event Logging System (2-3 Hours)

### Step 1: Create the `irisEvents` Table

Add to `src/db/schema.ts`:

```typescript
export const irisEvents = pgTable("iris_events", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
  event: text("event").notNull(), // 'question_skipped', 'urgency_detected', 'context_inferred', 'member_lookup_skipped'
  category: text("category"),
  subcategory: text("subcategory"),
  fieldKey: text("field_key"), // Which field was skipped/detected?
  reason: text("reason"), // Why? (e.g., 'context_already_known', 'auto_filled_as_studio_report')
  urgencyLevel: text("urgency_level"), // 'blocking', 'safety', 'normal'
  savedSeconds: integer("saved_seconds"), // Time estimation
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("iris_events_session_idx").on(t.sessionId),
  index("iris_events_event_idx").on(t.event, t.createdAt),
  index("iris_events_category_idx").on(t.category, t.event)
]);
```

Run migration:
```bash
npm run db:generate
npm run db:migrate
```

### Step 2: Add Logging Helper in `src/lib/iris.ts`

```typescript
async function logIrisEvent(
  sessionId: string,
  event: 'question_skipped' | 'urgency_detected' | 'context_inferred' | 'member_lookup_skipped',
  data: {
    category?: string;
    subcategory?: string;
    fieldKey?: string;
    reason?: string;
    urgencyLevel?: string;
    savedSeconds?: number;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    await db.insert(irisEvents).values({
      sessionId,
      event,
      category: data.category,
      subcategory: data.subcategory,
      fieldKey: data.fieldKey,
      reason: data.reason,
      urgencyLevel: data.urgencyLevel,
      savedSeconds: data.savedSeconds,
      metadata: data.metadata || {},
      createdAt: new Date()
    });
  } catch (err) {
    console.warn('Failed to log iris event:', err);
    // Don't let logging errors break the conversation
  }
}
```

### Step 3: Instrument `runIris()` Question Selection Logic

In the question selection flow, add logging at strategic points:

```typescript
// When we skip member lookup due to context
if (!c.memberLookupDone && isStudioReport && !c.memberName) {
  await logIrisEvent(input.sessionId, 'member_lookup_skipped', {
    category: String(c.category),
    subcategory: String(c.subcategory),
    fieldKey: 'memberLookup',
    reason: 'staff_observed_directly',
    savedSeconds: 20, // Member lookup typically takes 20-30 sec
    metadata: { reportedBy: c.reportedBy }
  });
  c.memberLookupDone = true;
  c.memberName = 'Studio team observation';
  // ... rest of logic
}

// When urgency is detected
if (detectUrgency(c)) {
  const urgencyLevel = c.isClassImpacted === 'Yes, blocking now' ? 'blocking' : 'safety';
  await logIrisEvent(input.sessionId, 'urgency_detected', {
    category: String(c.category),
    subcategory: String(c.subcategory),
    urgencyLevel,
    metadata: {
      isClassImpacted: c.isClassImpacted,
      isImmediateDanger: c.isImmediateDanger,
      impact: c.impact
    }
  });
}

// When extraSlot skips a question
else {
  const extra = !praise ? extraSlot(String(c.category), c) : null;
  if (!extra && /* we would have asked but decided not to */) {
    await logIrisEvent(input.sessionId, 'question_skipped', {
      category: String(c.category),
      fieldKey: 'category_specific_question',
      reason: 'already_addressed_in_description',
      savedSeconds: 15,
      metadata: { description: String(c.description).slice(0, 100) }
    });
  }
}
```

---

## 2. Draft Confidence Scoring (2-3 Hours)

### Step 1: Add Confidence Calculation

In `src/lib/iris.ts`:

```typescript
function calculateDraftConfidence(collected: Record<string, unknown>): {
  score: number;
  confirmed: string[];
  uncertain: string[];
  missing: string[];
} {
  // Fields that should be confirmed by staff (not inferred)
  const required = ['category', 'subcategory', 'studio', 'incidentAt', 'impact'];
  const classRelated = ['Class Experience', 'Trainer Feedback', 'Scheduling'].includes(
    String(collected.category)
  );
  
  if (classRelated) required.push('sessionLookupDone');
  
  const confirmed = required.filter(k => {
    const value = collected[k];
    if (!value) return false;
    // Check if it's inferred (not confirmed by staff)
    if (String(value).includes('inferred') || 
        k === 'category' && collected._categoryInferred && !collected._categoryConfirmed) {
      return false;
    }
    return true;
  });
  
  const uncertain = required.filter(k => {
    const value = collected[k];
    if (!value) return false;
    if (String(value).includes('inferred')) return true;
    if (k === 'category' && collected._categoryInferred && !collected._categoryConfirmed) return true;
    return false;
  });
  
  const missing = required.filter(k => !collected[k]);
  
  const score = Math.round((confirmed.length / required.length) * 100);
  
  return {
    score,
    confirmed: confirmed.map(k => ({field: k, value: collected[k]})),
    uncertain: uncertain.map(k => ({field: k, value: collected[k]})),
    missing
  };
}
```

### Step 2: Add Confidence to Draft Response

Modify the return value in `runIris()` to include:

```typescript
return {
  sessionId,
  message: question,
  phase: 'ready',
  fieldKey,
  options: opts,
  collected: c,
  draft: {
    // ... existing draft fields
    confidence: calculateDraftConfidence(c),
    suggestedClarifications: generateClarifications(c)
  },
  progress: { done, total },
  lookup,
  lookupFilters,
  engine
};
```

### Step 3: Generate Clarification Suggestions

```typescript
function generateClarifications(collected: Record<string, unknown>): string[] {
  const suggestions: string[] = [];
  
  if (collected._categoryInferred && !collected._categoryConfirmed) {
    suggestions.push(
      `Confirm: This is a "${collected.subcategory}" under "${collected.category}"`
    );
  }
  
  if (collected.manualMember && !collected.memberPhone) {
    suggestions.push('Add a contact number if available for faster follow-up');
  }
  
  if (collected.impact === 'Minor inconvenience' && collected.isClassImpacted === 'Not yet, but it will be') {
    suggestions.push('Clarify: Will this definitely impact the class, or is it preventable?');
  }
  
  return suggestions;
}
```

### Step 4: Update `iris-chat.tsx` to Display Confidence

In the draft display section:

```typescript
{turn?.draft?.confidence && (
  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
    <div className="flex items-center gap-2 mb-2">
      <span className={`text-sm font-semibold ${
        turn.draft.confidence.score >= 85 ? 'text-green-700' :
        turn.draft.confidence.score >= 70 ? 'text-yellow-700' :
        'text-orange-700'
      }`}>
        {turn.draft.confidence.score}% Confidence
      </span>
    </div>
    
    {turn.draft.confidence.score < 85 && turn.draft.suggestedClarifications?.length > 0 && (
      <div className="space-y-1">
        {turn.draft.suggestedClarifications.map((suggestion, i) => (
          <p key={i} className="text-xs text-gray-700">
            ❓ {suggestion}
          </p>
        ))}
      </div>
    )}
    
    {turn.draft.confidence.uncertain.length > 0 && (
      <p className="text-xs text-yellow-600 mt-2">
        ⚠️ Guessed: {turn.draft.confidence.uncertain.map(u => u.field).join(', ')}
      </p>
    )}
  </div>
)}
```

---

## 3. Staff Satisfaction Poll (1-2 Hours)

### Step 1: Add `staffFeedback` Table

In `src/db/schema.ts`:

```typescript
export const staffFeedback = pgTable("staff_feedback", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").references(() => tickets.id, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => chatSessions.id, { onDelete: "cascade" }),
  staffId: integer("staff_id").references(() => staff.id),
  irisHelpfulness: integer("iris_helpfulness"), // 1-5 scale
  comment: text("comment"),
  category: text("category"),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("staff_feedback_ticket_idx").on(t.ticketId),
  index("staff_feedback_session_idx").on(t.sessionId),
  index("staff_feedback_staff_idx").on(t.staffId)
]);
```

### Step 2: Create Feedback Component

Create `src/components/iris-feedback-modal.tsx`:

```typescript
import { useState } from 'react';
import { Modal, Field } from './ui';
import { Star } from 'lucide-react';

export function IrisFeedbackModal({ 
  isOpen, 
  onClose, 
  sessionId,
  ticketId 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  sessionId: string;
  ticketId?: number;
}) {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit() {
    try {
      await fetch('/api/iris/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          ticketId,
          irisHelpfulness: rating,
          comment: comment || null
        })
      });
      setSubmitted(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    }
  }

  if (submitted) {
    return (
      <Modal title="Thanks!" onClose={onClose} open={isOpen}>
        <div className="text-center py-6">
          <p className="text-green-600 font-semibold">✅ Feedback recorded</p>
          <p className="text-sm text-gray-600 mt-2">
            Helping us make Iris smarter every day
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="How helpful was Iris?" onClose={onClose} open={isOpen}>
      <div className="space-y-4 py-4">
        {/* Star Rating */}
        <div className="flex gap-2 justify-center py-4">
          {[1, 2, 3, 4, 5].map(i => (
            <button
              key={i}
              onClick={() => setRating(i)}
              className="transition-transform hover:scale-125"
            >
              <Star
                size={28}
                className={rating >= i ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}
              />
            </button>
          ))}
        </div>

        {/* Comment */}
        <Field
          label="Optional: What could be better?"
          placeholder="e.g., Too many questions, misunderstood the issue..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          as="textarea"
          rows={3}
        />

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={rating === 0}
          className="w-full py-2 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
        >
          Submit Feedback
        </button>
      </div>
    </Modal>
  );
}
```

### Step 3: Trigger Modal After Approval

In `iris-chat.tsx`, after approval:

```typescript
const [showFeedback, setShowFeedback] = useState(false);

async function approve() {
  if(!turn||lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
    const d=await api<{ticket:{id:number;ticketNumber:string}}>
      ('/api/iris/approve',{method:'POST',body:JSON.stringify({sessionId:turn.sessionId})});
    
    // Show feedback modal
    setTicketId(d.ticket.id);
    setShowFeedback(true);
    
    const done={...turn,phase:'complete' as const,message:`${d.ticket.ticketNumber} is logged...`,ticket:d.ticket,options:[]};
    apply(done);
    setDraftOpen(false);
  }catch(e){setError((e as Error).message);}
  finally{setBusy(false);lock.current=false;}
}

// Add to JSX
<IrisFeedbackModal 
  isOpen={showFeedback}
  onClose={() => setShowFeedback(false)}
  sessionId={turn?.sessionId || ''}
  ticketId={ticketId}
/>
```

### Step 4: Create Feedback API Route

Create `src/app/api/iris/feedback/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { db } from '@/db';
import { staffFeedback, appUsers } from '@/db/schema';
import { requireWorkspace, errorResponse } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await requireWorkspace();
    const { sessionId, ticketId, irisHelpfulness, comment } = await req.json();

    // TODO: Get actual staff ID from session/auth
    // For now, we'll leave it null - can be linked later via chat session ownership

    await db.insert(staffFeedback).values({
      sessionId,
      ticketId: ticketId ? parseInt(ticketId) : null,
      irisHelpfulness,
      comment
    });

    return Response.json({ success: true });
  } catch (e) {
    return errorResponse(e);
  }
}
```

---

## 4. Analytics Endpoint Updates (1 Hour)

Add IRIS-specific metrics to `src/app/api/analytics/route.ts`:

```typescript
// Add near the top of the GET handler
const irisEvents = await db
  .select()
  .from(irisEventTable)
  .where(
    and(
      gte(irisEventTable.createdAt, new Date(from)),
      lte(irisEventTable.createdAt, new Date(to))
    )
  );

const irisMetrics = {
  totalSessions: await db.select().from(chatSessions).where(...),
  questionsSkipped: irisEvents.filter(e => e.event === 'question_skipped').length,
  urgencyDetected: irisEvents.filter(e => e.event === 'urgency_detected').length,
  avgTimePerSession: calculateAvg(sessions.map(s => s.updatedAt - s.createdAt)),
  averageConfidence: calculateAvg(drafts.map(d => d.confidence?.score || 0)),
  staffFeedbackScore: calculateAvg(feedbackRecords.map(f => f.irisHelpfulness))
};

// Return in response
return Response.json({
  ...existing,
  irisMetrics,
  ...
});
```

---

## Implementation Checklist

### Day 1:
- [ ] Create `irisEvents` table, run migration
- [ ] Add `logIrisEvent()` helper function
- [ ] Instrument member_lookup_skipped events
- [ ] Test logging with one conversation

### Day 2:
- [ ] Add confidence calculation function
- [ ] Update iris-chat.tsx to display confidence
- [ ] Test with multiple conversations

### Day 3:
- [ ] Create `staffFeedback` table
- [ ] Build feedback modal component
- [ ] Create feedback API route
- [ ] Integrate into approval flow

### Day 4:
- [ ] Update analytics endpoint with iris metrics
- [ ] Build dashboard view for IRIS metrics
- [ ] Test full flow end-to-end

---

## Testing the System

```bash
# 1. Run a test conversation through IRIS
# 2. Monitor logs: should see events logged in irisEvents table
# 3. Check analytics endpoint: /api/analytics?range=7
# 4. Verify confidence scoring shows on draft
# 5. Submit feedback after approval, verify in DB
```

**SQL Queries to Verify:**

```sql
-- Check events logged
SELECT event, COUNT(*), AVG(savedSeconds) 
FROM iris_events 
GROUP BY event;

-- Check feedback
SELECT iris_helpfulness, COUNT(*) 
FROM staff_feedback 
GROUP BY iris_helpfulness;

-- Confidence trend
SELECT 
  DATE(created_at) as date,
  AVG((draft->>'confidence')::float) as avg_confidence
FROM chat_sessions
GROUP BY DATE(created_at);
```

---

## What This Gives You

✅ **Proof:** Data showing improvements are working  
✅ **Visibility:** Staff see how confident IRIS is  
✅ **Feedback Loop:** Real staff input on quality  
✅ **Dashboards:** Track trends over time  
✅ **A/B Test Ready:** Compare old vs new approaches scientifically  

Start with Week 1 items, then use data to drive Week 2+ priorities.
