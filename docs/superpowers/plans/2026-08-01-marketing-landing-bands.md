# Marketing Landing Bands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the always-on beta pricing band and two independently default-off proof bands to the shipped marketing landing page, with complete English/French copy and discriminating tests.

**Architecture:** Keep the current landing route as the single composition point. Add small typed content arrays and three local sections immediately before the existing FAQ. Read the two proof flags from the existing frozen registry and return no section at all when a flag is false.

**Tech Stack:** React 19, TanStack Router `Link`, `react-i18next`, Vitest + Testing Library, Tailwind v4 named Publy design tokens, Vite `import.meta.env` feature flags.

---

### Task 1: Commit the approved design and plan

**Files:**
- Create: `docs/superpowers/specs/2026-08-01-marketing-landing-bands-design.md`
- Create: `docs/superpowers/plans/2026-08-01-marketing-landing-bands.md`

- [x] **Step 1: Write the design and plan**

The design records the fixed handoff copy, the missing-contact-route decision, the render order, the two flag contracts, locale policy, styling policy, and red-green test strategy. This plan records one implementation commit per band.

- [x] **Step 2: Commit only the workflow documents**

Run:

```bash
git add docs/superpowers/specs/2026-08-01-marketing-landing-bands-design.md docs/superpowers/plans/2026-08-01-marketing-landing-bands.md
git commit -m "docs: plan marketing landing bands"
```

Expected: one commit containing only those two documents.

### Task 2: Add the always-on pricing band

**Files:**
- Modify: `apps/front/src/routes/index.tsx`
- Modify: `apps/front/src/routes/index.test.tsx`
- Modify: `apps/front/src/i18n/locales/en/common.json`
- Modify: `apps/front/src/i18n/locales/fr/common.json`

- [ ] **Step 1: Write the failing pricing test**

Add this test before changing production code:

```tsx
test('renders all beta pricing tiers with struck-through prices and signup CTAs', () => {
  const { container } = render(<IndexRoute />);

  expect(screen.getByTestId('landing-pricing')).not.toBeNull();
  expect(screen.getByRole('heading', { name: 'landing-pricing-title' })).not.toBeNull();

  for (const tier of ['studio', 'agency', 'network']) {
    expect(screen.getByTestId('landing-pricing-' + tier)).not.toBeNull();
    expect(
      screen.getByRole('link', { name: 'landing-pricing-' + tier + '-cta' }),
    ).toHaveAttribute('href', '/signup');
  }

  for (const priceKey of [
    'landing-pricing-studio-price',
    'landing-pricing-agency-price',
    'landing-pricing-network-price',
  ]) {
    expect(screen.getByText(priceKey)).toHaveProperty('tagName', 'DEL');
  }

  expect(screen.getAllByText('landing-pricing-beta-note')).toHaveLength(3);
  expect(container.querySelectorAll('del')).toHaveLength(3);
});
```

- [ ] **Step 2: Prove the pricing test is red**

Run:

```bash
eval "$(fnm env)" && fnm use 24 && pnpm --filter front exec vitest run src/routes/index.test.tsx -t "renders all beta pricing tiers"
```

Expected: non-zero exit because `landing-pricing` does not exist.

- [ ] **Step 3: Add typed pricing data and JSX**

Add this data near the existing `FAQ_ITEMS` constant:

```tsx
type PricingTier = {
  id: 'studio' | 'agency' | 'network';
  nameKey: string;
  priceKey: string;
  descriptionKey: string;
  ctaKey: string;
  badgeKey?: string;
};

const PRICING_TIERS: readonly PricingTier[] = [
  {
    id: 'studio',
    nameKey: 'landing-pricing-studio-name',
    priceKey: 'landing-pricing-studio-price',
    descriptionKey: 'landing-pricing-studio-description',
    ctaKey: 'landing-pricing-studio-cta',
  },
  {
    id: 'agency',
    nameKey: 'landing-pricing-agency-name',
    priceKey: 'landing-pricing-agency-price',
    descriptionKey: 'landing-pricing-agency-description',
    ctaKey: 'landing-pricing-agency-cta',
    badgeKey: 'landing-pricing-agency-badge',
  },
  {
    id: 'network',
    nameKey: 'landing-pricing-network-name',
    priceKey: 'landing-pricing-network-price',
    descriptionKey: 'landing-pricing-network-description',
    ctaKey: 'landing-pricing-network-cta',
  },
];
```

Insert this section immediately before the existing FAQ section. The `<del>` element wraps only the price key; the month suffix and beta note are sibling spans:

```tsx
<section data-testid="landing-pricing" className="pt-[clamp(74px,10.5cqw,156px)]">
  <div className="mx-auto max-w-[760px] text-center">
    <h2 className="text-[clamp(32px,4.2cqw,52px)] leading-[1.08] tracking-[-0.035em]">
      {t('landing-pricing-title')}
    </h2>
    <p className="mx-auto mt-4 max-w-[58ch] text-[16px] leading-[1.68] text-(--publy-foreground-secondary)">
      {t('landing-pricing-subtitle')}
    </p>
  </div>
  <div className="mt-8 grid gap-4 md:grid-cols-3">
    {PRICING_TIERS.map((tier) => (
      <article
        key={tier.id}
        data-testid={'landing-pricing-' + tier.id}
        className="flex flex-col rounded-[var(--publy-radius-control)] border border-(--publy-border) bg-(--publy-surface-raised) p-6"
      >
        {tier.badgeKey ? (
          <span className="self-start rounded-[var(--publy-radius-small-control)] border border-(--publy-border) px-2.5 py-1 text-xs font-semibold text-(--publy-foreground-secondary)">
            {t(tier.badgeKey)}
          </span>
        ) : null}
        <h3 className="mt-4 text-[22px] font-semibold tracking-[-0.03em] text-(--publy-foreground)">
          {t(tier.nameKey)}
        </h3>
        <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[34px] font-semibold tracking-[-0.04em] text-(--publy-foreground)">
            <del>{t(tier.priceKey)}</del>
          </span>
          <span className="text-sm text-(--publy-foreground-secondary)">
            {t('landing-pricing-per-month')}
          </span>
          <span className="text-xs text-(--publy-foreground-secondary)">
            {t('landing-pricing-beta-note')}
          </span>
        </div>
        <p className="mt-4 min-h-[78px] text-[15px] leading-[1.65] text-(--publy-foreground-secondary)">
          {t(tier.descriptionKey)}
        </p>
        <Link
          to="/signup"
          className="mt-7 inline-flex h-11 items-center justify-center rounded-[var(--publy-radius-control)] bg-(--publy-foreground) px-5 text-sm font-semibold text-(--publy-background)"
        >
          {t(tier.ctaKey)}
        </Link>
      </article>
    ))}
  </div>
</section>
```

- [ ] **Step 4: Add matching English and French locale keys**

Add these English values:

```json
"landing-pricing-title": "One price per team, not per brand",
"landing-pricing-subtitle": "Placeholder pricing · 14 days free on every plan",
"landing-pricing-studio-name": "Studio",
"landing-pricing-studio-price": "€19",
"landing-pricing-studio-description": "Two brand profiles, three people, one shared calendar.",
"landing-pricing-studio-cta": "Start free",
"landing-pricing-agency-name": "Agency",
"landing-pricing-agency-badge": "Most teams",
"landing-pricing-agency-price": "€59",
"landing-pricing-agency-description": "Ten profiles, per-action permissions and approvals, full history.",
"landing-pricing-agency-cta": "Start free trial",
"landing-pricing-network-name": "Network",
"landing-pricing-network-price": "€149",
"landing-pricing-network-description": "Unlimited profiles, priority support, custom retention.",
"landing-pricing-network-cta": "Talk to us",
"landing-pricing-per-month": "/ month",
"landing-pricing-beta-note": "free while in beta"
```

Add these French values under the same keys:

```json
"landing-pricing-title": "Un prix par équipe, pas par marque",
"landing-pricing-subtitle": "Tarification provisoire · 14 jours gratuits sur chaque formule",
"landing-pricing-studio-name": "Studio",
"landing-pricing-studio-price": "19 €",
"landing-pricing-studio-description": "Deux profils de marque, trois personnes, un calendrier partagé.",
"landing-pricing-studio-cta": "Commencer gratuitement",
"landing-pricing-agency-name": "Agence",
"landing-pricing-agency-badge": "La plupart des équipes",
"landing-pricing-agency-price": "59 €",
"landing-pricing-agency-description": "Dix profils, permissions par action et approbations, historique complet.",
"landing-pricing-agency-cta": "Commencer l'essai gratuit",
"landing-pricing-network-name": "Réseau",
"landing-pricing-network-price": "149 €",
"landing-pricing-network-description": "Profils illimités, support prioritaire, conservation personnalisée.",
"landing-pricing-network-cta": "Nous contacter",
"landing-pricing-per-month": "/ mois",
"landing-pricing-beta-note": "gratuit pendant la bêta"
```

- [ ] **Step 5: Run the focused test, full route test, and commit Band 1**

Run:

```bash
eval "$(fnm env)" && fnm use 24 && pnpm --filter front exec vitest run src/routes/index.test.tsx -t "renders all beta pricing tiers"
eval "$(fnm env)" && fnm use 24 && pnpm --filter front exec vitest run src/routes/index.test.tsx
```

Expected: both commands exit 0. Then commit:

```bash
git add apps/front/src/routes/index.tsx apps/front/src/routes/index.test.tsx apps/front/src/i18n/locales/en/common.json apps/front/src/i18n/locales/fr/common.json
git commit -m "feat(front): add beta pricing band"
```

### Task 3: Add the default-off customer-logo band

**Files:**
- Modify: `apps/front/src/lib/flags.ts`
- Modify: `apps/front/src/routes/index.tsx`
- Modify: `apps/front/src/routes/index.test.tsx`
- Modify: `apps/front/src/i18n/locales/en/common.json`
- Modify: `apps/front/src/i18n/locales/fr/common.json`

- [ ] **Step 1: Add the mutable flag mock and failing off/on tests**

Before the route import, add:

```tsx
const marketingFlags = vi.hoisted(() => ({
  customerLogos: false,
  socialProof: false,
}));

vi.mock('~/lib/flags', () => ({
  get FEATURES() {
    return { marketing: marketingFlags };
  },
}));
```

Reset both properties to false in `beforeEach`, then add:

```tsx
test('does not render customer logos when the flag is off', () => {
  marketingFlags.customerLogos = false;
  render(<IndexRoute />);

  expect(screen.queryByTestId('landing-customer-logos')).toBeNull();
});

test('renders all supplied customer logos when the flag is on', () => {
  marketingFlags.customerLogos = true;
  render(<IndexRoute />);

  expect(screen.getByTestId('landing-customer-logos')).not.toBeNull();
  expect(
    screen.getByRole('heading', { name: 'landing-customer-logos-title' }),
  ).not.toBeNull();

  for (const key of [
    'landing-customer-logo-northbeam',
    'landing-customer-logo-halcyon',
    'landing-customer-logo-fieldnote',
    'landing-customer-logo-studio-mera',
    'landing-customer-logo-orrery',
    'landing-customer-logo-caldera',
  ]) {
    expect(screen.getByText(key)).not.toBeNull();
  }
});
```

- [ ] **Step 2: Prove the on test is red and establish the off-test baseline**

Run each focused test before implementing the band:

```bash
eval "$(fnm env)" && fnm use 24 && pnpm --filter front exec vitest run src/routes/index.test.tsx -t "does not render customer logos"
eval "$(fnm env)" && fnm use 24 && pnpm --filter front exec vitest run src/routes/index.test.tsx -t "renders all supplied customer logos"
```

Expected: the on test exits non-zero because the band is missing. The off test exits 0 against the current page because no band exists yet; after implementation, its flag-off assertion is re-proven by temporarily rendering the band when the flag is false.

- [ ] **Step 3: Add the flag and customer-logo data**

Add this group to the frozen `FEATURES` object:

```ts
marketing: {
  /** Invented customer names stay hidden until real customer proof exists. */
  customerLogos: readFlag('VITE_FEATURE_MARKETING_CUSTOMER_LOGOS', false),
},
```

Add this array near the other landing data:

```tsx
const CUSTOMER_LOGO_KEYS = [
  'landing-customer-logo-northbeam',
  'landing-customer-logo-halcyon',
  'landing-customer-logo-fieldnote',
  'landing-customer-logo-studio-mera',
  'landing-customer-logo-orrery',
  'landing-customer-logo-caldera',
] as const;
```

- [ ] **Step 4: Add conditional JSX and locale values**

Insert before the FAQ, after pricing:

```tsx
{FEATURES.marketing.customerLogos ? (
  <section
    data-testid="landing-customer-logos"
    className="pt-[clamp(52px,7cqw,96px)]"
  >
    <h2 className="mx-auto max-w-[58ch] text-center text-[clamp(22px,2.8cqw,34px)] leading-[1.15] tracking-[-0.03em]">
      {t('landing-customer-logos-title')}
    </h2>
    <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {CUSTOMER_LOGO_KEYS.map((logoKey) => (
        <div
          key={logoKey}
          className="flex min-h-16 items-center justify-center rounded-[var(--publy-radius-small-control)] border border-(--publy-border) bg-(--publy-background) px-4 text-center text-sm font-semibold tracking-[0.02em] text-(--publy-foreground-secondary)"
        >
          {t(logoKey)}
        </div>
      ))}
    </div>
  </section>
) : null}
```

Add English keys for the heading `Trusted by agencies and in-house teams publishing across hundreds of profiles` and names `Northbeam`, `Halcyon`, `Fieldnote`, `Studio Mera`, `Orrery`, and `Caldera`. Add the same keys in French with heading `La confiance des agences et des équipes internes qui publient sur des centaines de profils`; keep all six company names unchanged.

- [ ] **Step 5: Restore, run green tests, and commit Band 2**

After recording a red run with the condition or body deliberately disabled, restore the implementation and run:

```bash
eval "$(fnm env)" && fnm use 24 && pnpm --filter front exec vitest run src/routes/index.test.tsx -t "does not render customer logos"
eval "$(fnm env)" && fnm use 24 && pnpm --filter front exec vitest run src/routes/index.test.tsx -t "renders all supplied customer logos"
eval "$(fnm env)" && fnm use 24 && pnpm --filter front exec vitest run src/routes/index.test.tsx
```

Expected: all three commands exit 0. Commit:

```bash
git add apps/front/src/lib/flags.ts apps/front/src/routes/index.tsx apps/front/src/routes/index.test.tsx apps/front/src/i18n/locales/en/common.json apps/front/src/i18n/locales/fr/common.json
git commit -m "feat(front): gate customer logo proof"
```

### Task 4: Add the separate default-off social-proof stat band

**Files:**
- Modify: `apps/front/src/lib/flags.ts`
- Modify: `apps/front/src/routes/index.tsx`
- Modify: `apps/front/src/routes/index.test.tsx`
- Modify: `apps/front/src/i18n/locales/en/common.json`
- Modify: `apps/front/src/i18n/locales/fr/common.json`

- [ ] **Step 1: Add failing off/on tests**

Add:

```tsx
test('does not render social proof when the flag is off', () => {
  marketingFlags.socialProof = false;
  render(<IndexRoute />);

  expect(screen.queryByTestId('landing-social-proof')).toBeNull();
});

test('renders all social-proof stats when the flag is on', () => {
  marketingFlags.socialProof = true;
  render(<IndexRoute />);

  expect(screen.getByTestId('landing-social-proof')).not.toBeNull();
  for (const key of [
    'landing-social-proof-rating',
    'landing-social-proof-brands',
    'landing-social-proof-setup',
  ]) {
    expect(screen.getByText(key)).not.toBeNull();
  }
});
```

- [ ] **Step 2: Prove the on test is red and establish the off-test baseline**

Run:

```bash
eval "$(fnm env)" && fnm use 24 && pnpm --filter front exec vitest run src/routes/index.test.tsx -t "does not render social proof"
eval "$(fnm env)" && fnm use 24 && pnpm --filter front exec vitest run src/routes/index.test.tsx -t "renders all social-proof stats"
```

Expected: the on test exits non-zero because the social-proof band is not present. The off test exits 0 against the current page; after implementation, temporarily render the band for a false flag to prove that the off assertion discriminates.

- [ ] **Step 3: Add the second flag and stat data**

Add the second entry to the existing `marketing` group:

```ts
/** The rating and setup claim stay hidden until user evidence exists. */
socialProof: readFlag('VITE_FEATURE_MARKETING_SOCIAL_PROOF', false),
```

Add:

```tsx
const SOCIAL_PROOF_KEYS = [
  'landing-social-proof-rating',
  'landing-social-proof-brands',
  'landing-social-proof-setup',
] as const;
```

- [ ] **Step 4: Add conditional JSX and locale values**

Insert before the FAQ, after the logo band:

```tsx
{FEATURES.marketing.socialProof ? (
  <section
    data-testid="landing-social-proof"
    className="pt-[clamp(52px,7cqw,96px)]"
  >
    <div className="grid grid-cols-1 divide-y divide-(--publy-border) border-y border-(--publy-border) sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {SOCIAL_PROOF_KEYS.map((proofKey) => (
        <p
          key={proofKey}
          className="px-6 py-5 text-center text-[15px] font-semibold leading-[1.4] text-(--publy-foreground-secondary)"
        >
          {t(proofKey)}
        </p>
      ))}
    </div>
  </section>
) : null}
```

Add English values `4.9 average rating`, `Teams running 2–40 brands`, and `Set up in an afternoon`. Add French values `Note moyenne de 4,9`, `Des équipes gèrent 2 à 40 marques`, and `Installation en une après-midi`.

- [ ] **Step 5: Restore, run green tests, and commit Band 3**

After recording a red run with the conditional body deliberately disabled, restore it and run:

```bash
eval "$(fnm env)" && fnm use 24 && pnpm --filter front exec vitest run src/routes/index.test.tsx -t "does not render social proof"
eval "$(fnm env)" && fnm use 24 && pnpm --filter front exec vitest run src/routes/index.test.tsx -t "renders all social-proof stats"
eval "$(fnm env)" && fnm use 24 && pnpm --filter front exec vitest run src/routes/index.test.tsx
```

Expected: all three commands exit 0. Commit:

```bash
git add apps/front/src/lib/flags.ts apps/front/src/routes/index.tsx apps/front/src/routes/index.test.tsx apps/front/src/i18n/locales/en/common.json apps/front/src/i18n/locales/fr/common.json
git commit -m "feat(front): gate social proof stats"
```

### Task 5: Verify the final commit and write the report

**Files:**
- Create: `.dump/report.md`

- [ ] **Step 1: Check the committed implementation state**

Run:

```bash
git status --short --branch
git log --oneline -5
```

Expected: the three band commits are present and no implementation file is edited after the final green route test.

- [ ] **Step 2: Run the four required gates separately**

Run each command from the repository root and record its exit code:

```bash
eval "$(fnm env)" && fnm use 24
pnpm --filter front test
pnpm --filter front typecheck
pnpm --filter front build
npx oxlint apps/front/src/lib/flags.ts apps/front/src/routes/index.tsx apps/front/src/routes/index.test.tsx
```

The report must state the actual output-derived exit code for each. It must not claim browser or Playwright verification.

- [ ] **Step 3: Verify locale parity and source constraints**

Run:

```bash
node -e "const fs=require('fs'); const a=Object.keys(JSON.parse(fs.readFileSync('apps/front/src/i18n/locales/en/common.json'))).filter(k=>k.startsWith('landing-')).sort(); const b=Object.keys(JSON.parse(fs.readFileSync('apps/front/src/i18n/locales/fr/common.json'))).filter(k=>k.startsWith('landing-')).sort(); if (JSON.stringify(a)!==JSON.stringify(b)) process.exit(1); console.log('landing locale keys match:', a.length);"
grep -RIn --exclude-dir=node_modules --exclude-dir=.git -E 'rgba\\(|#[0-9A-Fa-f]{3,8}|Array\\.reduce' apps/front/src/routes/index.tsx apps/front/src/routes/index.test.tsx apps/front/src/lib/flags.ts
```

Expected: the parity command exits 0 with matching counts. Interpret the constraint scan by its matches; a no-match `grep` exit of 1 is expected.

- [ ] **Step 4: Write and print `.dump/report.md`**

The report must contain:

- what each band adds and the missing-contact-route decision;
- one red and one green transcript for each new pricing/flag test;
- the four final gate commands and exit codes from the committed state;
- any brief defect discovered;
- every judgment call, including insertion order, French wording, no-new-token styling, and neutral identity handling.

Print it with:

```bash
sed -n '1,320p' .dump/report.md
```

