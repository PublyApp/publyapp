import type { IconifyName } from '#app/components/iconify/register-icons.ts';

// ----------------------------------------------------------------------

export const SECURITY_CONTACT_EMAIL = 'security@publyapp.com';

// ----------------------------------------------------------------------

export type TrustBadge = {
	id: string;
	label: string;
	description: string;
	icon: IconifyName;
};

export const TRUST_BADGES: TrustBadge[] = [
	{
		id: 'soc2',
		label: 'SOC 2 Type II',
		description: 'Audited annually by independent third parties',
		icon: 'ph:file-text-bold',
	},
	{
		id: 'gdpr',
		label: 'GDPR Ready',
		description: 'EU privacy regulation compliant',
		icon: 'ph:shield-check-bold',
	},
	{
		id: 'ccpa',
		label: 'CCPA Compliant',
		description: 'California consumer privacy rights',
		icon: 'ph:check-circle-bold',
	},
	{
		id: 'iso27001',
		label: 'ISO 27001',
		description: 'Information security management standard',
		icon: 'ph:lock-bold',
	},
];

// ----------------------------------------------------------------------

export type SecurityPillar = {
	id: string;
	title: string;
	body: string;
	icon: IconifyName;
};

export const SECURITY_PILLARS: SecurityPillar[] = [
	{
		id: 'encryption-transit',
		title: 'Encryption in transit (TLS 1.3)',
		body: 'All data exchanged between your browser and our servers travels through industry-standard encrypted channels. Zero plaintext, zero exceptions.',
		icon: 'ph:lock-key-bold',
	},
	{
		id: 'encryption-rest',
		title: 'Encryption at rest (AES-256)',
		body: 'Every byte stored on our infrastructure is encrypted using AES-256 cipher suites. Backups inherit the exact same structural protection.',
		icon: 'ph:database-bold',
	},
	{
		id: 'sso',
		title: 'Single sign-on (SAML/OIDC)',
		body: 'Enterprise customers can enforce federated identity through their existing IdP — Okta, Azure AD, or Google Workspace.',
		icon: 'ph:key-bold',
	},
	{
		id: 'rbac',
		title: 'Granular role-based access',
		body: 'Define exactly who can read, write, approve, or publish across your team. Permissions cascade automatically from workspace to individual.',
		icon: 'ph:users-three-bold',
	},
	{
		id: 'audit-logging',
		title: 'Audit logging',
		body: 'Every privileged action is timestamped and stored in immutable logs. Export natively to your SIEM via webhook or scheduled S3 batch dumps.',
		icon: 'ph:clipboard-text-bold',
	},
	{
		id: 'data-residency',
		title: 'Regional data residency',
		body: 'Control exactly where your data lives physically: US East, EU Frankfurt, or AU Sydney. We process and store strictly within your jurisdiction.',
		icon: 'ph:globe-bold',
	},
];

// ----------------------------------------------------------------------

export type SubProcessor = {
	id: string;
	vendor: string;
	purpose: string;
	region: string;
};

export const SUB_PROCESSORS: SubProcessor[] = [
	{
		id: 'aws',
		vendor: 'Amazon Web Services (AWS)',
		purpose: 'Cloud infrastructure, hosting, and logical storage',
		region: 'US / EU Frankfurt',
	},
	{
		id: 'stripe',
		vendor: 'Stripe',
		purpose: 'Payment processing and subscription billing',
		region: 'US',
	},
	{
		id: 'sendgrid',
		vendor: 'SendGrid',
		purpose: 'Transactional and system email delivery',
		region: 'US',
	},
	{
		id: 'cloudflare',
		vendor: 'Cloudflare',
		purpose: 'Edge routing, DDoS protection, Web Application Firewall (WAF)',
		region: 'Global Edge',
	},
	{
		id: 'datadog',
		vendor: 'Datadog',
		purpose:
			'Platform observability, logging, and application performance (APM)',
		region: 'US',
	},
	{
		id: 'sentry',
		vendor: 'Sentry',
		purpose: 'Application error tracking and incident diagnostics',
		region: 'US',
	},
];
