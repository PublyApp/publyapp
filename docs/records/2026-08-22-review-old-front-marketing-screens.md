Status: Archived
Original location: docs/old-front/screens/marketing.md
Archive reason: Retired apps/old-front on 2026-08-22; reference preserved before deletion (tag old-front-final).
Superseded by: none

# Marketing surfaces (old-front)

> Source: `apps/old-front/src/routes/marketing/**` + `_data/*` + `_components/*`. Flag-guarded pages annotated. No design opinions.

## Routes

| Path | File | Flag | Notes |
|---|---|---|---|
| / | home/home-page.tsx | — | hero, logos, features, onboarding, pricing teaser, FAQ, CTA |
| /pricing | pricing/pricing-page.tsx | — | billing toggle (monthly/annually), tiers, comparison matrix, FAQ |
| /terms | terms/terms-page.tsx | — | legal doc with TOC |
| /privacy | privacy/privacy-page.tsx | — | legal doc |
| /cookies | cookies/cookies-page.tsx | — | cookie inventory table |
| /about | about/about-page.tsx | marketing.about=true | company values + team grid (12 members, Unsplash placeholders) |
| /contact | contact/contact-page.tsx | marketing.contact=true | form + direct contacts + SLA + FAQs |
| /security | security/security-page.tsx | marketing.security=true | trust badges + pillars + DPO |
| /blog | blog/blog-index-page.tsx | marketing.blog=true | tag filter, featured slot |
| /blog/:slug | blog/blog-article-route.tsx | marketing.blog=true | coverType (above-title/split/editorial/cinematic), related posts |
| /changelog | changelog-redirect-route.tsx | marketing.changelog=true | redirect to /changelog/:year |
| /changelog/:year | changelog/changelog-page.tsx | marketing.changelog=true | year chips, entry list |
| /* | _errors/marketing-not-found-page.tsx | — | catch-all 404 |

## Components

- `_components/billing-cycle-toggle.tsx` — monthly/annually switch
- `_components/blog-*.tsx` — article page, card, content elements (code, headings, image blocks)
- `_components/changelog-*.tsx` — entry, stats, subscribe band, year chips
- `_components/content-band.tsx`, `cta-band.tsx`, `marketing-hero.tsx`, `marketing-eyebrow.tsx`, `marketing-faq-accordion.tsx`
- `_components/pricing-tier-card.tsx` — tier pricing display
- `_components/legal-doc-page.tsx` — TOC + section ids (COOKIES_SECTION_IDS, PRIVACY_SECTION_IDS, TERMS_SECTION_IDS)
- `_data/pricing.ts` — TIERS (creator 19/15, scale 49/39, enterprise custom), COMPARISON_MATRIX (6 categories), PRICING_FAQS (5)
- `_data/blog.ts` — BLOG_POSTS (13, 3 unpublished), BLOG_TAGS (product/engineering/growth/ops), cover types
- `_data/about.ts` — COMPANY_VALUES (4), TEAM_MEMBERS (12)
- `_data/contact.ts` — CONTACT_CHANNELS (support/sales/press), SUPPORT_TIERS (3), CONTACT_TOPICS, CONTACT_FAQS (4)
- `_data/security.ts` — TRUST_BADGES (SOC2/GDPR/CCPA/ISO27001), SECURITY_PILLARS
- `_data/changelog.tsx` — CHANGELOG_ENTRIES grouped by year
- `_data/legal-*.ts` — TOC ids for terms/privacy/cookies + inventory rows

## Fields / columns / actions

- Contact form — fields: name, email, topic (select: general/sales/support/press), message (textarea). Submit -> no API; placeholder (toast). States: empty (pristine), validation errors (zod), success toast.
- Pricing — no form; billing toggle is local state only. CTA hrefs: signup or mailto:sales@publyapp.com. Comparison matrix rendered as table.
- Blog index — tag pill filter (all + 4 tags). Empty states: when getPublishedPosts() returns [] or filtered tag empty. Article route: 404 if slug not found or post unpublished.
- Changelog — year param + chips; invalid year -> redirect/404.
- Legal docs — anchor-linked TOC, no actions.

## Validation (zod) — contact form (verbatim)

```ts
// apps/old-front/src/routes/marketing/contact/_parts/contact-form.tsx — verbatim
const ContactFormSchema = z.object({
  name: z.string().min(1, 'Required').max(120),
  email: z.string().email('Invalid email address'),
  topic: z.enum(['general','sales','support','press'] as const satisfies readonly ContactTopic['value'][]),
  message: z.string().min(20, 'Tell us a bit more (at least 20 characters)').max(2000),
});
type ContactFormValues = z.infer<typeof ContactFormSchema>;
 // onSubmit: window.location.href = buildMailtoUrl(values)  -> mailto:CONTACT_EMAIL?subject=[topic] name&body=...
```

## Feature flags

```ts
import { deepFreeze } from '@org/shared-ts/utils/any.utils';

// Centralized feature-flag registry. Flags are static config with optional
// Vite env-var overrides (VITE_FEATURE_*). Read at module load — no runtime
// service. Both route registration AND link visibility consume the same flag,
// so one flip in this file (or via env var) toggles the page entirely.
//
// To flip a flag without redeploying: set the corresponding VITE_FEATURE_*
// env var (e.g. in .env.production) and rebuild.

const readFlag = (envKey: string, defaultValue: boolean): boolean => {
	const raw = import.meta.env[envKey];
	if (raw === 'true') {
		return true;
	}
	if (raw === 'false') {
		return false;
	}
	return defaultValue;
};

export const FEATURES = deepFreeze({
	marketing: {
		// Phase 3 supporting pages — built but not all needed at launch
		about: readFlag('VITE_FEATURE_MARKETING_ABOUT', true),
		contact: readFlag('VITE_FEATURE_MARKETING_CONTACT', true),
		security: readFlag('VITE_FEATURE_MARKETING_SECURITY', true),
		// Path segments only — pages not built yet, footer links 404 to
		// MarketingNotFoundPage when enabled
		blog: readFlag('VITE_FEATURE_MARKETING_BLOG', true),
		changelog: readFlag('VITE_FEATURE_MARKETING_CHANGELOG', true),
		// Phase 5 changelog secondary surfaces — default OFF, opt-in once
		// real data / signup endpoint exist
		changelogStats: readFlag('VITE_FEATURE_MARKETING_CHANGELOG_STATS', false),
		changelogSubscribe: readFlag(
			'VITE_FEATURE_MARKETING_CHANGELOG_SUBSCRIBE',
			false,
		),
		// Topbar language switcher — default OFF until additional locales
		// ship for the marketing surface. Flipping this back on re-shows
		// the flag-icon popover in the marketing topbar.
		languageSwitcher: readFlag(
			'VITE_FEATURE_MARKETING_LANGUAGE_SWITCHER',
			false,
		),
		integrations: readFlag('VITE_FEATURE_MARKETING_INTEGRATIONS', true),
		help: readFlag('VITE_FEATURE_MARKETING_HELP', true),
		community: readFlag('VITE_FEATURE_MARKETING_COMMUNITY', true),
	},
	staff: {
		tenants: {
			details: {
				billing: readFlag('VITE_FEATURE_STAFF_TENANT_BILLING', false),
				activity: readFlag('VITE_FEATURE_STAFF_TENANT_ACTIVITY', false),
				usage: readFlag('VITE_FEATURE_STAFF_TENANT_USAGE', false),
			},
		},
	},
	tenant: {
		settings: {
			members: readFlag('VITE_FEATURE_TENANT_SETTINGS_MEMBERS', false),
			roles: readFlag('VITE_FEATURE_TENANT_SETTINGS_ROLES', false),
			workspaces: readFlag('VITE_FEATURE_TENANT_SETTINGS_WORKSPACES', false),
			integrations: readFlag(
				'VITE_FEATURE_TENANT_SETTINGS_INTEGRATIONS',
				false,
			),
			billing: readFlag('VITE_FEATURE_TENANT_SETTINGS_BILLING', false),
			security: readFlag('VITE_FEATURE_TENANT_SETTINGS_SECURITY', false),
		},
	},
});

```

## States

- Loading: none (static). Blog/changelog data is in-memory static arrays.
- Empty: blog tag with no published posts; changelog year with no entries.
- Error: catch-all 404 marketing-not-found-page.
