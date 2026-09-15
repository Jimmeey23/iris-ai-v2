# IRIS Enhancement Roadmap — Strategic Next Steps

## Current State ✅
You've just implemented **Phase 1: Intelligent Conversational Logic**
- Context-aware question selection (skips redundant questions)
- Urgency detection with strategic response ordering
- Smart member lookup that infers from reporter type
- AI prompts enhanced to synthesize context

**Result:** IRIS now feels like a smart colleague, not a form bot.

---

## Strategic Priorities (Ranked by Impact × Effort)

### 🔴 **TIER 1: Measurement & Validation (Week 1-2)**
*Validate the improvements are actually helping. Can't optimize what you don't measure.*

**1.1 IRIS Conversation Analytics**
- Add `irisMetrics` table tracking:
  - Questions asked per conversation (detect inflation)
  - Redundancy rate (how often is a question skipped via context detection?)
  - Urgency signals detected per category
  - Time to complete conversation
  - Draft quality score (fewer edits = better IRIS output)
- New analytics dashboard showing:
  - **Question Effectiveness Score** — Which questions are most useful vs just form-filling?
  - **Redundancy Reduction** — % of questions saved via context detection
  - **Staff Satisfaction** — Quick poll after each conversation
  - **Time Saved** — Minutes spent logging per ticket (compare IRIS vs manual)

**Why:** You need proof that your improvements are working. Right now you have no metrics on whether IRIS is actually asking better questions.

**Quick Win:** Add event logging to `runIris()` to track:
```typescript
// Track when we skip questions due to context
analytics.log('question_skipped', {category, reason: 'context_known', savedSeconds: 10})
// Track urgency detection
analytics.log('urgency_detected', {category, urgencyLevel, resolutionTime})
```

---

**1.2 A/B Test the New Prompts**
- Run parallel IRIS instances:
  - **Group A:** New smart prompts (current)
  - **Group B:** Old generic prompts (baseline)
- Measure over 50 conversations:
  - Staff satisfaction (1-5 rating)
  - Number of edits to draft
  - Time per conversation
  - Escalation rate
- **Target:** Demonstrate 15-20% improvement in at least one metric

---

### 🟠 **TIER 2: UX Polish & Refinement (Week 2-3)**
*Make the interface feel as smart as the logic.*

**2.1 Draft Preview & Confidence Scoring**
- Add confidence metric to generated drafts:
  - Show IRIS's "certainty" on the ticket classification
  - Highlight guesses vs confirmed facts
  - Suggest clarifying questions if confidence < 80%
  ```
  ⚠️ 73% confident this is "Class Experience → Technical Issue"
  
  Staff observed: mic failure
  Affected: single class
  Impact: moderate
  
  Consider asking: "Will this affect your evening session too?"
  ```
- **Why:** Reduces post-generation edits by 40%+, feels more intelligent

**2.2 Context Sidebar**
- Show "what IRIS knows" in real-time:
  ```
  📍 Studio: Santa Monica
  👤 Reporter: I observed
  ⚠️ Urgency: Blocking now
  🏷️ Category: Facility issue (inferred)
  ✅ Confirmed: Incident time, Impact level
  ❓ Missing: Specific equipment, Preferred resolution
  ```
- Staff can see exactly what IRIS is tracking
- Reduces "did it capture that?" anxiety

**2.3 Voice Input Smarts**
- Transcribe → Extract entities → Clarify with IRIS before moving forward
  ```
  [Staff speaks] "The internet was down for like 10 minutes this morning 
  and a member couldn't log into a class"
  
  [IRIS] Transcribed: "internet down, 10 min, member couldn't log in"
  
  [IRIS] I'm reading this as:
  □ Tech/Systems issue affecting class access
  □ About 10 mins duration (earliest: 6:00-7:00am)
  □ One member impacted
  
  Correct? [Yes] [Nope, fix it]
  ```
- **Why:** Voice errors compound into bad tickets. Pre-flight check saves time.

---

### 🟡 **TIER 3: Intelligence Expansion (Week 3-4)**
*Make IRIS learn and predict.*

**3.1 Historical Pattern Recognition**
- When IRIS sees a category/subcategory, show:
  - "Similar issues (last 30 days)"
  - How they were resolved
  - Average resolution time
  - If they're escalating or being handled in studio

  ```
  [IRIS] Tech issue in a class, got it.
  
  📊 Last 30 days: 8 similar issues
  • 5 resolved by Trainer team (avg 2h)
  • 2 escalated to IT (avg 6h)  
  • 1 prevented by class transfer
  
  Does this feel similar? Yes / No / Not sure
  ```
- **Why:** Patterns help IRIS ask predictively ("Will you need a makeup credit?")

**3.2 Member Context Enrichment**
- When member is found in Momence, pull:
  - Membership type (affects resolutions)
  - Class frequency (is this a regular issue for them?)
  - Prior tickets
  - Preferences (how they like to be contacted)
  
  ```
  [IRIS finds] Sarah Chen
  → Premium member, 4 classes/week
  → 3 tickets in last 6 months (tech issues)
  → Prefers WhatsApp follow-ups
  ```

**3.3 Dynamic Question Paths (Branching)**
- Today: Linear → Category → Subcategory → Fixed questions
- Tomorrow: Branch based on detected patterns
  ```
  If (category == "Class Experience" AND urgency == "blocking") {
    → Ask: "Can we offer a makeup credit + investigation?"
    → Skip: "Has this affected other members?"
  }
  If (category == "Trainer Feedback" AND sentiment == "positive") {
    → Auto-close as compliment
    → Ask: "Should we recognize this trainer?"
  }
  ```

---

### 🟢 **TIER 4: Integration Deepening (Week 4+)**
*Connect IRIS to the full ecosystem.*

**4.1 Auto-Escalation & Workflows**
- Critical tickets auto-escalate to manager Slack channel
- Safety/immediate danger → SMS alert to studio manager
- Blocking issues → Auto-create task for ops team
  ```typescript
  if (detectUrgency(c) && c.impact == "Could not proceed") {
    await escalateToSlack(c);
    await createFollowUpTask({assignee: 'ops', priority: 'urgent'})
  }
  ```

**4.2 Bias & Fairness Monitoring**
- Track if IRIS is treating certain members differently
- Alert on: 
  - Longer resolution times for certain demographics
  - Different follow-up strategies
  - Escalation bias

**4.3 Member Proactive Alerts**
- Use ticket patterns to predict issues:
  - "Trainer X is getting 3× more 'late start' complaints" 
  - "Tech issues spike on Mondays 6-8am"
  - "This member's issues are never resolved satisfactorily"

---

## Implementation Priority Matrix

| Task | Impact | Effort | Week | Owner |
|------|--------|--------|------|-------|
| 1.1 IRIS conversation analytics | ⭐⭐⭐⭐⭐ | 🔧 Low | W1-2 | Backend |
| 1.2 A/B test new prompts | ⭐⭐⭐⭐ | 🔧 Low | W2-4 | Data/Product |
| 2.1 Draft confidence scoring | ⭐⭐⭐⭐ | 🔧 Medium | W2-3 | Frontend/AI |
| 2.2 Context sidebar | ⭐⭐⭐ | 🔧 Low | W2 | Frontend |
| 2.3 Voice input clarification | ⭐⭐⭐ | 🔧 Medium | W3 | Frontend/AI |
| 3.1 Historical pattern recognition | ⭐⭐⭐⭐ | 🔧🔧 Medium-High | W3-4 | Backend/AI |
| 3.2 Member context enrichment | ⭐⭐⭐ | 🔧 Medium | W3 | Backend |
| 3.3 Dynamic branching paths | ⭐⭐⭐⭐ | 🔧🔧 High | W4+ | AI/Backend |
| 4.1 Auto-escalation workflows | ⭐⭐⭐⭐ | 🔧 Medium | W4+ | Backend |

---

## Quick Wins (Do This Week)

### 1. **Event Logging for Metrics** (2 hours)
Add to `runIris()`:
```typescript
// When question is skipped due to context
if (skipped) {
  await db.insert(irisEvents).values({
    sessionId: input.sessionId,
    event: 'question_skipped',
    reason: 'context_already_known',
    fieldKey,
    savedSeconds: estimateTimeToAnswer(fieldKey),
    category: c.category,
    createdAt: new Date()
  });
}

// When urgency is detected
if (detectUrgency(c)) {
  await db.insert(irisEvents).values({
    sessionId: input.sessionId,
    event: 'urgency_detected',
    urgencyLevel: getUrgencyLevel(c),
    resolutionTime: estimateResolutionTime(c),
    category: c.category
  });
}
```

### 2. **Confidence Scoring on Draft** (3 hours)
```typescript
function calculateDraftConfidence(collected: Record<string,unknown>): number {
  const required = ['category','subcategory','memberLookupDone','studio','incidentAt','impact'];
  const confirmed = required.filter(k => collected[k] && 
    !String(collected[k]).includes('inferred'));
  
  return Math.round((confirmed.length / required.length) * 100);
}

// Add to draft response:
draft.confidence = calculateDraftConfidence(c);
draft.uncertainFields = findGuesses(c);
```

### 3. **Staff Satisfaction Poll** (1 hour)
Quick post-approval modal:
```
"How helpful was Iris for this ticket?"
[😞 Frustrating] [😐 Okay] [😊 Helpful] [😍 Excellent]

[Optional] "What could be better?"
```
Log to DB, show trends in dashboard.

---

## Success Metrics (2-Week Goals)

After implementing Tier 1:
- ✅ **Conversation time reduced by 15%** (from 3min → 2.5min)
- ✅ **Draft edits reduced by 20%** (fewer clarifications needed)
- ✅ **Question redundancy < 5%** (context detection working)
- ✅ **Staff satisfaction > 4/5** (on quick poll)
- ✅ **Urgency detection accuracy > 85%** (validate against SLA breaches)

---

## Architecture Additions Needed

### New Database Table: `irisEvents`
```sql
CREATE TABLE iris_events (
  id SERIAL PRIMARY KEY,
  sessionId TEXT NOT NULL,
  event VARCHAR(50) NOT NULL, -- 'question_skipped', 'urgency_detected', 'context_inference'
  reason TEXT, -- Why was the question skipped?
  fieldKey TEXT, -- Which field?
  category TEXT,
  urgencyLevel VARCHAR(20), -- 'blocking', 'safety', 'normal'
  savedSeconds INT,
  metadata JSONB DEFAULT '{}',
  createdAt TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (sessionId) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE INDEX iris_events_session_idx ON iris_events(sessionId);
CREATE INDEX iris_events_event_idx ON iris_events(event, createdAt);
```

### Update Analytics Endpoint
- Add `/api/analytics/iris` returning:
  - Questions asked per conversation
  - Questions skipped per category
  - Urgency detection accuracy
  - Average conversation duration
  - Draft quality metrics

---

## Long-Term Vision (Month 2+)

1. **IRIS learns your studio's patterns** — Different workflows per location
2. **Predictive problem detection** — "This will cause a refund request" → escalate early
3. **Multi-turn intelligence** — Remembers past issues, asks smarter follow-ups
4. **Trainer/Staff profiles** — Knows who likes detailed tickets vs high-level summaries
5. **Outcome feedback loop** — "You marked this critical, but it was resolved in 30 min" → calibrate

---

## Recommended 30-Day Sprint Plan

**Week 1:** Measurement & Analytics
- Event logging infrastructure
- Confidence scoring on drafts
- Analytics dashboard updates

**Week 2:** UX Polish  
- Context sidebar
- Staff satisfaction polls
- Voice transcription pre-flight checks

**Week 3:** Intelligence Expansion
- Historical pattern recognition
- Member context enrichment
- A/B test results analysis

**Week 4:** Integration & Workflows
- Auto-escalation logic
- Slack integration for critical tickets
- Workflow automation

---

## Key Principle
**Measure → Iterate → Measure → Improve**

Don't build the next feature until you have data showing:
1. The current feature is working
2. Staff are actually using it better
3. Tickets are genuinely improved

Let me know which tier/task you'd like to tackle first, and I can help implement it.
