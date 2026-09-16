# IRIS Advanced Feature Strategy
**Time Horizon:** Next 6-8 Weeks (2 Strategic Phases)  
**Context:** Post-Phase 4 ChatGPT-level conversationality completed; measuring impact now.

---

## Executive Summary

**Thesis:** Your IRIS agent is now conversational, but **the real value unlock happens AFTER the ticket is filed** — through smart routing, resolution closure, and organizational learning. The next bet is to **turn IRIS from a ticket-creation tool into an intelligent incident management platform** that routes urgent issues to the right person, predicts what'll actually solve the problem, and learns patterns across your studio network.

**Highest-ROI focus: Tickets that impact multiple members or repeat across studios.** A WiFi outage isn't really one ticket — it's a systemic issue affecting dozens of classes and members. That intelligence is worth more than any single ticket's conversational quality.

---

## Strategic Bets (Ranked by Impact × Effort)

### 🔴 **BET 1: Smart Escalation & Intelligent Routing (HIGH IMPACT)**
**Confidence:** Very High | **Investment:** 3-4 weeks | **Team:** 2 engineers, 1 PM

**Hypothesis:** By automatically routing urgent tickets to the right person (trainer, studio manager, facilities) and surfacing escalation flags in real-time, response times drop 60%, staff frustration drops, and critical issues never get buried.

**What It Does:**
```
Ticket filed: "WiFi dropped during evening power class"
                ↓
IRIS performs triage:
  • Urgency: BLOCKING (impacts live class)
  • Affected: ~18 members (power class roster)
  • Category: Tech/Network
  • Auto-assign: Studio Manager + IT Lead
  • Create escalation alert
  • Notify: Trainer (via SMS/push), Studio Manager (dashboard)
                ↓
Dashboard: "ACTIVE INCIDENT - WiFi DOWN - Assigned to you"
             [Accept] [Reassign] [Resolve] [Need Help]
```

**Building Blocks:**
1. **Urgency Scoring Engine** (3 days)
   - Expand current urgency detection → formal score (1-10)
   - Inputs: Category + subcategory, impact level, affected members, historical patterns
   - Outputs: Score + suggested priority + recommended assignee
   
2. **Smart Assignment Rules** (3 days)
   - If Safety → Studio Manager + Owner
   - If Tech → IT Lead (if exists) + Facilities
   - If Class Experience → Trainer + Studio Manager
   - If Trainer Feedback → Studio Manager
   - Override: Allow manual reassignment with 1-click

3. **Real-Time Escalation Dashboard** (5 days)
   - Live view: "Active Incidents" (blocking + safety only)
   - Sort by: Urgency, time since filed, affected members, assignee
   - Actions: Accept, note progress, mark resolved, escalate further
   
4. **Notification System** (2 days)
   - Push to mobile app (or email + SMS for urgent)
   - Summary: "WiFi incident affecting 18 members - assigned to you"
   - Link directly to ticket details

**Why This First:**
- Multiplies the value of your ChatGPT-like conversationality (good tickets, smart routing)
- Immediate, measurable impact on studio operations (response time metrics)
- Prerequisite for all downstream bets (resolution tracking, pattern detection)
- Your studios are probably losing hours per week on misdirected tickets

**Success Metrics:**
- Time-to-first-response: < 5 minutes for urgent tickets (vs. current unknown)
- Ticket escalation rate: Stays < 10% (indicates good initial categorization)
- Staff satisfaction: "I know immediately what needs my attention" (qualitative)

---

### 🟠 **BET 2: Resolution Closure & Follow-Up Workflow (HIGH IMPACT)**
**Confidence:** High | **Investment:** 2-3 weeks | **Team:** 1-2 engineers

**Hypothesis:** Right now, tickets are filed but nobody knows if they're actually *resolved*. Adding a "close" workflow (was it fixed? do we need follow-up? any workarounds?) creates accountability, prevents duplicate tickets, and gives you historical data on what actually works.

**What It Does:**
```
Initial Ticket: "Projector in Studio A keeps flickering"
Filed, assigned to: Facilities Lead
                ↓ [Facilities Lead marks as "In Progress"]
                ↓
[After 2 hours - Facilities Lead resolves ticket]
                ↓
IRIS Follow-up: "Projector issue in Studio A — was it fixed?
  ✓ Fixed (resolved)
  ⚠️ Temporarily workaround (needs escalation)
  ❌ Still broken (needs different approach)
  ℹ️ Different issue (file new ticket)"
                ↓ [Staff selects: "Workaround - rotate projector"]
                ↓
IRIS Records: Workaround applied, scheduled follow-up for next week
Dashboard shows: "Projector flickering - workaround. Monitor."
                ↓ [Next week - IRIS reminds: "Did the projector stay stable?"]
```

**Building Blocks:**
1. **Ticket Status Workflow** (2 days)
   - New → In Progress → Resolved/Closed
   - Add resolution reason: Fixed, Workaround, Escalated, Duplicate, Can't Reproduce
   - Add resolution notes (what did we do?)

2. **Resolution Follow-Up** (2 days)
   - After marked "Resolved": Send 24h/1week follow-up
   - "Did this stay fixed?" → Yes/No/Different Issue
   - Capture workaround vs. permanent fix

3. **Historical Resolution Database** (1 day)
   - Query: "WiFi issues - what's worked before?"
   - Show: 70% resolved by router restart, 20% by ISP ticket, 10% still pending
   - IRIS suggests: "Last time: restart router fixed it in 5 mins"

**Why This Second:**
- Depends on Bet 1 (assigned tickets are trackable)
- Turns one-time tickets into a learning system
- Enables Bet 3 (pattern detection) downstream
- Closes the loop staff care about: "Did this actually work?"

**Success Metrics:**
- Closure rate: >90% of tickets marked resolved within 48h
- Repeat ticket rate: Drops by 40% (same issue filed multiple times)
- Resolution confidence: "I know what we tried before" (staff feedback)

---

### 🟡 **BET 3: Systemic Issue Detection & Pattern Learning (HIGH IMPACT)**
**Confidence:** High | **Investment:** 2-3 weeks | **Team:** 1 engineer (data/analytics focus)

**Hypothesis:** Most "one-off" incidents are actually systemic patterns. If WiFi fails in Studio A once, you note it. If it fails 5 times in 2 weeks across 3 studios, that's an ISP contract negotiation or network upgrade decision. Surfacing these patterns to studio managers drives strategic operational decisions.

**What It Does:**
```
3 WiFi tickets filed in past 14 days:
  • Studio A - Mon 10am
  • Studio B - Thu 3pm
  • Studio A - Sat 6pm

IRIS Dashboard Alert:
  "⚠️ PATTERN: WiFi drops correlate with peak usage hours"
  "Affected: 45+ members across 2 studios"
  "Recommendation: ISP upgrade or QoS configuration"
  
  [View Details] [Create Action Item] [Escalate to Owner]
```

**Building Blocks:**
1. **Incident Aggregation** (2 days)
   - Group tickets by root cause (not just category)
   - Detect: Same issue, different studios? Multiple reports in short window?
   - Cluster by: Category + keyword + location + timeframe

2. **Pattern Recognition Dashboard** (3 days)
   - Show: "Top issues this week", "Issues on the rise", "Resolved" filters
   - Metrics: "WiFi: 3 incidents, 45 members affected, trend: ↑ up"
   - Heatmap: Which studios, which times of day, which staff?

3. **Predictive Pattern Alerts** (2 days)
   - "3rd occurrence of this type → flag as systemic"
   - Suggest: "This looks like the same root cause as last month"
   - Recommend: "Last time we did X and it prevented future occurrences"

**Why This Third:**
- Depends on Bet 1 + 2 (good routing + resolution data)
- Unlocks studio manager workflows (ops planning)
- Natural foundation for predictive scoring later

**Success Metrics:**
- Pattern detection accuracy: >85% (staff agrees with groupings)
- Action on patterns: 60%+ of identified systemic issues lead to follow-up action
- Incident reduction: Systemic issues that get action drop repeat rate by 50%+

---

### 💚 **BET 4: Predictive Triage & Smart Suggestions (MEDIUM IMPACT)**
**Confidence:** High | **Investment:** 3-4 weeks | **Team:** 1 engineer + 1 PM

**Hypothesis:** By week 2 of Bets 1-3, you'll have 500+ resolved tickets with clean categorization, assignee tracking, and resolution data. A lightweight ML model can predict category/urgency/best-next-action with 80%+ accuracy, reducing staff decision-making burden.

**What It Does:**
```
Staff speaks: "The water fountain by the locker room is leaking"

IRIS (mid-conversation):
  🤖 I'm thinking this is: Maintenance → Plumbing (87% confidence)
     Should go to: Facilities Manager
     Urgency: Medium (not safety, but affects member experience)
     
  Does that sound right? 
  [✓ Yes] [✗ Different] [? Unsure]
```

**Building Blocks:**
1. **Historical Vectorization** (1 day)
   - Convert 500+ resolved tickets into embeddings (description → category)
   - Train: Naive Bayes + keyword matching on what actually worked

2. **Mid-Conversation Prediction** (2 days)
   - After user describes issue, quietly predict category
   - Show prediction if confidence > 75%
   - Let staff confirm/override

3. **Suggested Actions** (2 days)
   - Show: "Last time this happened, we did X and it resolved in Y minutes"
   - Offer 1-click templates: "Create workaround ticket", "Escalate to vendor"

**Why This Fourth:**
- Requires clean historical data (Bets 1-3)
- Nice-to-have (improves Bet 1 accuracy, but not blocking)
- Gets you toward AI-driven operations, not just AI-assisted ticket entry

**Success Metrics:**
- Prediction accuracy: >80% on category
- Acceptance rate: >70% of staff accept predicted categories without override
- Time saved: Conversations 10-15% faster when prediction offered

---

## Strategic Sequencing

```
PHASE 1 (Weeks 1-3): Build Bet 1 + Start Measuring
├─ Week 1: Smart Scoring + Assignment Rules
├─ Week 2: Dashboard + Notifications
├─ Week 3: Measure impact (response time, staff feedback)
└─ Parallel: Event logging from roadmap (Tier 1)

PHASE 2 (Weeks 4-6): Bet 2 + Bet 3 (closure + patterns)
├─ Week 4: Resolution workflow (status + follow-ups)
├─ Week 5: Pattern detection dashboard
├─ Week 6: Validation + iterate on prediction accuracy

OPTIONAL Phase 3 (Weeks 7-8): Bet 4 (predictive triage)
├─ Only if Pattern data is clean
├─ Only if studio managers confirm systemic issues are valuable
└─ Builds on 500+ resolved tickets from Phase 2
```

---

## NOT Doing (& Why)

### ❌ Integration Automation (e.g., "auto-create Momence task when ticket filed")
- **Reason:** Without routing (Bet 1), automations route tickets to the wrong person
- **Opportunity Cost:** ∼$20K in ops time wasted on wrong assignments (educated guess)
- **Revisit When:** After Bet 1 is live and routing is 90%+ accurate

### ❌ Predictive Triage (Bet 4) in Phase 1
- **Reason:** You don't have 500+ clean historical examples yet
- **Opportunity Cost:** Prediction will be 60% accurate (not better than staff + IRIS already)
- **Revisit When:** Phase 2 complete with clean resolution data

### ❌ Member-Facing Features (e.g., "members can report issues")
- **Reason:** First optimize internal staff workflow; external features add complexity
- **Opportunity Cost:** Not high (low member demand probably)
- **Revisit When:** Internal system is humming, staff has capacity

### ❌ Advanced Analytics (e.g., "trainer performance scorecards")
- **Reason:** Too soon; need operational data first
- **Opportunity Cost:** Trainer metrics are valuable but not urgent (no revenue impact yet)
- **Revisit When:** You have 2-3 months of routing + resolution data

---

## Resource Plan

| Phase | Role | Week 1-3 | Week 4-6 | Capacity Check |
|-------|------|----------|----------|---|
| **Engineering** | Full-stack | Scoring engine (1.5w) + Dashboard (1w) + Notification (0.5w) | Status workflow (1w) + Patterns (1.5w) + Follow-ups (0.5w) | **2 engineers × 3 weeks = 6 person-weeks** |
| **PM/Design** | Product | Spec + flows | Metrics validation | **1 person × 6 weeks = 6 person-weeks** |
| **QA** | Testing | Spot-check assignments | End-to-end flows | **Ad-hoc, not full-time** |

**Total investment:** ~2 full-time engineers + 1 PM for 6 weeks

---

## Strategic Tensions & Trade-offs

### Tension 1: Speed vs. Accuracy in Routing
- **Conflict:** Auto-route immediately (speed) vs. wait for IRIS to gather context (accuracy)
- **Resolution:** Route based on category confidence > 75%, flag low-confidence tickets for manual triage
- **Consequence:** Some tickets routed suboptimally, but 80%+ are right; staff can reassign in 10 seconds

### Tension 2: Simplicity vs. Customization
- **Conflict:** Fixed routing rules (simple) vs. per-studio rules (flexible)
- **Resolution:** Start with defaults (Safety → Manager, Tech → IT). Support overrides but no per-studio config in Phase 1
- **Consequence:** Studio A might want different rules; address in Phase 3

### Tension 3: Building vs. Measuring
- **Conflict:** Launch Bet 1 ASAP (get routing live) vs. Measure first (prove IRIS improvements with analytics)
- **Resolution:** Run event logging in parallel with Bet 1; ship Bet 1 by end of Week 3
- **Consequence:** Slight engineering parallelization cost, but data validation is crucial

---

## Quarterly Gates & Kill Criteria

### End of Phase 1 (Week 3): Routing Go/No-Go
**Gate Criteria:**
- ✓ All urgent tickets routed to intended person within 1 minute
- ✓ Staff satisfaction: >3.5/5 on "routing makes sense" survey
- ✓ <10 "wrong person" reassignments in 50 tickets

**Kill Criteria:**
- ✗ Routing confidence < 70% (too many wrong assignments)
- ✗ Staff adoption < 50% (ignoring notifications)

**If Kill:** Revert to manual triage, revisit routing logic based on feedback

---

### End of Phase 2 (Week 6): Patterns Validation
**Gate Criteria:**
- ✓ 80%+ closure rate on resolved tickets
- ✓ Repeat ticket rate drops >25% (same issue filed fewer times)
- ✓ Studio managers identify ≥3 systemic issues needing action

**Kill Criteria:**
- ✗ False pattern detection (staff says "this isn't really a pattern")
- ✗ Closure workflow abandoned (<50% staff adoption)

**If Kill:** Simplify to just closure tracking, defer pattern analytics to Q2

---

## Assumption Registry (What Could Break This)

| Assumption | Confidence | Risk |
|-----------|-----------|------|
| Staff will adopt notifications (not too noisy) | Medium | If overloaded with alerts, they'll mute everything |
| 2 engineers can ship Bet 1 in 3 weeks | High | Feasible given modular code |
| Historical data will be clean enough for patterns | Medium-High | Garbage in = garbage out; may need post-processing |
| Routing rules generalize across 6 studios | Medium | Each studio has unique ops; may need customization |
| Escalation/routing reduces response time | High | Reasonable assumption; measure to confirm |

---

## Self-Critique: 3 Genuine Weaknesses

1. **Unclear User Jobs:** You're optimizing for "staff speed" but haven't validated whether studios care most about speed, accuracy, or something else (e.g., follow-up rate). Suggest: Quick user interviews (30 min each × 3 studios) before Week 1 starts.

2. **No Revenue Model Yet:** These features are operational, not revenue-generating. If this is a service you sell to studios, you need tier-based pricing (e.g., "Incident routing" = premium tier). Defer for now, but don't let it become a gotcha later.

3. **Prediction Model Timing:** Bet 4 assumes you'll have clean historical data by Week 6. If tickets are messy, inconsistently categorized, or staff override predictions 50% of the time, prediction accuracy will be poor. Consider: Run a test prediction model by Week 3 to validate feasibility before committing to Bet 4.

---

## Why Not Just Keep Improving IRIS Conversations?

**Good question.** Phase 4 gave IRIS conversational quality; that's a sunk cost (you nailed it). But:
- **The actual bottleneck isn't "how do I ask questions?"** — it's "what happens after the ticket is filed?"
- **Right now:** Ticket filed → Radio silence (nobody knows status, if it's actually fixed, if same issue happening elsewhere)
- **After this strategy:** Ticket filed → Routed → Status tracked → Patterns learned → Next ticket asks smarter questions

IRIS gets *smarter* by learning from tickets you file, not just by asking better questions.

---

## Next Immediate Actions (This Week)

1. **Run User Interviews** (2-3 hours)
   - Ask 3 studio managers: "What's your biggest pain point in ticket handling right now?"
   - Expected answers: Speed, misdirection, not knowing if it's fixed, repeated issues
   - Validate/revise bets based on feedback

2. **Measure Current State** (1 hour)
   - How long does it take to respond to an urgent ticket? (Is it 5 min or 30 min?)
   - What % of tickets are "resolved" vs. "abandoned"? (Requires manual audit if not tracked)
   - How many duplicate tickets per month? (Same issue filed multiple times)
   - These are your baselines for Phase 1 success

3. **Start Building Event Logging** (2-3 hours)
   - Add `irisEvents` table (from IMPLEMENTATION_TACTICS.md)
   - Instrument `runIris()` to log: questions skipped, urgency detected, categories inferred
   - You'll need this for measuring improvement anyway

4. **Decide: Make vs. Buy?** (30 min discussion)
   - Could you buy a ticketing system (Zendesk, Jira Service Desk) instead?
   - Building gives you IRIS uniqueness; buying saves 4 weeks
   - This strategy assumes you want to build (better for your brand)
   - If you want to buy, pivot to Zendesk integration instead

---

## Success Vision (6 Weeks From Now)

**Imagine this:** A safety incident happens in Studio A at 6pm. Staff files ticket in IRIS with voice input. 2 seconds later:
- IRIS routes to Studio Manager + Owner
- Push notifications hit their phones: "Safety incident - immediate attention needed"
- Manager opens dashboard, sees: "Member fell during class, trainer on scene, 3 other members witnessed"
- Manager marks "In Progress", notifies front desk to offer ice/first aid
- 20 minutes later, incident resolved (member okay, just bruised)
- Manager marks "Resolved", follows up 24 hours later
- IRIS learns: "Safety incidents with trainer present resolve faster"
- Owner sees dashboard: "Safety incidents: 1 this month (down from 4 last month after we hired more trainers)"

**That's the product after this strategy.** Not a better form, but a smarter operations layer.

---

## Recommendations Summary

| Priority | Feature | Impact | Effort | Start |
|----------|---------|--------|--------|-------|
| 🔴 **1st** | Smart Escalation & Routing (Bet 1) | Transforms ops | 3-4w | Week 1 |
| 🔴 **1st** | Resolution Closure & Follow-ups (Bet 2) | Closes loop | 2-3w | Week 4 |
| 🟠 **2nd** | Systemic Issue Detection (Bet 3) | Strategic insights | 2-3w | Week 4 |
| 🟡 **3rd** | Predictive Triage (Bet 4) | Nice-to-have | 3-4w | Week 7 (optional) |
| 🟢 **Ongoing** | Event Logging & Analytics (From Roadmap Tier 1) | Measurement | 2-3h | Week 1 (parallel) |

---

## Questions to Validate This Strategy

Before you commit to Bets 1-3, ask your studio managers:

1. **On routing:** "Right now when you file a ticket, do you know who needs to act on it? Or does it get lost?"
2. **On closure:** "After you file a ticket, do you ever follow up to see if it was actually fixed?"
3. **On patterns:** "If the same issue happened 3x this month, would you want a report showing that? What would you do with that info?"

If they answer "yes" to any of these, you've found the job-to-be-done. Build that bet first.
