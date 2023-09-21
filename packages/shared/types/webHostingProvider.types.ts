import type { BaseAttributes } from 'parse';

import type { AppLocale } from '@shared/i18n/resources';

// const hostingType = {
// 	SHARED_HOSTING: 'SHARED_HOSTING',
// 	C_PANEL: 'C_PANEL',
// 	CLOUD: 'CLOUD',
// };

// export type WebHosting = {
// 	name: string;
// 	slug: string;
// 	type: string[]; // cloud, cpanel, shared hosting, vps, serverless, managed, unmanaged etc
// 	freeDomain: boolean;
// 	cPanel: boolean;
// 	customerSupport: number; // ? maybe a rating out of Five stars ?
// 	bandWidth: number;
// 	storage: number;
// 	translations: Record<string, any>;
// 	// Not totally sure yet
// 	pricingTag: string;
// 	pricing: Record<string, Record<string, any>>;
// 	// reputation
// 	// rating
// 	// popularity
// 	// Unknown fields // TODO: experiment these
// 	// ssl: unknown;
// 	// backups: unknown;
// 	// emailAccounts: unknown;
// 	// dataCentersLocations: unknown;
// 	// siteBuilder: unknown;
// } & BaseAttributes;

// eslint-disable-next-line @typescript-eslint/ban-types
// export type WebHostingFull = WebHosting & {};

export type IWebHostingProvider = {
	translations: Record<
		AppLocale,
		{
			name: string; // Company name
			description: string; // Brief introduction
			headquartersLocation: string; // Headquarters location
			contactDetails: {
				phone: string; // Customer support phone number
				email: string; // Customer support email
				liveChat: boolean; // Is live chat available?
			};
			physicalAddress?: string; // Optional physical address
		}
	>;

	logoUrl: string; // URL to the company's logo
	yearEstablished: number; // Year of establishment

	hostingPlans: {
		id: number; // Unique identifier for each plan
		type: string; // Type of hosting (e.g., shared, VPS, dedicated)
		name: string; // Plan name
		description: string; // Plan description
		price: {
			monthly: number; // Monthly price
			yearly: number; // Yearly price
		};
		features: string[]; // List of features included
		scalabilityOptions: string[]; // List of scalability options
	}[];

	performance: {
		uptimeGuarantee: number; // Uptime guarantee percentage
		serverLocations: string[]; // List of server locations
		speedMetrics?: string; // Server speed and performance metrics
	};

	customerSupport: {
		supportHours: string; // Support hours
		responseTime: string; // Response time
		supportChannels: string[]; // List of support channels
		quality: string; // Customer support quality (gather user reviews)
	};

	securityFeatures: {
		ssl: boolean; // SSL certificate availability
		ddosProtection: boolean; // DDoS protection availability
		backupOptions: string[]; // List of backup and recovery options
		firewall: boolean; // Firewall availability
	};

	controlPanel: {
		available: boolean; // Is a control panel available?
		type?: string; // Type of control panel (e.g., cPanel, Plesk)
		userFriendly: boolean; // Is it user-friendly?
	};

	scalabilityAndResources: {
		scalabilityOptions: string[]; // Scalability options (upgrading/downgrading plans)
		resourceAllocation: {
			cpu: string; // CPU allocation
			ram: string; // RAM allocation
		};
	};

	addonsAndExtras: {
		domainRegistration: boolean; // Domain registration services availability
		websiteBuilder: boolean; // Free website builder availability
		emailHosting: boolean; // Email hosting availability
		cdnIntegration: boolean; // CDN integration availability
	};

	refundPolicy: {
		trialPeriod: string; // Length of the trial period (if any)
		refundTerms: string; // Refund policy and terms
	};

	userReviews: {
		averageRating: number; // Average user rating
		totalReviews: number; // Total number of user reviews
		userFeedback: {
			username: string; // User's username or display name
			rating: number; // User's rating for the provider
			comment: string; // User's comment or feedback
		}[];
	};
} & BaseAttributes;
