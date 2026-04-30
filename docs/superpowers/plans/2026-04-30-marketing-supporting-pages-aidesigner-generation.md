# Marketing Supporting Pages — AIDesigner Generation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce 18 AIDesigner canvases (1 homepage anchor + 11 marketing pages, with 6 in both light/dark modes) using a single brand kit extracted from the live homepage, with explicit user sign-off after each page.

**Architecture:** Stand up a public preview URL of the existing homepage → call `create_brand_kit_from_url` to extract a single canonical brand kit → reproduce the homepage as a light-mode anchor canvas → generate the 11 supporting pages from prompts, all referencing the same `brand_kit_id`, in an order that maximizes feedback velocity (Pricing first to validate the kit; Legal template once and reuse for Privacy + Cookies). Each page has a user review checkpoint; refinement loops use `refine_design` until the user signs off. After every accepted page, append the canvas ID to the spec document and commit.

**Tech Stack:** AIDesigner MCP server (`mcp__aidesigner__*` tools: `whoami`, `get_credit_status`, `create_brand_kit_from_url`, `generate_branding_kit_variations`, `create_brand_kit_from_variation`, `generate_design`, `refine_design`, `get_canvas`); ngrok or Dokploy preview branch for the public URL; Markdown spec doc as the canvas-ID ledger.

**Spec:** `docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md` (commit `fb8f83ad` on branch `feature/marketing-supporting-pages`).

---

## Conventions used throughout this plan

**Brand kit reference.** Every `generate_design` call after Task 3 passes `brand_kit_id: ${BRAND_KIT_ID}` where `${BRAND_KIT_ID}` is the value captured in Task 3 step 4. Substitute the literal ID at execution time.

**Voice anchors** (paste into every prompt's `tone` or context section):
> Confident, ops-flavored. Audience: SaaS social media managers and small-to-mid brands. Real numbers ("10,000+ brands", "+1,204 followers/week"), no vague superlatives. Phrases like "organize the chaos", "publish on autopilot" are on-brand.

**Layout primitives** (referenced in prompts so AIDesigner converges on reusable shapes):
- `MarketingShell` — topbar (transparent → translucent on scroll) + outlet + footer
- `MarketingHero` — eyebrow + h1 + subhead + optional CTA pair
- `LegalDocPage` — narrow column + sticky TOC sidebar (desktop) + last-updated band + h2/h3 anchors
- `ContentBand` — eyebrow + title + optional subhead + slot
- `CtaBand` — bottom dark `#242424` card with primary CTA (the homepage's "Start for Free" pattern)

**Spec ledger.** After each accepted canvas, append a row to a "Canvas IDs" section at the bottom of the spec doc:
```
| Page | Mode | Canvas ID | Accepted on |
| --- | --- | --- | --- |
| Homepage anchor | light | <id> | 2026-04-30 |
```

**Per-page commit message format:**
```
docs(spec): record <page> <mode> canvas (<canvas_id_short>)
```

---

## Task 1: Verify AIDesigner connection and credit budget

**Files:** none modified.

- [ ] **Step 1: Call `whoami` to verify session is authenticated**

Tool: `mcp__aidesigner__whoami` (no args).
Expected: returns user identity object. If error, re-authenticate via the AIDesigner MCP setup before continuing.

- [ ] **Step 2: Call `get_credit_status` and record the available credit count**

Tool: `mcp__aidesigner__get_credit_status` (no args).
Expected: returns credit balance. Note the number; if below ~50 credits, warn the user before continuing — full plan execution may exceed budget (rough estimate: 18 generations + 1 brand kit + ~10–20 refinements ≈ 30–50 credits; varies by AIDesigner pricing).

- [ ] **Step 3: Capture both results in plan execution log**

Write user identity and credit balance into your execution scratchpad. No code change required.

---

## Task 2: Stand up a public preview URL of the homepage

**Files:** none in this repo (infrastructure step).

**Decision:** Try Dokploy preview branch first (most stable). If not configured for preview-per-branch deploys (check `dokploy.yml` and ask user), fall back to ngrok tunnel.

- [ ] **Step 1: Check Dokploy preview-branch availability**

Read `dokploy.yml` for any preview-branch config. Ask user: "Does Dokploy auto-deploy preview URLs for feature branches?" If yes → use the preview URL for the current branch's deploy and skip to Step 4. If no → continue to Step 2 (ngrok).

- [ ] **Step 2: Start local dev server**

Run in a background shell:
```bash
just dev-front
```
Expected: server listens on `http://localhost:5050`.

- [ ] **Step 3: Open ngrok tunnel to localhost:5050**

In a separate shell:
```bash
ngrok http 5050
```
Expected: ngrok returns a public HTTPS forwarding URL like `https://<random>.ngrok-free.app`.

If ngrok is not installed, ask user to install it (`winget install ngrok` on Windows) and to authenticate (`ngrok config add-authtoken <token>`).

- [ ] **Step 4: Verify the URL is publicly accessible**

Run:
```bash
curl -I <PREVIEW_URL>
```
Expected: HTTP 200 response with HTML content-type. If not, debug before continuing — AIDesigner cannot reach an unreachable URL.

- [ ] **Step 5: Record the URL**

Save the URL value as `${PREVIEW_URL}` in your execution scratchpad. Used by Task 3.

---

## Task 3: Extract brand kit from preview URL

**Files modified:** `docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md` (append "Canvas IDs and brand kit" section at the bottom).

- [ ] **Step 1: Call `create_brand_kit_from_url` with the preview URL**

Tool: `mcp__aidesigner__create_brand_kit_from_url`
Args:
```json
{
  "url": "${PREVIEW_URL}",
  "name": "PublyApp Marketing"
}
```
Expected: returns a brand kit object with `brand_kit_id`, palette, type stack, logo references.

- [ ] **Step 2: User review checkpoint**

Show the user the returned brand kit (palette swatches, type stack, logo). Ask: "Does this brand kit accurately reflect the live homepage? Approve to lock it as the canonical kit for all 11 pages, or describe what to adjust."

If user requests changes → fall back to variations path:
1. Call `mcp__aidesigner__generate_branding_kit_variations` with prompt:
   > "Modern SaaS, deep green primary (matches PublyApp's primary.main token), dark monochrome accents (#242424 always-dark cards), expressive radii 24–40px on hero/CTA cards, subtle radial glows, framer-motion-style micro-interactions. Audience: SaaS social media managers."
2. Show the 3×3 board to user; ask which tile number to lock.
3. Call `mcp__aidesigner__create_brand_kit_from_variation` with the selected tile.

If user approves → continue.

- [ ] **Step 3: Capture `brand_kit_id`**

Save the value as `${BRAND_KIT_ID}` in your execution scratchpad. Used in every subsequent generate_design call.

- [ ] **Step 4: Append "Canvas IDs and brand kit" section to the spec**

Add this section at the bottom of `docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md`:

```markdown
## Canvas IDs and brand kit

**Brand kit ID:** `<BRAND_KIT_ID>`
**Source:** `${PREVIEW_URL}` (or "variations board" if fallback used)
**Locked on:** 2026-04-30

### Canvases

| Page | Mode | Canvas ID | Accepted on |
| --- | --- | --- | --- |
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md
git commit -m "docs(spec): lock brand kit (<BRAND_KIT_ID_SHORT>) and open canvas ledger"
```

---

## Task 4: Reproduce homepage as the light-mode anchor canvas

**Files modified:** `docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md` (append homepage row to canvas table).

- [ ] **Step 1: Call `generate_design` with screenshots as inspiration**

Tool: `mcp__aidesigner__generate_design`
Args:
```json
{
  "brand_kit_id": "${BRAND_KIT_ID}",
  "mode": "inspire",
  "inspiration_urls": [
    "${PREVIEW_URL}"
  ],
  "prompt": "Reproduce the PublyApp marketing homepage in light mode as a single full-bleed page. Sections in order: (1) transparent topbar with logo + nav anchors (Features, How it works, Pricing, FAQ) + sign-in + Dashboard CTA; (2) hero: eyebrow chip 'Brand Advocates', h1 'Turn Your Followers Into Brand Advocates' with last two words in primary green, subhead about social automation, CTA pair ('Start Your Free Trial' primary green button + 'Watch Demo' ghost button with play icon), product mockup card showing scheduled posts; (3) social proof logo strip; (4) features bento grid: 'Transform Your Strategy Into a Powerhouse', 4 cards including a wide dark #242424 'Unified Inbox' card with platform tabs; (5) onboarding 3-step section 'Effortless Setup in Minutes' with step cards in orange/purple/teal tones, watermark numerals, animated platform tile floats; (6) pricing strip 'Simple, Transparent Pricing' with Monthly/Annually toggle, 2 cards (Creator $19, Scale $49 dark #242424), feature checklists; (7) FAQ accordion 'Frequently asked questions' (4 items); (8) bottom CTA dark #242424 card 'Unlock the Power of Automated Social Growth' with primary green 'Start for Free' button; (9) footer with logo + 4 link columns + copyright. Use the brand kit's primary green for accents and CTAs. Hover states: stable bg/text/border, only transform + shadow change.",
  "page_name": "homepage-anchor-light"
}
```
Expected: returns a canvas object with `canvas_id` and a preview URL.

- [ ] **Step 2: User review checkpoint**

Show the user the canvas preview alongside the original screenshots. Ask: "Does this anchor canvas match the live homepage closely enough to use as the brand reference for all subsequent pages? Approve, or list refinements."

- [ ] **Step 3: Refinement loop**

If user requests changes, call `mcp__aidesigner__refine_design`:
```json
{
  "canvas_id": "<CANVAS_ID>",
  "instructions": "<user's specific change requests>"
}
```
Repeat until user approves. Cap at 3 refine cycles before re-asking the user whether to proceed or restart this canvas.

- [ ] **Step 4: Append canvas row to the spec ledger**

Add to the canvas table in the spec doc:
```
| Homepage anchor | light | <canvas_id> | 2026-04-30 |
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md
git commit -m "docs(spec): record homepage anchor canvas (<CANVAS_ID_SHORT>)"
```

---

## Task 5: Pricing page (light + dark)

**Files modified:** spec ledger (2 rows).

- [ ] **Step 1: Generate light-mode Pricing canvas**

Tool: `mcp__aidesigner__generate_design`
Args:
```json
{
  "brand_kit_id": "${BRAND_KIT_ID}",
  "mode": "prompt",
  "prompt": "Light-mode dedicated Pricing page for PublyApp (SaaS social media scheduling). Sections in order: (1) MarketingShell topbar with route-link nav (Product, Pricing [active], Blog, Changelog, Docs, Login, Sign up); (2) MarketingHero: eyebrow 'Pricing', h1 'Pick a plan that scales with you', subhead about transparent per-seat pricing, no CTA pair (the cards below are the CTA); (3) 3-tier pricing card row: Creator ($19/mo), Scale ($49/mo, marked 'Most popular' with primary green accent), Enterprise (custom — 'Talk to sales' button instead of price). Each card shows: tier name, price, per-month/annual toggle (Monthly | Annually -20%, segmented control with white rail), feature checklist (8–10 items per tier), CTA button at bottom. Scale card uses #242424 dark background and white text in both modes; (4) Full feature comparison matrix table — features down rows, tiers across columns, checkmarks/dashes/'unlimited'; (5) Pricing-specific FAQ (5 items): 'Can I switch plans?', 'What happens when I exceed my limit?', 'Do you offer annual discounts?', 'Is there a free trial?', 'Can I cancel anytime?'; (6) Enterprise band: full-bleed light section with 'Need more? Talk to our team' h2, mention SOC 2 / SSO / dedicated success manager, 'Talk to sales' primary CTA + 'Read security overview' secondary link; (7) CtaBand bottom dark #242424 card 'Start with a 14-day free trial' + 'Start for Free' primary CTA; (8) MarketingFooter. Confident ops-flavored tone. Real numbers, no superlatives. Stable hover convention.",
  "page_name": "pricing-light"
}
```

- [ ] **Step 2: User review checkpoint (light)**

Show preview, ask user to approve or list refinements.

- [ ] **Step 3: Refinement loop (light)**

`refine_design` until user approves. Cap at 3 cycles.

- [ ] **Step 4: Generate dark-mode Pricing canvas**

Tool: `mcp__aidesigner__generate_design`
Args: same as Step 1 but with `"page_name": "pricing-dark"` and append to the prompt:
> "Dark mode variant. Use brand kit's dark-mode palette: dark page background, light text, divider colors via varAlpha. The Scale card stays #242424 (already dark — visually it should now blend with the page background to feel like an embedded feature rather than a contrast card; differentiate via primary green outline glow). Form/segmented controls in dark mode use brand kit dark-control tokens."

- [ ] **Step 5: User review checkpoint (dark)**

- [ ] **Step 6: Refinement loop (dark)**

- [ ] **Step 7: Append both canvas rows to spec ledger**

```
| Pricing | light | <canvas_id_light> | 2026-04-30 |
| Pricing | dark | <canvas_id_dark> | 2026-04-30 |
```

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md
git commit -m "docs(spec): record pricing canvases (<short_light>, <short_dark>)"
```

---

## Task 6: Terms of Use (light only — establishes the legal template)

**Files modified:** spec ledger (1 row).

- [ ] **Step 1: Generate light-mode Terms canvas**

Tool: `mcp__aidesigner__generate_design`
Args:
```json
{
  "brand_kit_id": "${BRAND_KIT_ID}",
  "mode": "prompt",
  "prompt": "Light-mode Terms of Use page for PublyApp. Use the LegalDocPage template — this canvas establishes the template that Privacy and Cookies will reuse. Sections in order: (1) MarketingShell topbar (route-link nav, Login link); (2) Tight title-only hero: small eyebrow 'Legal', h1 'Terms of Use', muted subline 'Last updated April 30, 2026', no CTA, no glow, no mockup — just clean type on background.default; (3) Two-column body layout (desktop): left column = sticky TOC sidebar listing the section headings as anchor links with subtle hover; right column = narrow reading column (max-width ~720px) with body text. Sections in body: '1. Acceptance of Terms', '2. Account Registration', '3. Acceptable Use', '4. Subscription and Billing', '5. Intellectual Property', '6. User Content', '7. Termination', '8. Disclaimers and Limitations', '9. Changes to Terms', '10. Contact'. Each section has h2 anchor + paragraph(s) of placeholder lorem-ipsum-shaped legal copy (3–5 sentences each); (4) Bottom band: muted 'Last updated April 30, 2026' + link 'Have questions? Contact us'; (5) MarketingFooter (no CtaBand — legal pages skip the conversion tail). Mobile: TOC collapses into an in-page accordion above the body. Tighter radii (max 16px). Body copy uses theme typography variants — no marketing-style oversized headings.",
  "page_name": "terms-light"
}
```

- [ ] **Step 2: User review checkpoint**

Ask user to approve or refine. Note: this canvas defines the legal template — getting it right matters for the next two tasks.

- [ ] **Step 3: Refinement loop**

- [ ] **Step 4: Append canvas row, commit**

```
| Terms of Use | light | <canvas_id> | 2026-04-30 |
```

```bash
git add docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md
git commit -m "docs(spec): record terms canvas (<short>)"
```

---

## Task 7: Privacy Policy (light only — content swap from Terms template)

**Files modified:** spec ledger (1 row).

- [ ] **Step 1: Generate light-mode Privacy canvas**

Tool: `mcp__aidesigner__generate_design`
Args:
```json
{
  "brand_kit_id": "${BRAND_KIT_ID}",
  "mode": "prompt",
  "prompt": "Light-mode Privacy Policy page for PublyApp. Reuse the same LegalDocPage template established in the terms-light canvas (referenced for layout cues — same hero, same TOC sidebar, same narrow reading column, same bottom band). Body sections: '1. What We Collect', '2. How We Use Your Data', '3. Data Sharing and Third Parties', '4. Cookies and Tracking', '5. Data Retention', '6. Your Rights (GDPR/CCPA)', '7. International Transfers', '8. Children's Privacy', '9. Security Measures', '10. Changes to This Policy', '11. Contact Our DPO'. Each h2 + paragraph(s) of placeholder copy (3–5 sentences). Hero h1 'Privacy Policy', eyebrow 'Legal', last-updated 'April 30, 2026'.",
  "page_name": "privacy-light"
}
```

- [ ] **Step 2: User review checkpoint**

- [ ] **Step 3: Refinement loop**

- [ ] **Step 4: Append canvas row, commit**

```
| Privacy Policy | light | <canvas_id> | 2026-04-30 |
```

---

## Task 8: Cookie Policy (light only — content swap from Terms template)

**Files modified:** spec ledger (1 row).

- [ ] **Step 1: Generate light-mode Cookies canvas**

Tool: `mcp__aidesigner__generate_design`
Args:
```json
{
  "brand_kit_id": "${BRAND_KIT_ID}",
  "mode": "prompt",
  "prompt": "Light-mode Cookie Policy page for PublyApp. Reuse the same LegalDocPage template established in the terms-light canvas. Body sections: '1. What Are Cookies', '2. Cookies We Set' (followed by a small 3-column table: Cookie name | Purpose | Duration — with 6 example rows), '3. Third-Party Cookies', '4. Managing Your Cookie Preferences' (with a callout box: 'Open cookie preferences →' linking to the consent banner), '5. Updates to This Policy'. Hero h1 'Cookie Policy', eyebrow 'Legal', last-updated 'April 30, 2026'.",
  "page_name": "cookies-light"
}
```

- [ ] **Step 2: User review checkpoint**

- [ ] **Step 3: Refinement loop**

- [ ] **Step 4: Append canvas row, commit**

```
| Cookie Policy | light | <canvas_id> | 2026-04-30 |
```

---

## Task 9: Blog index (light + dark)

**Files modified:** spec ledger (2 rows).

- [ ] **Step 1: Generate light-mode Blog index canvas**

Tool: `mcp__aidesigner__generate_design`
Args:
```json
{
  "brand_kit_id": "${BRAND_KIT_ID}",
  "mode": "prompt",
  "prompt": "Light-mode Blog index page for PublyApp. Sections: (1) MarketingShell topbar (Blog active in nav); (2) Featured-post hero — full-bleed band with: large cover image left, on the right an eyebrow 'Featured', h1 article title 'How we ship 4× faster with batch scheduling', author byline + reading time '8 min read', short excerpt (2 sentences), 'Read article →' link; (3) Category filter row: pill chips ('All', 'Product Updates', 'Engineering', 'Growth', 'Customer Stories') with active state filled in primary green; (4) 3-column responsive card grid (12 placeholder articles): each card = cover image (16:9 ratio), tag pill, article title (h3), 2-line excerpt, author thumbnail + name + date. Hover: subtle lift + shadow, stable bg/text. Card border-radius 16px (content-page tier); (5) Pagination footer: 'Page 1 of 4' with prev/next buttons; (6) CtaBand bottom dark #242424 'Get social ops insights in your inbox' + email signup form (input + 'Subscribe' primary CTA); (7) MarketingFooter. Real article-shaped placeholder titles, not lorem ipsum. Tone consistent with PublyApp brand voice.",
  "page_name": "blog-index-light"
}
```

- [ ] **Step 2: User review checkpoint (light)**

- [ ] **Step 3: Refinement loop (light)**

- [ ] **Step 4: Generate dark-mode Blog index canvas**

Same args as Step 1 but `"page_name": "blog-index-dark"` and append:
> "Dark mode variant. Use brand kit dark palette. Cover images keep their natural color. Tag pills shift to dark-mode appropriate fills. CtaBand dark card stays #242424 — should blend in dark mode and differentiate via primary green outline glow."

- [ ] **Step 5: User review checkpoint (dark)**

- [ ] **Step 6: Refinement loop (dark)**

- [ ] **Step 7: Append rows, commit**

```
| Blog index | light | <canvas_id_light> | 2026-04-30 |
| Blog index | dark | <canvas_id_dark> | 2026-04-30 |
```

---

## Task 10: Blog article template (light only)

**Files modified:** spec ledger (1 row).

- [ ] **Step 1: Generate light-mode Blog article canvas**

Tool: `mcp__aidesigner__generate_design`
Args:
```json
{
  "brand_kit_id": "${BRAND_KIT_ID}",
  "mode": "prompt",
  "prompt": "Light-mode Blog article template page for PublyApp. Sections: (1) MarketingShell topbar (Blog in nav); (2) Article header band: tag pill 'Engineering', h1 article title 'How we built cross-tab theme sync in 200ms', subline = author byline (avatar + name + role) + dot separator + publish date 'April 28, 2026' + dot separator + reading time '6 min read'; (3) Hero cover image full-bleed (16:9); (4) Body region: narrow reading column (max-width ~720px, centered), with a thin sticky share rail on the left edge (Twitter, LinkedIn, copy-link icons) on desktop only. Body content uses rich blocks: lead paragraph (slightly larger), h2 sections, h3 subsections, body paragraphs, inline links in primary green, blockquote callout (left border-accent in primary green), bulleted list, ordered list, code block (monospace, dark background, language label top-right), an image with caption, a callout box ('Note:' / 'Tip:' patterns with subtle background tint and accent border-left), and a closing paragraph; (5) Author bio card at the end: avatar + name + 1-paragraph bio + 'Follow on X' link; (6) Related posts section: 'Continue reading' h2, 3-column card row of related articles (smaller cards than blog index — cover, title, date); (7) CtaBand bottom dark #242424 'Try PublyApp free for 14 days'; (8) MarketingFooter. Tighter radii (max 16px) — content page tier. Body typography uses theme variants for readability.",
  "page_name": "blog-article-light"
}
```

- [ ] **Step 2: User review checkpoint**

- [ ] **Step 3: Refinement loop**

- [ ] **Step 4: Append row, commit**

```
| Blog article | light | <canvas_id> | 2026-04-30 |
```

---

## Task 11: Changelog (light only)

**Files modified:** spec ledger (1 row).

- [ ] **Step 1: Generate light-mode Changelog canvas**

Tool: `mcp__aidesigner__generate_design`
Args:
```json
{
  "brand_kit_id": "${BRAND_KIT_ID}",
  "mode": "prompt",
  "prompt": "Light-mode Changelog page for PublyApp. Sections: (1) MarketingShell topbar (Changelog in nav); (2) Stat-band hero: eyebrow 'Changelog', h1 'What's new in PublyApp', subhead 'Product updates, fixes, and behind-the-scenes wins', 3-stat row below the headline ('128 releases shipped', '47 features in 2026', '99.97% uptime SLA'); (3) Year filter chip row: 'All', '2026', '2025', '2024'; (4) Vertical timeline body: anchored versions, each entry has a left-side date column (sticky on desktop: e.g. 'APR 28' large, '2026' small) and a right-side content column. Each version block: version anchor pill (linkable, e.g. '#v1.4.2 - April 28, 2026'), tag pill row (Feature / Fix / Breaking — Feature in primary green, Fix in muted gray, Breaking in red/orange), h3 release title, 2–3 paragraph release notes with embedded screenshots when relevant. Show 5 example version entries spanning the last few weeks. Subtle vertical line connects the timeline; (5) 'Subscribe to release notes' subtle inline band: 'Get the changelog in your inbox' + email input + 'Subscribe' button; (6) CtaBand bottom dark #242424 'Start using the latest features today'; (7) MarketingFooter. Tighter radii (max 16px). Tone: confident, ops-flavored, real release-note content (not lorem ipsum).",
  "page_name": "changelog-light"
}
```

- [ ] **Step 2: User review checkpoint**

- [ ] **Step 3: Refinement loop**

- [ ] **Step 4: Append row, commit**

```
| Changelog | light | <canvas_id> | 2026-04-30 |
```

---

## Task 12: About (light + dark)

**Files modified:** spec ledger (2 rows).

- [ ] **Step 1: Generate light-mode About canvas**

Tool: `mcp__aidesigner__generate_design`
Args:
```json
{
  "brand_kit_id": "${BRAND_KIT_ID}",
  "mode": "prompt",
  "prompt": "Light-mode About page for PublyApp. Sections: (1) MarketingShell topbar; (2) MarketingHero: eyebrow 'About', h1 'We help brands organize the chaos of social', subhead one-paragraph mission (something like 'Built by operators who got tired of managing 14 platforms in 14 tabs'); (3) Story ContentBand: eyebrow 'Our story', h2 'From an internal tool to 10,000+ brands', body = 2–3 short paragraphs of placeholder origin story, optional inline founder quote callout; (4) Values cards row: 4 cards each with a phosphor icon, h4 value name (e.g. 'Ship daily', 'Operator-first', 'Honest defaults', 'No dark patterns'), 2-sentence description; (5) Team grid: eyebrow 'The team', h2 'Small team, big ambitions', responsive grid of 8 placeholder team portraits (square avatars with rounded corners, name below in bold, role muted below name); (6) 'We're hiring' tease band: subtle band with 'Join us' h3, 1-paragraph pitch, 'See open roles' link (placeholder — opens future careers page); (7) CtaBand bottom dark #242424 'Try PublyApp free' + 'Start for Free' primary CTA; (8) MarketingFooter. Larger radii (24–40px) — conversion-page tier. Confident ops tone.",
  "page_name": "about-light"
}
```

- [ ] **Step 2: User review checkpoint (light)**

- [ ] **Step 3: Refinement loop (light)**

- [ ] **Step 4: Generate dark-mode About canvas**

Same args as Step 1 but `"page_name": "about-dark"` and append:
> "Dark mode variant. Use brand kit dark palette. Team avatars retain their colors. CtaBand stays #242424 with primary green outline glow."

- [ ] **Step 5: User review checkpoint (dark)**

- [ ] **Step 6: Refinement loop (dark)**

- [ ] **Step 7: Append rows, commit**

```
| About | light | <canvas_id_light> | 2026-04-30 |
| About | dark | <canvas_id_dark> | 2026-04-30 |
```

---

## Task 13: Contact (light + dark)

**Files modified:** spec ledger (2 rows).

- [ ] **Step 1: Generate light-mode Contact canvas**

Tool: `mcp__aidesigner__generate_design`
Args:
```json
{
  "brand_kit_id": "${BRAND_KIT_ID}",
  "mode": "prompt",
  "prompt": "Light-mode Contact page for PublyApp. Sections: (1) MarketingShell topbar; (2) MarketingHero: eyebrow 'Contact', h1 'Get in touch', subhead 'We respond fast — usually within a few hours during business days'; (3) Split layout (desktop): left half = contact form card (Name, Email, Topic dropdown ['General', 'Sales', 'Support', 'Press'], Message textarea, 'Send message' primary green button at bottom). Form fields use the same input style as the auth pages (form parity is a brand consistency rule); right half = info panel card listing: support email (mailto:support@publyapp.com), sales email (mailto:sales@publyapp.com), live chat hint ('Use the chat widget bottom-right during business hours'), business hours table ('Mon–Fri, 9am–6pm UTC'), and a small 3-tier support response time band ('Free: 48h', 'Creator/Scale: 12h', 'Enterprise: 1h SLA'); (4) FAQ snippet band: 4 quick-answer cards for common pre-sale questions ('Do you offer trials?', 'Can I switch plans?', 'Is my data secure?', 'Do you have an API?'); (5) CtaBand bottom dark #242424 'Or skip the form and just start a trial' + 'Start for Free' primary CTA; (6) MarketingFooter. Conversion-page radii (24–40px). Form input dark/light contrast handled by brand kit tokens.",
  "page_name": "contact-light"
}
```

- [ ] **Step 2: User review checkpoint (light)**

- [ ] **Step 3: Refinement loop (light)**

- [ ] **Step 4: Generate dark-mode Contact canvas**

Same args as Step 1 but `"page_name": "contact-dark"` and append:
> "Dark mode variant. Form inputs critical here — use brand kit's dark-mode form-control tokens (dark surface fill, light text, muted placeholder, primary green focus ring). Validate that input contrast meets WCAG AA. CtaBand stays #242424."

- [ ] **Step 5: User review checkpoint (dark)**

- [ ] **Step 6: Refinement loop (dark)**

- [ ] **Step 7: Append rows, commit**

```
| Contact | light | <canvas_id_light> | 2026-04-30 |
| Contact | dark | <canvas_id_dark> | 2026-04-30 |
```

---

## Task 14: Security / Trust (light + dark)

**Files modified:** spec ledger (2 rows).

- [ ] **Step 1: Generate light-mode Security canvas**

Tool: `mcp__aidesigner__generate_design`
Args:
```json
{
  "brand_kit_id": "${BRAND_KIT_ID}",
  "mode": "prompt",
  "prompt": "Light-mode Security & Trust page for PublyApp. Sections: (1) MarketingShell topbar; (2) MarketingHero: eyebrow 'Security & Trust', h1 'Built for teams that take security seriously', subhead about commitment to data protection, optional CTA pair ('Download security whitepaper' primary + 'Email security@publyapp.com' secondary); (3) Trust badges row: 4 compliance/cert badges (SOC 2 Type II, GDPR, CCPA, ISO 27001 placeholder graphics — small monochrome lock-up); (4) Pillars ContentBand: eyebrow 'How we protect you', h2 'Defense in depth', 6-card grid: 'Encryption in transit (TLS 1.3)', 'Encryption at rest (AES-256)', 'Single sign-on (SAML, OIDC)', 'Granular role-based access', 'Audit logging', 'Regional data residency'. Each card: phosphor icon top-left, h4 title, 2-sentence description; (5) Sub-processors ContentBand: eyebrow 'Sub-processors', h2 'Who has access to your data', 2-column table (Vendor | Purpose | Region) with 6 placeholder rows (e.g. 'AWS | Hosting | EU/US', 'Stripe | Billing | US'); (6) Vulnerability reporting band: subtle bordered band 'Found a vulnerability? Report it to security@publyapp.com — we respond within 24 hours and credit researchers in our hall of fame', + 'Read disclosure policy →' link; (7) CtaBand bottom dark #242424 'Want to talk to security in detail? Schedule a call'; (8) MarketingFooter. Conversion-page radii (24–40px). Tone: confident, technical-but-approachable, no marketing fluff.",
  "page_name": "security-light"
}
```

- [ ] **Step 2: User review checkpoint (light)**

- [ ] **Step 3: Refinement loop (light)**

- [ ] **Step 4: Generate dark-mode Security canvas**

Same args as Step 1 but `"page_name": "security-dark"` and append:
> "Dark mode variant. Use brand kit dark palette. Trust badges keep their original colors (compliance logos are recognizable). Sub-processor table backgrounds shift appropriately."

- [ ] **Step 5: User review checkpoint (dark)**

- [ ] **Step 6: Refinement loop (dark)**

- [ ] **Step 7: Append rows, commit**

```
| Security | light | <canvas_id_light> | 2026-04-30 |
| Security | dark | <canvas_id_dark> | 2026-04-30 |
```

---

## Task 15: 404 / Not Found (light + dark)

**Files modified:** spec ledger (2 rows).

- [ ] **Step 1: Generate light-mode 404 canvas**

Tool: `mcp__aidesigner__generate_design`
Args:
```json
{
  "brand_kit_id": "${BRAND_KIT_ID}",
  "mode": "prompt",
  "prompt": "Light-mode 404 / Not Found page for PublyApp. Sections: (1) MarketingShell topbar (full nav); (2) Centered single-section body taking most of viewport height: large playful '404' numeral as a watermark gradient (use the orange/purple/teal step tone palette pattern from the homepage onboarding section for visual continuity), h2 'This post got deleted by the algorithm', subhead 'Or maybe the link is broken. Either way — let's get you back on track.', search box (single input + magnifying glass icon, primary green focus ring, placeholder 'Search the site…'), and a 4-link 'Popular destinations' row below: '→ Homepage', '→ Pricing', '→ Blog', '→ Help docs'; (3) MarketingFooter. No CtaBand (the page is the CTA via search/links). Conversion-page radii (24–40px). Brand voice: warm, slightly self-aware. Visual continuity with homepage onboarding step tones is intentional — this is the page where personality matters.",
  "page_name": "404-light"
}
```

- [ ] **Step 2: User review checkpoint (light)**

- [ ] **Step 3: Refinement loop (light)**

- [ ] **Step 4: Generate dark-mode 404 canvas**

Same args as Step 1 but `"page_name": "404-dark"` and append:
> "Dark mode variant. The 404 watermark gradient (orange/purple/teal) keeps its colors — that's the visual signature of this page. Search input in dark-mode form-control tokens."

- [ ] **Step 5: User review checkpoint (dark)**

- [ ] **Step 6: Refinement loop (dark)**

- [ ] **Step 7: Append rows, commit**

```
| 404 | light | <canvas_id_light> | 2026-04-30 |
| 404 | dark | <canvas_id_dark> | 2026-04-30 |
```

---

## Task 16: Final spec wrap-up and PR

**Files modified:** `docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md` (mark spec status, summarize totals).

- [ ] **Step 1: Verify the canvas ledger is complete**

Re-read the spec doc. Verify the table has 18 rows (1 homepage anchor + 6 dual-mode × 2 + 5 light-only). If any row is missing, return to that page's task and complete it.

- [ ] **Step 2: Mark spec status as complete**

Edit the spec frontmatter:
```diff
- **Status:** Draft, pending user review
+ **Status:** Design generation complete (all 18 canvases accepted by user)
```

- [ ] **Step 3: Commit final spec update**

```bash
git add docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md
git commit -m "docs(spec): mark design generation complete — 18 canvases accepted"
```

- [ ] **Step 4: Push branch**

```bash
git push -u origin feature/marketing-supporting-pages
```

- [ ] **Step 5: Open PR against `feat/tenant-module-completion`**

```bash
gh pr create --base feat/tenant-module-completion --head feature/marketing-supporting-pages --title "design(marketing): supporting pages spec + AIDesigner canvas ledger" --body "$(cat <<'EOF'
## Summary

- Adds the design spec for 11 supporting marketing pages (`docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md`) and the implementation plan for AIDesigner generation (`docs/superpowers/plans/2026-04-30-marketing-supporting-pages-aidesigner-generation.md`)
- Records 18 accepted AIDesigner canvases in the spec's canvas ledger
- Brand kit derived from the live homepage (`brand_kit_id: <BRAND_KIT_ID>`)
- No code changes — code adoption is a follow-up spec/plan

## Test plan

- [ ] Spec reviewed and approved
- [ ] All 18 canvas IDs in the ledger resolve (open each in AIDesigner)
- [ ] Brand kit referenced by every canvas matches the locked ID

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Open follow-up issue for code adoption**

```bash
gh issue create --title "Adopt AIDesigner-generated marketing pages into React codebase" --body "$(cat <<'EOF'
## Context

Design generation for the 11 supporting marketing pages is complete (see `docs/superpowers/specs/2026-04-30-marketing-supporting-pages-design.md` on branch `feature/marketing-supporting-pages`). Next step: translate the AIDesigner canvases into MUI v6 React components.

## Scope

- Implement the 5 reusable layout primitives defined in the spec (`MarketingHero`, `LegalDocPage`, `ContentBand`, `CtaBand`, expanded `MarketingShell` with route-link nav variant)
- Implement the 11 pages under `apps/front/src/routes/marketing/`
- Wire routes in `apps/front/src/routes.ts`
- Verify dark mode parity for the 5 light-only-designed pages (token-driven derivation per the spec's hybrid strategy)
- Ensure all pages adhere to `docs/guides/marketing-surface-conventions.md`

## Out of scope

- Cookie consent banner (separate component spec)
- Docs site (separate `DocsLayout` + spec)
EOF
)"
```

---

## Self-review checklist (run before declaring plan complete)

- [ ] Every page in the spec's page list has a task in this plan (11 pages → tasks 5–15, plus homepage anchor in task 4)
- [ ] Every dual-mode page in the spec's table has both light and dark generation steps
- [ ] Every light-only page in the spec's table has only a light generation step
- [ ] Every task ends with a commit step that updates the spec's canvas ledger
- [ ] No prompts contain placeholders like "TBD" or "lorem ipsum" without justification
- [ ] Generation order matches the spec (Pricing → Legal → Blog → Changelog → About/Contact/Security → 404)
- [ ] Brand kit ID and preview URL are referenced by symbolic name (`${BRAND_KIT_ID}`, `${PREVIEW_URL}`) consistently across tasks
