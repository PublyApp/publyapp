const renderList = (items) => {
  return items.map((item) => `- ${item}`).join('\n');
};

const renderNestedList = (items) => {
  return items.map((item) => `  - ${item}`).join('\n');
};

export const buildHomepagePrompt = ({
  variant,
  productCore,
  audienceOverlay,
  homepageArchetype,
  promiseAngle,
  proofStrategy,
  creativeBundle,
  selectedReferences,
  selectedLibraries,
}) => {
  return `# Homepage Prompt Variant ${variant}

## Variant Metadata
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
- Proof must match the selected audience and archetype.
- Product visuals must show a believable social publishing workflow.
- Avoid verbs like "streamline", "optimize", and "unlock" unless tied to a concrete outcome.

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

### Archetype Brief
- Hero goal: ${homepageArchetype.heroGoal}
- Narrative order:
${renderNestedList(homepageArchetype.narrativeOrder)}
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

### Strategy Inputs
- Core promise: ${promiseAngle.corePromise}
- Headline direction: ${promiseAngle.headlineDirection}
- Supporting message themes:
${renderNestedList(promiseAngle.supportingMessageThemes)}
- Proof type: ${proofStrategy.proofType}
- Recommended proof elements:
${renderNestedList(proofStrategy.recommendedProofElements)}
- Proof placement guidance: ${proofStrategy.proofPlacementGuidance}

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
