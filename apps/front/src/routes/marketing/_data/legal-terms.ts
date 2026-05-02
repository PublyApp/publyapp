import type { TocItem } from '#app/routes/marketing/_components/legal-doc-page.tsx';

// ----------------------------------------------------------------------

export const TERMS_LAST_UPDATED = '2026-05-02'; // ISO date

// One entry per h2 in document order. The page imports this and uses
// each value as the `id` on its corresponding <Typography component="h2" id={...}>.
export const TERMS_SECTION_IDS = {
	acceptance: 'acceptance-of-terms',
	accountRegistration: 'account-registration',
	acceptableUse: 'acceptable-use',
	billing: 'subscription-and-billing',
	intellectualProperty: 'intellectual-property',
	userContent: 'user-content',
	termination: 'termination',
	disclaimers: 'disclaimers-and-limitations',
	changes: 'changes-to-terms',
	contact: 'contact',
} as const;

export const TERMS_TOC: TocItem[] = [
	{ id: TERMS_SECTION_IDS.acceptance, label: 'Acceptance of Terms' },
	{ id: TERMS_SECTION_IDS.accountRegistration, label: 'Account Registration' },
	{ id: TERMS_SECTION_IDS.acceptableUse, label: 'Acceptable Use' },
	{ id: TERMS_SECTION_IDS.billing, label: 'Subscription and Billing' },
	{
		id: TERMS_SECTION_IDS.intellectualProperty,
		label: 'Intellectual Property',
	},
	{ id: TERMS_SECTION_IDS.userContent, label: 'User Content' },
	{ id: TERMS_SECTION_IDS.termination, label: 'Termination' },
	{ id: TERMS_SECTION_IDS.disclaimers, label: 'Disclaimers and Limitations' },
	{ id: TERMS_SECTION_IDS.changes, label: 'Changes to Terms' },
	{ id: TERMS_SECTION_IDS.contact, label: 'Contact' },
];
