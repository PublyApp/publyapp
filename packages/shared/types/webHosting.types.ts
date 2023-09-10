import { BaseAttributes } from 'parse';

// const hostingType = {
// 	SHARED_HOSTING: 'SHARED_HOSTING',
// 	C_PANEL: 'C_PANEL',
// 	CLOUD: 'CLOUD',
// };

export type WebHosting = {
	name: string;
	slug: string;
	type: string[]; // cloud, cpanel, shared hosting, vps, serverless, managed, unmanaged etc
	freeDomain: boolean;
	cPanel: boolean;
	customerSupport: number; // ? maybe a rating out of Five stars ?
	bandWidth: number;
	storage: number;
	translations: Record<string, any>;
	// Not totally sure yet
	pricingTag: string;
	pricing: Record<string, Record<string, any>>;
	// reputation
	// rating
	// popularity
	// Unknown fields // TODO: experiment these
	// ssl: unknown;
	// backups: unknown;
	// emailAccounts: unknown;
	// dataCentersLocations: unknown;
	// siteBuilder: unknown;
} & BaseAttributes;

// eslint-disable-next-line @typescript-eslint/ban-types
export type WebHostingFull = WebHosting & {};
