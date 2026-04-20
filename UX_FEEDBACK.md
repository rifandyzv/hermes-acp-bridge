Yes — your concern is valid.

What I see now is **high information density but low decision value**. For a sales user, that creates three bad outcomes:

1. **Cognitive fatigue**
   The screen looks “busy,” so users must scan a lot before finding what matters.

2. **Loss of trust in AI output**
   If Action Cards and Activities keep showing generic advice, users will quickly treat the whole AI layer as noise.

3. **Poor task orientation**
   The page currently feels like it is showing “everything the system knows” instead of “what the rep should do next.”

For a BD pipeline page, that is the core UX problem:
**salespeople do not want more content — they want clearer next actions, cleaner context, and faster updates.**

## My diagnosis

### 1. Activities and Action Cards overlap too much

From your screenshots:

* **Activities** already contains the meeting/call/note history
* **Action Cards** repeats recommendations derived from those activities
* But the recommendations are generic:

  * “Follow up on key discussion points”
  * “Schedule next meeting with decision makers”

These are not wrong, but they are too universal. They do not justify their visual weight.

So yes, this is redundant.

### 2. The screen hierarchy is upside down

The UI gives a lot of space to:

* generic AI blocks
* big cards
* broad sections like MEDDIC gaps / stakeholder strategy / agenda / risk flags

But not enough emphasis on:

* account health
* current stage
* last interaction
* real blocker
* next best action
* owner and due date

So the layout is visually rich, but operationally weak.

### 3. “Useful information” is not distinguished from “AI filler”

This is dangerous.

A sales page should separate:

* **facts**: meeting happened, stage, date, champion, value, next step
* **AI inference**: likely risk, missing stakeholder, suggested follow-up
* **AI fluff**: generic sales coaching text

Right now those are blended together.

That makes users feel like:

> “Why am I reading all this? What should I actually do?”

## What happens when users see useless info all over the screen?

Usually these things happen fast:

* they stop reading the AI area entirely
* they only use the page for manual logging
* the product starts feeling “heavy”
* perceived intelligence drops, even if the backend is good
* the team says “the AI is nice demo material, but not useful in daily work”

So yes, overexposed low-value content is worse than having less content.

A good agentic sales UX should make the user feel:

> “This page saves me time.”

Not:

> “This page wants my attention.”

---

# Recommended UX revamp direction

## Principle: move from **content-heavy CRM** to **action-oriented workspace**

The page should answer only 4 questions:

1. **What is this account’s current state?**
2. **What changed recently?**
3. **What should I do next?**
4. **What evidence supports that recommendation?**

If a section does not support one of those, demote it or hide it.

---

# Proposed new information architecture

## 1. Account Overview as the top focus

Instead of a large entry form and large AI sections, make the top section a compact summary bar:

* Account name
* Industry
* Stage
* Deal value
* Probability
* Champion
* Economic buyer
* Last activity date
* Next step date
* AI health/risk score

This should be the “control center.”

### Why

Sales users need a fast snapshot first, not long-form content.

---

## 2. Replace current Action Cards with “Next Best Actions”

This is the biggest change I’d make.

Instead of a full page called **Action Cards**, show only **3 prioritized actions max** for the account.

Each action should have:

* action title
* why this matters
* evidence from recent activity
* owner
* due date
* one-click action

Example:

**Secure procurement timeline**
Why: Decision process is still unclear after 2 meetings
Evidence: No procurement owner mentioned in last call notes
CTA: Create follow-up email / Add question to next meeting

That is useful.

This is much better than:

* “Follow up on key discussion points”

Because it is specific, contextual, and defensible.

### Important rule

If the AI cannot generate a specific action, it should show nothing or one short neutral suggestion.
Never fill the screen with generic recommendations.

---

## 3. Turn Activities into a clean timeline

The Activities page should be a lightweight timeline, not a semi-analysis page.

Each activity item should show:

* type: meeting / call / email / note
* date and owner
* short summary
* AI badges only when meaningful:

  * risk detected
  * stakeholder added
  * next step extracted
  * objection found

Then allow expansion for:

* raw notes / transcript summary
* extracted entities
* linked follow-up tasks

### Remove

* giant generic analysis blocks directly inside every activity card
* repeated strategy text
* always-on MEDDIC cards inside the activity stream

### Why

Activities should answer:

> “What happened?”

Not:

> “Let me show a full AI account review every time.”

---

## 4. Create a separate “Insights” panel instead of spreading AI everywhere

Instead of embedding large AI content into Activities and Action Cards, add one **Insights** area with concise modules:

* Risks
* Gaps
* Stakeholders
* Buying signals
* Objections
* Next meeting prep

This can live as:

* a right-side panel on desktop, or
* a separate tab

Each item should be short and collapsible.

### Good example

**Risk: No decision process identified**
Impact: Medium
Source: Last 2 activities
Recommendation: Confirm procurement steps in next meeting

### Bad example

A big visual card with vague text like:

* “Map the formal procurement process”

The second is not useless, but it is too generic unless backed by source context.

---

# What to remove or demote

## Remove as always-visible content

These should not dominate the screen by default:

* MEDDIC gaps as big cards
* stakeholder strategy as a large block
* long next meeting agenda block
* generic risk flags
* long descriptive subtitles under every action

These can exist, but only as:

* expandable details
* hover/tooltips
* secondary panel
* generated on demand

## Why

Your current UI spends too much screen area explaining instead of enabling action.

---

# Specific redesign suggestions by page

## A. Accounts page

Current issue:

* the “new account” form is large and visually dominant
* the account table feels secondary

Suggested redesign:

* hide account creation in a modal or drawer by default
* make the account list primary
* add useful columns:

  * account
  * stage
  * deal value
  * owner
  * last activity
  * next action
  * risk
* allow quick add with minimal required fields only

### Better default fields

At creation time, I would only require:

* company name
* stage
* owner
* expected value optional
* next step optional

Everything else can be enriched later.

Because requiring too much upfront hurts adoption.

---

## B. Activities page

Current issue:

* AI-generated content dominates each activity
* high vertical space usage
* repetitive content

Suggested redesign:
Each activity card should look like this:

**Meeting · Pertamina · 20 Apr**
One-line summary
Detected: 1 risk, 1 action, 1 stakeholder
Buttons: View notes | Create follow-up | Add task

Expanded view:

* summary
* extracted actions
* extracted stakeholders
* linked emails/tasks

### This makes activity cards:

* scannable
* actionable
* less tiring

---

## C. Action Cards page

Current issue:

* the whole page is large but low signal
* content is generic
* much of it duplicates Activities

Suggested redesign:
Rename **Action Cards** to **Account Plan** or **Next Actions**

Structure:

### Top

* 3 prioritized actions

### Below

* blockers
* missing info
* stakeholder map
* suggested next meeting goals

Everything concise.
No giant prose sections unless user clicks expand.

---

# UX writing guidance for the AI layer

This is very important for trust.

## Avoid language like:

* Follow up on key discussion points
* Keep the deal moving forward
* Maintain momentum
* Differentiate on unique value proposition

These sound polished, but they are weak.

## Prefer language like:

* Ask who owns procurement approval
* Confirm target go-live quarter
* Send ROI comparison requested by champion
* Identify security reviewer before technical workshop

That feels real.

## Rule

Every AI recommendation should pass this test:

> Can a rep execute this without guessing?

If not, it is too vague.

---

# A better content model for AI outputs

For each AI suggestion, structure it as:

* **What to do**
* **Why now**
* **Evidence**
* **Confidence**
* **CTA**

Example:

**What to do:** Confirm implementation timeline
**Why now:** Buyer asked about deployment readiness in last meeting
**Evidence:** “Discuss implementation timeline” appeared in notes
**Confidence:** Medium
**CTA:** Add to follow-up email

This is much more useful than today’s presentation.

---

# Visual design recommendations

Your dark theme is actually nice. The issue is not the theme — it is the density and content prioritization.

## Improve with:

* smaller number of large cards
* more whitespace between decision zones
* collapsible sections
* stronger distinction between:

  * factual data
  * AI inference
  * editable user inputs
* tighter vertical rhythm

## Specific visual changes

* reduce section count visible at once
* use compact cards for insights
* use badges sparingly
* keep only 1 primary CTA per area
* make secondary text lighter and shorter
* show confidence labels only when meaningful

---

# Best-practice target experience

A rep opens an account and in 5 seconds can see:

**Pertamina**
Prospecting · Medium risk · Last touched 2 days ago
Next action: Confirm procurement process by Friday

Then below:

* Last activity summary
* 2 concrete AI suggestions
* 2 known risks
* 1 missing stakeholder
* button to log activity

That is enough.

---

# My recommended final structure

## Tab 1: Overview

* account summary
* next best actions
* risks/gaps
* recent activity preview

## Tab 2: Activity Timeline

* chronological feed
* compact cards
* expandable details

## Tab 3: Account Plan

* next actions
* stakeholder map
* MEDDIC status
* meeting prep

## Optional right-side panel

* AI insights
* hidden by default or collapsible

---

# Priority fixes in order

## Phase 1: Fast wins

* remove redundant large AI blocks from Activities
* reduce Action Cards to top 3 actions only
* make AI text more specific and evidence-based
* hide long sections under expand/collapse
* make account summary more prominent

## Phase 2: Structural improvement

* merge overlapping concepts between Activities and Action Cards
* separate facts vs AI insights
* redesign account table for faster scanning
* improve activity logging flow

## Phase 3: Smarter AI UX

* only show AI content with high confidence
* explain recommendations with evidence
* let users dismiss bad suggestions
* learn from user actions over time

---

# My honest take

Right now, the product feels like it is trying to **prove the AI is working** rather than **help the salesperson work**.

That is why it feels complex.

The revamp should aim for:

* less visible AI
* better AI
* more task focus
* more evidence
* smaller and sharper content blocks

That would make the platform feel much more premium and actually useful.

If you want, I can turn this into a **full UX revamp proposal** with:

* proposed wireframe structure for each tab
* exact section layout
* sample microcopy
* and a before/after redesign spec for your product team.
