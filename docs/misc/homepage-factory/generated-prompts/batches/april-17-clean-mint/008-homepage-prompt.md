# Homepage Prompt Variant 8

## Variant Metadata
- Seed: **april-17-clean-mint**
- Primary audience: **In-House Social Teams**
- Homepage archetype: **Proof First**
- Promise angle: **Replace Fragmented Tools**
- Proof strategy: **Customer Credibility**
- Creative bundle: **Assistantly Clean Mint**

## System Prompt
You are an award-winning SaaS design + implementation agent.

Design bar:
- The output must look and feel on par with elite multi-million-dollar SaaS websites.
- Prioritize clarity, visual hierarchy, and conversion impact over decoration.
- Every section should feel purposeful, premium, and production-ready.

Non-generic guardrails:
- No vague AI-productivity filler.
- No interchangeable SaaS headline language.
- The hero must make a concrete promise to the selected audience.
- Proof, CTA language, and section emphasis must follow the audience overlay and archetype inputs.
- Product visuals must show a believable social publishing workflow.
- Avoid verbs like "streamline", "optimize", and "unlock" unless tied to a concrete outcome.

Design process accelerator:
- If you have access to the **hue** skill, run it first to generate a clean, high-end marketing design language that matches the creative direction bundle, then apply it consistently across the implementation.

Execution rules:
- Build a complete homepage in React + TypeScript + MUI v6.
- Use only MUI primitives/components and sx styling.
- Maintain AA contrast and responsive behavior from 320px to 1536px+.

## User Prompt
Create a homepage concept for **PublyApp**.

### Product Core
- Summary: AI-first social publishing workspace for planning, drafting, reviewing, and shipping better social content faster.
- Core differentiators:
  - Combines AI-assisted drafting with real publishing workflow structure.
  - Built for approval-heavy social teams, not just solo creators.
  - Keeps planning, editing, review, and publishing context in one place.
- Workflow strengths:
  - campaign planning
  - draft generation
  - review and approval coordination
  - publishing readiness
- Trust signals:
  - operationally serious product posture
  - clear review states and workflow visibility
  - reduced tool-switching across the content lifecycle
- Product visual requirements:
  - Show a believable social publishing workflow.
  - Show calendar, draft, review, or queue states.
  - Avoid abstract charts as the primary hero visual.
- Forbidden claims:
  - fully autonomous social media
  - guaranteed virality
  - replace your marketing team
- Forbidden copy patterns:
  - unlock your social potential
  - supercharge your workflow
  - AI-powered productivity for modern teams

### Audience Overlay
- Audience: In-House Social Teams
- Primary pains:
  - fragmented planning and publishing
  - slow review cycles
  - unclear publishing readiness
- Desired outcomes:
  - consistent publishing cadence
  - better cross-functional visibility
  - cleaner review flow
- Top objections:
  - we already use several tools
  - AI features usually feel gimmicky
- Decision criteria:
  - workflow clarity
  - calendar confidence
  - trustworthy collaboration
- Proof expectations:
  - workflow clarity
  - team adoption
  - review-state visibility
- CTA preference: See the workflow
- Product focus areas:
  - calendar
  - review flow
  - publishing queue
- FAQ concerns:
  - approvals
  - handoffs
  - tool consolidation
- Preferred tone adjustments:
  - clear
  - trustworthy
  - team-oriented

### Archetype Brief
- Hero goal: Lead with evidence that the workflow is credible and operationally serious.
- Narrative order:
  - hero
  - social-proof
  - proof-metrics
  - core-benefits
  - product-visual
  - faq
  - final-cta
- Required sections:
  - hero
  - proof
  - core-benefits
  - product-visual
  - final-cta
- Optional sections:
  - logo-strip
  - pricing-teaser
  - faq
- Proof placement: immediately below the hero
- CTA style: Book a walkthrough

### Creative Direction
- Hero style: clean-hero-with-mint-accent-and-product-screenshot
- Visual density: medium-low
- Motion behavior: subtle-stagger-on-load-and-hover-lift
- Color direction: mint-fog-neutrals-with-crisp-ink-typography
- Surface treatment: soft glass panels with thin borders and gentle mint glow accents
- Screenshot treatment: large product card with inset UI panels and minimal annotation chips
- Copy tone: clear-confident-and-specific


Typography:
- Marketing font stack (load from web): headings use **Space Grotesk**, body uses **DM Sans**.
- Google Fonts stylesheet href: https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap
- Apply the font stack via MUI theme typography overrides (preferred) or via section-level sx fontFamily. If the font is not loaded yet in the app shell, add a route-level links() for /homepage-gen/:id previews.

### Strategy Inputs
- Core promise: Bring planning, drafting, review, and publishing into one more coherent workflow.
- Headline direction: Contrast fragmented tool stacks with one clearer operating system.
- Supporting message themes:
  - fewer handoffs
  - less context switching
  - unified workflow
- Proof type: testimonial
- Recommended proof elements:
  - testimonial quote
  - team role or context
  - specific operational win
- Proof placement guidance: Put a concrete testimonial close to the hero or primary product explanation.

### Messaging And Section Emphasis Rules
- Let the audience overlay shape the proof style, CTA phrasing, FAQ emphasis, tone, and which product surfaces get the most space.
- Match proof execution to these audience proof expectations:
  - workflow clarity
  - team adoption
  - review-state visibility
- Favor this CTA language family unless the archetype demands a tighter variant: See the workflow
- Spend the most product-detail real estate on these focus areas:
  - calendar
  - review flow
  - publishing queue
- Cover these FAQ concerns directly if an FAQ section appears, or answer them in nearby copy if it does not:
  - approvals
  - handoffs
  - tool consolidation
- Adjust the copy tone with these modifiers while staying inside the creative bundle direction:
  - clear
  - trustworthy
  - team-oriented
- Treat these archetype sections as mandatory, even if you rename them for better copy fit:
  - hero
  - proof
  - core-benefits
  - product-visual
  - final-cta
- These sections are optional emphasis levers, not filler. Use them only when they strengthen this variant:
  - logo-strip
  - pricing-teaser
  - faq
- The section order should respect the archetype narrative order, but the proof weight and CTA phrasing should still reflect the selected audience overlay.

### Design Inspiration Anchors
Use these references for style analysis only:
- https://www.assistantly.com/
- https://stripe.com
- https://linear.app
- https://www.figma.com

Use these galleries for composition ideas:
- https://land-book.com/
- https://www.lapa.ninja/

### Working Order
Before implementation, work in this order:
1. Define the homepage concept.
2. Define the messaging strategy.
3. Define the section-by-section narrative.
4. Define the visual direction rationale.
5. Implement the homepage.

### Output Contract
1. Provide a concise concept summary.
2. Provide a messaging strategy summary.
3. Provide a section outline.
4. Provide the full homepage implementation.
5. Provide a short quality self-check covering accessibility, responsiveness, and non-generic quality.
