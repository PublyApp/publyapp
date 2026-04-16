export const buildHomepagePrompt = ({
  variant,
  audienceOverlay,
  homepageArchetype,
  promiseAngle,
  proofStrategy,
  creativeBundle,
}) => {
  return `# Homepage Prompt Variant ${variant}

## Variant Metadata
- Primary audience: **${audienceOverlay.audienceLabel}**
- Homepage archetype: **${homepageArchetype.label}**
- Promise angle: **${promiseAngle.label}**
- Proof strategy: **${proofStrategy.label}**
- Creative bundle: **${creativeBundle.label}**
`;
};
