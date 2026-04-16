#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();
const outputDir = path.join(cwd, 'docs/misc/homepage-factory/generated-prompts');
const bankPath = path.join(cwd, 'scripts/homepage-factory/inspiration-bank.json');

const mulberry32 = (seed) => {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hashSeed = (input) => {
  let hash = 1779033703 ^ input.length;
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return hash >>> 0;
};

const pickOne = (array, random) => {
  const index = Math.floor(random() * array.length);

  return array[index];
};

const pickManyUnique = (array, random, count) => {
  const values = [...array];
  const picks = [];

  while (values.length > 0 && picks.length < count) {
    const index = Math.floor(random() * values.length);
    picks.push(values[index]);
    values.splice(index, 1);
  }

  return picks;
};

const buildPrompt = ({
  index,
  heroStyle,
  layoutAngle,
  motionStyle,
  colorMood,
  copyTone,
  references,
  libraries
}) => {
  return `# Homepage Prompt Variant ${index}\n\n## System Prompt\nYou are an award-winning SaaS design + implementation agent.\n\nDesign bar:\n- The output must look and feel on par with elite multi-million-dollar SaaS websites.\n- Prioritize clarity, visual hierarchy, and conversion impact over decoration.\n- Every section should feel purposeful, premium, and production-ready.\n\nExecution rules:\n- Build a complete homepage in React + TypeScript + MUI v6 (componentized, clean, and accessible).\n- Use only MUI primitives/components and sx styling.\n- Maintain AA contrast and robust responsive behavior from 320px to 1536px+.\n- Create polished micro-interactions (hover/focus/scroll reveal) without hurting performance.\n- Use semantic sectioning and production-quality copy placeholders.\n\nSkill augmentation:\n1. First, inspect "https://skills.sh/" and install/apply the strongest web design skill(s), especially:\n   - "frontend-design"\n   - "web-design-guidelines"\n2. Then inspect/apply Hue from "https://github.com/dominikmartn/hue" for elevated color direction.\n3. Explicitly mention in your reasoning which skill techniques you applied.\n\nOutput requirements:\n- Provide a short design rationale (2-5 bullets).\n- Provide the full homepage implementation.\n- Provide a brief quality checklist that confirms accessibility, responsiveness, and performance posture.\n\n## User Prompt\nCreate homepage concept variant ${index} for **PublyApp** (AI-first social publishing SaaS).\n\n### Creative Direction\n- Hero style: **${heroStyle}**\n- Layout angle: **${layoutAngle}**\n- Motion style: **${motionStyle}**\n- Color mood: **${colorMood}**\n- Copy tone: **${copyTone}**\n\n### Brand & Product Context\n- Product: PublyApp\n- Tagline direction: "Ship better social content, faster, with AI workflows."\n- Audience: SMB marketing teams, agencies, and in-house social managers\n- Positioning: Operationally serious, modern, trust-inspiring, AI-enabled\n\n### Must-have Sections\n1. Hero (headline, subheadline, dual CTAs, product visual)\n2. Logo/social proof strip\n3. Core benefits (3-6 cards)\n4. Product walkthrough (step-by-step or visual story)\n5. Feature depth grid\n6. Testimonials / proof metrics\n7. Pricing teaser or comparison\n8. FAQ\n9. Final CTA\n10. Premium footer\n\n### Design Inspiration Anchors\nUse these references for style analysis only (do not clone):\n${references.map((reference) => `- ${reference}`).join('\n')}\n\nAnd pull extra composition ideas from:\n${libraries.map((library) => `- ${library}`).join('\n')}\n\n### Constraints\n- Do not create generic template output; enforce a distinct visual identity.\n- Keep interactions subtle and premium, not gimmicky.\n- All text should sound like a top-tier B2B SaaS product.\n- Ensure this variant is materially different from other variants in layout and art direction.\n`;
};

const run = async () => {
  const variantsArg = process.argv[2] ?? '24';
  const seedArg = process.argv[3] ?? new Date().toISOString().slice(0, 10);
  const variants = Number.parseInt(variantsArg, 10);

  if (!Number.isInteger(variants) || variants <= 0 || variants > 200) {
    throw new Error('Variants must be an integer between 1 and 200.');
  }

  const bankRaw = await readFile(bankPath, 'utf8');
  const bank = JSON.parse(bankRaw);

  await mkdir(outputDir, { recursive: true });

  const manifest = [];

  for (let variant = 1; variant <= variants; variant += 1) {
    const currentSeed = hashSeed(`${seedArg}-${variant}`);
    const random = mulberry32(currentSeed);

    const heroStyle = pickOne(bank.heroStyles, random);
    const layoutAngle = pickOne(bank.layoutAngles, random);
    const motionStyle = pickOne(bank.motionStyles, random);
    const colorMood = pickOne(bank.colorMoods, random);
    const copyTone = pickOne(bank.copyTones, random);
    const references = pickManyUnique(bank.trustedReferences, random, 4);
    const libraries = pickManyUnique(bank.inspirationLibraries, random, 2);

    const prompt = buildPrompt({
      index: variant,
      heroStyle,
      layoutAngle,
      motionStyle,
      colorMood,
      copyTone,
      references,
      libraries
    });

    const fileName = `${String(variant).padStart(3, '0')}-homepage-prompt.md`;
    const filePath = path.join(outputDir, fileName);

    await writeFile(filePath, prompt, 'utf8');

    manifest.push({
      variant,
      fileName,
      seed: `${seedArg}-${variant}`,
      heroStyle,
      layoutAngle,
      motionStyle,
      colorMood,
      copyTone
    });
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  process.stdout.write(
    `Generated ${variants} homepage prompts in ${path.relative(cwd, outputDir)}\n`
  );
};

run().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
