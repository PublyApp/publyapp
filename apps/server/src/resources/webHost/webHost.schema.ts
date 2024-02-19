import { className } from '@devist/shared/lib/constants';
import type { WebHost } from '@devist/shared/types/db/webHost.types';

import { defineSchema } from '@/server/lib/parse';

const WebHostSchema = defineSchema<WebHost>(className.WEB_HOST, {
	fields: {
		translations: { type: 'Object' },

		logoUrl: { type: 'String' },
		yearEstablished: { type: 'Number' },

		hostingPlans: { type: 'Array' },

		performance: { type: 'Object' },

		customerSupport: { type: 'Object' },

		securityFeatures: { type: 'Object' },

		controlPanel: { type: 'Object' },

		scalabilityAndResources: { type: 'Object' },

		addonsAndExtras: { type: 'Object' },

		refundPolicy: { type: 'Object' },

		userReviews: { type: 'Array' },

		// slug: { type: 'String' },
		// type: { type: 'Array' },
		// freeDomain: { type: 'Boolean' },
		// cPanel: { type: 'Boolean' },
		// customerSupport: { type: 'Number' }, // ? maybe a rating out of Five stars ?
		// bandWidth: { type: 'Number' },
		// storage: { type: 'Number' },
		// translations: { type: 'Object' }, // must contain description etc
		// // Not totally sure yet
		// pricingTag: { type: 'String' }, // entry-level, Mid-Range, High-End, Custom-pricing etc
		// pricing: { type: 'Object' },
		// // Unknown fields  // TODO: experiment these
		// // ssl: {},
		// // backups: {},
		// // emailAccounts: {},
		// // dataCentersLocations: {},
		// // siteBuilder: {},
		// // TODO: fill progressively
	},
});

export default WebHostSchema;
