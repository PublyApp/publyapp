import type { TocItem } from '#app/routes/marketing/_components/legal-doc-page.tsx';

// ----------------------------------------------------------------------

export const PRIVACY_LAST_UPDATED = '2026-05-02'; // ISO date

// One entry per h2 in document order. The page imports this and uses
// each value as the `id` on its corresponding <Typography component="h2" id={...}>.
export const PRIVACY_SECTION_IDS = {
	whatWeCollect: 'collection',
	howWeUseYourData: 'use',
	dataSharingAndThirdParties: 'sharing',
	cookiesAndTracking: 'cookies',
	dataRetention: 'retention',
	yourRights: 'rights',
	internationalTransfers: 'transfers',
	childrensPrivacy: 'children',
	securityMeasures: 'security',
	changesToThisPolicy: 'changes',
	contactOurDpo: 'contact',
} as const;

export const PRIVACY_TOC: TocItem[] = [
	{ id: PRIVACY_SECTION_IDS.whatWeCollect, label: '1. What We Collect' },
	{
		id: PRIVACY_SECTION_IDS.howWeUseYourData,
		label: '2. How We Use Your Data',
	},
	{
		id: PRIVACY_SECTION_IDS.dataSharingAndThirdParties,
		label: '3. Data Sharing and Third Parties',
	},
	{
		id: PRIVACY_SECTION_IDS.cookiesAndTracking,
		label: '4. Cookies and Tracking',
	},
	{ id: PRIVACY_SECTION_IDS.dataRetention, label: '5. Data Retention' },
	{ id: PRIVACY_SECTION_IDS.yourRights, label: '6. Your Rights (GDPR/CCPA)' },
	{
		id: PRIVACY_SECTION_IDS.internationalTransfers,
		label: '7. International Transfers',
	},
	{ id: PRIVACY_SECTION_IDS.childrensPrivacy, label: "8. Children's Privacy" },
	{ id: PRIVACY_SECTION_IDS.securityMeasures, label: '9. Security Measures' },
	{
		id: PRIVACY_SECTION_IDS.changesToThisPolicy,
		label: '10. Changes to This Policy',
	},
	{ id: PRIVACY_SECTION_IDS.contactOurDpo, label: '11. Contact Our DPO' },
];
