const renderList = (items) => {
	return items.map((item) => `- ${item}`).join('\n');
};

const renderNestedList = (items) => {
	return items.map((item) => `  - ${item}`).join('\n');
};

export const buildHomepagePrompt = ({
	variant,
	seed,
	productCore,
	audienceOverlay,
	homepageArchetype,
	promiseAngle,
	proofStrategy,
	creativeBundle,
	selectedReferences,
	selectedLibraries,
}) => {
	const marketingFontBlock =
		creativeBundle.marketingFontCssHref &&
		creativeBundle.marketingFontHeading &&
		creativeBundle.marketingFontBody
			? `\n\nTypography:
- Marketing font stack (load from web): headings use **${creativeBundle.marketingFontHeading}**, body uses **${creativeBundle.marketingFontBody}**.
- Google Fonts stylesheet href: ${creativeBundle.marketingFontCssHref}
- Apply the font stack via MUI theme typography overrides (preferred) or via section-level sx fontFamily. If the font is not loaded yet in the app shell, add a route-level links() for /homepage-gen/:id previews.`
			: '';

	return `# Homepage Prompt Variant ${variant}

## Variant Metadata
- Seed: **${seed}**
- Primary audience: **${audienceOverlay.audienceLabel}**
- Homepage archetype: **${homepageArchetype.label}**
- Promise angle: **${promiseAngle.label}**
- Proof strategy: **${proofStrategy.label}**
- Creative bundle: **${creativeBundle.label}**

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
Create a homepage concept for **${productCore.productName}**.

### Product Core
- Summary: ${productCore.productSummary}
- Core differentiators:
${renderNestedList(productCore.coreDifferentiators)}
- Workflow strengths:
${renderNestedList(productCore.workflowStrengths)}
- Trust signals:
${renderNestedList(productCore.trustSignals)}
- Product visual requirements:
${renderNestedList(productCore.productVisualRequirements)}
- Forbidden claims:
${renderNestedList(productCore.forbiddenClaims)}
- Forbidden copy patterns:
${renderNestedList(productCore.forbiddenCopyPatterns)}

### Audience Overlay
- Audience: ${audienceOverlay.audienceLabel}
- Primary pains:
${renderNestedList(audienceOverlay.primaryPains)}
- Desired outcomes:
${renderNestedList(audienceOverlay.desiredOutcomes)}
- Top objections:
${renderNestedList(audienceOverlay.topObjections)}
- Decision criteria:
${renderNestedList(audienceOverlay.decisionCriteria)}
- Proof expectations:
${renderNestedList(audienceOverlay.proofExpectations)}
- CTA preference: ${audienceOverlay.ctaPreference}
- Product focus areas:
${renderNestedList(audienceOverlay.productFocusAreas)}
- FAQ concerns:
${renderNestedList(audienceOverlay.faqConcerns)}
- Preferred tone adjustments:
${renderNestedList(audienceOverlay.preferredToneAdjustments)}

### Archetype Brief
- Hero goal: ${homepageArchetype.heroGoal}
- Narrative order:
${renderNestedList(homepageArchetype.narrativeOrder)}
- Required sections:
${renderNestedList(homepageArchetype.requiredSections)}
- Optional sections:
${renderNestedList(homepageArchetype.optionalSections)}
- Proof placement: ${homepageArchetype.proofPlacement}
- CTA style: ${homepageArchetype.ctaStyle}

### Creative Direction
- Hero style: ${creativeBundle.heroStyle}
- Visual density: ${creativeBundle.visualDensity}
- Motion behavior: ${creativeBundle.motionBehavior}
- Color direction: ${creativeBundle.colorDirection}
- Surface treatment: ${creativeBundle.surfaceTreatment}
- Screenshot treatment: ${creativeBundle.screenshotTreatment}
- Copy tone: ${creativeBundle.copyTone}
${marketingFontBlock}

### Strategy Inputs
- Core promise: ${promiseAngle.corePromise}
- Headline direction: ${promiseAngle.headlineDirection}
- Supporting message themes:
${renderNestedList(promiseAngle.supportingMessageThemes)}
- Proof type: ${proofStrategy.proofType}
- Recommended proof elements:
${renderNestedList(proofStrategy.recommendedProofElements)}
- Proof placement guidance: ${proofStrategy.proofPlacementGuidance}

### Messaging And Section Emphasis Rules
- Let the audience overlay shape the proof style, CTA phrasing, FAQ emphasis, tone, and which product surfaces get the most space.
- Match proof execution to these audience proof expectations:
${renderNestedList(audienceOverlay.proofExpectations)}
- Favor this CTA language family unless the archetype demands a tighter variant: ${audienceOverlay.ctaPreference}
- Spend the most product-detail real estate on these focus areas:
${renderNestedList(audienceOverlay.productFocusAreas)}
- Cover these FAQ concerns directly if an FAQ section appears, or answer them in nearby copy if it does not:
${renderNestedList(audienceOverlay.faqConcerns)}
- Adjust the copy tone with these modifiers while staying inside the creative bundle direction:
${renderNestedList(audienceOverlay.preferredToneAdjustments)}
- Treat these archetype sections as mandatory, even if you rename them for better copy fit:
${renderNestedList(homepageArchetype.requiredSections)}
- These sections are optional emphasis levers, not filler. Use them only when they strengthen this variant:
${renderNestedList(homepageArchetype.optionalSections)}
- The section order should respect the archetype narrative order, but the proof weight and CTA phrasing should still reflect the selected audience overlay.

### Design Inspiration Anchors
Use these references for style analysis only:
${renderList(selectedReferences)}

Use these galleries for composition ideas:
${renderList(selectedLibraries)}

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
`;
};
