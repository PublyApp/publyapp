# PublyApp Daily Competitor Radar Template

Date: 2026-06-01
Owner: Manual research agent
Cadence: Daily, 20-35 minutes
Output target: Markdown briefing + JSON findings store

## Purpose

Track competitor movement that can affect PublyApp positioning, roadmap, pricing, onboarding, and marketing copy.

This is intentionally minimal: one daily pass, structured findings, and clear follow-up actions.

## Competitor seed list

Start with these direct and adjacent competitors. Expand only when repeated evidence shows a product is relevant to PublyApp's target market.

- Buffer
- Hootsuite
- Later
- Sprout Social
- SocialBee
- Publer
- Metricool
- Planable
- Loomly
- Agorapulse
- Vista Social
- Zoho Social
- Sendible
- ContentStudio
- Crowdfire
- SocialPilot

## Markdown output format

Use this format for the daily human-readable briefing.

```markdown
# PublyApp Competitor Radar — YYYY-MM-DD

## Executive summary

- Biggest signal:
- Pricing/packaging risk:
- Product/feature risk:
- User pain opportunity:
- Recommended PublyApp follow-up:

## High-priority findings

### 1. Finding title

- Competitor:
- Category: pricing | feature_launch | user_complaint | alternative_page | positioning | partnership | acquisition | policy_change | other
- Source:
- Source URL:
- Published/observed date:
- Confidence: low | medium | high
- Why it matters:
- PublyApp implication:
- Suggested action:

## Pricing and packaging changes

- No meaningful changes found today.

<!-- Or use finding blocks when changes exist. -->

## Feature launches and product updates

- No meaningful launches found today.

## User complaints and market pain

- No meaningful complaints found today.

## “Alternative to” and comparison-page movement

- No meaningful movement found today.

## Search coverage log

- Competitors checked:
- Query groups completed:
- Sources checked:
- Gaps / skipped items:

## Follow-up tasks

- [ ] Task 1
- [ ] Task 2
- [ ] Task 3
```

## JSON schema for stored findings

Store one finding per object. Use stable IDs so duplicates can be merged across days.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://publyapp.local/schemas/competitor-radar-finding.schema.json",
  "title": "PublyAppCompetitorRadarFinding",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "id",
    "observedDate",
    "competitor",
    "category",
    "title",
    "summary",
    "sourceUrl",
    "confidence",
    "publyAppImplication",
    "recommendedAction"
  ],
  "properties": {
    "id": {
      "type": "string",
      "description": "Stable finding ID, e.g. sha256 of competitor + normalized title + sourceUrl."
    },
    "observedDate": {
      "type": "string",
      "format": "date"
    },
    "publishedDate": {
      "type": ["string", "null"],
      "format": "date"
    },
    "competitor": {
      "type": "string"
    },
    "competitorUrl": {
      "type": ["string", "null"],
      "format": "uri"
    },
    "category": {
      "type": "string",
      "enum": [
        "pricing",
        "feature_launch",
        "user_complaint",
        "alternative_page",
        "positioning",
        "partnership",
        "acquisition",
        "policy_change",
        "other"
      ]
    },
    "title": {
      "type": "string",
      "minLength": 5
    },
    "summary": {
      "type": "string",
      "minLength": 20
    },
    "sourceName": {
      "type": ["string", "null"]
    },
    "sourceUrl": {
      "type": "string",
      "format": "uri"
    },
    "sourceType": {
      "type": "string",
      "enum": [
        "official_site",
        "pricing_page",
        "changelog",
        "blog",
        "help_center",
        "review_site",
        "social_post",
        "community_forum",
        "search_result",
        "comparison_page",
        "other"
      ],
      "default": "other"
    },
    "evidenceQuote": {
      "type": ["string", "null"],
      "description": "Short exact quote from the source when available."
    },
    "confidence": {
      "type": "string",
      "enum": ["low", "medium", "high"]
    },
    "severity": {
      "type": "string",
      "enum": ["low", "medium", "high"],
      "default": "medium"
    },
    "publyAppImplication": {
      "type": "string",
      "minLength": 20
    },
    "recommendedAction": {
      "type": "string",
      "minLength": 10
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "uniqueItems": true,
      "default": []
    },
    "dedupeKey": {
      "type": ["string", "null"],
      "description": "Normalized key for merging repeated sightings."
    },
    "rawSearchQuery": {
      "type": ["string", "null"]
    },
    "notes": {
      "type": ["string", "null"]
    }
  }
}
```

## Search query library

Replace `{competitor}` with each competitor from the seed list. Use quoted competitor names when they contain spaces.

### Competitor discovery and broad monitoring

```text
{competitor} social media scheduler
{competitor} social media management platform
{competitor} changelog
{competitor} product updates
{competitor} blog new feature
{competitor} release notes
site:{competitor-domain} pricing OR changelog OR "new feature"
```

### Pricing changes

```text
{competitor} pricing
{competitor} pricing change
{competitor} new pricing
{competitor} plan limits
{competitor} free plan limits
{competitor} price increase
{competitor} billing changes
site:{competitor-domain}/pricing
site:{competitor-domain} "pricing" "per month"
site:{competitor-domain} "free plan" OR "trial"
```

### Feature launches

```text
{competitor} "new feature"
{competitor} "launched"
{competitor} "AI" "social media"
{competitor} "content calendar"
{competitor} "approval workflow"
{competitor} "analytics"
{competitor} "Instagram" "TikTok" "LinkedIn"
{competitor} "team collaboration"
{competitor} "bulk scheduling"
{competitor} "best time to post"
```

### User complaints and pain signals

```text
{competitor} reviews complaints
{competitor} problems
{competitor} expensive
{competitor} missing feature
{competitor} unreliable
{competitor} support slow
{competitor} Reddit
{competitor} "not worth it"
{competitor} "canceled" OR "cancelled"
site:reddit.com {competitor} social media scheduler
site:g2.com/products {competitor} reviews cons
site:capterra.com {competitor} reviews cons
site:trustpilot.com {competitor}
```

### “Alternative to” and comparison pages

```text
{competitor} alternative
{competitor} alternatives
{competitor} vs Buffer
{competitor} vs Hootsuite
{competitor} vs Later
{competitor} vs Sprout Social
"alternative to {competitor}"
"best {competitor} alternative"
"{competitor} alternatives for small business"
"{competitor} alternatives cheaper"
"{competitor} vs" "pricing"
```

### PublyApp opportunity queries

```text
"social media scheduler" "approval workflow" complaints
"social media scheduler" "too expensive"
"social media scheduler" "client approval"
"social media scheduler" "multi brand"
"social media scheduler" "team collaboration" "pricing"
"Buffer alternative" "approval workflow"
"Hootsuite alternative" "small business"
"Later alternative" "LinkedIn"
"Sprout Social alternative" "cheaper"
```

## Daily manual research checklist — 2026-06-01

### 1. Pricing and packaging pass

- [ ] Open pricing pages for Buffer, Hootsuite, Later, Sprout Social, Publer, Metricool, and SocialBee.
- [ ] Record current lowest paid plan, free plan limits, seat/user limits, brand/social-account limits, and AI/analytics limits.
- [ ] Search for `pricing change`, `new pricing`, and `price increase` for each competitor.
- [ ] Create JSON findings for material price changes, packaging changes, free-plan restrictions, or trial changes.

### 2. Product update pass

- [ ] Check official blogs, changelogs, release notes, and help-center announcements for the top 10 competitors.
- [ ] Prioritize features related to AI caption generation, approval workflows, content calendars, analytics, multi-brand workspaces, bulk scheduling, integrations, and team collaboration.
- [ ] Capture exact source URLs and short evidence quotes.
- [ ] Mark confidence `high` only when the source is official or independently confirmed by two sources.

### 3. Complaint and review pass

- [ ] Search Reddit, G2, Capterra, Trustpilot, and public community forums for recent complaints.
- [ ] Tag pain signals: `pricing`, `reliability`, `support`, `missing_feature`, `ux`, `approval_workflow`, `analytics`, `platform_limits`, `team_collaboration`.
- [ ] Convert repeated complaints into PublyApp positioning opportunities.
- [ ] Avoid over-weighting one-off angry reviews unless the same issue appears repeatedly.

### 4. “Alternative to” SERP pass

- [ ] Search `alternative to Buffer`, `alternative to Hootsuite`, `alternative to Later`, `alternative to Sprout Social`, and `alternative to Publer`.
- [ ] Note comparison pages that rank well and the positioning angles they use.
- [ ] Record whether pages emphasize cheaper pricing, easier UX, better team workflows, better analytics, or specific social-network support.
- [ ] Identify pages where PublyApp could eventually compete with a dedicated comparison/landing page.

### 5. Synthesis pass

- [ ] Pick at most 3 high-priority findings for the daily briefing.
- [ ] For each finding, write the PublyApp implication in one practical sentence.
- [ ] Add one suggested follow-up action: product, marketing, pricing, docs, or validation research.
- [ ] Save Markdown briefing and append JSON findings to the findings store.

## Minimal daily operating rules

- Do not store a finding without a source URL.
- Do not treat a search snippet as confirmed evidence unless the linked page supports it.
- Prefer official sources for launches and pricing; prefer review/community sources for pain signals.
- Keep the daily report short enough to read in under 3 minutes.
- If nothing meaningful changed, explicitly report “No meaningful changes found” rather than inventing a signal.
