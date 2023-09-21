import { SchemaMigrations } from 'parse-server';

import { WebHosting } from '@devist/shared/types/webHosting.types';
import { className } from '@devist/shared/utils/constants';

const WebHostingSchema = SchemaMigrations.makeSchema<WebHosting>(className.WEB_HOSTING, {
	fields: {
		name: { type: 'String' }, // or name
		slug: { type: 'String' },
		type: { type: 'Array' },
		freeDomain: { type: 'Boolean' },
		cPanel: { type: 'Boolean' },
		customerSupport: { type: 'Number' }, // ? maybe a rating out of Five stars ?
		bandWidth: { type: 'Number' },
		storage: { type: 'Number' },
		translations: { type: 'Object' }, // must contain description etc
		// Not totally sure yet
		pricingTag: { type: 'String' }, // entry-level, Mid-Range, High-End, Custom-pricing etc
		pricing: { type: 'Object' },
		// Unknown fields  // TODO: experiment these
		// ssl: {},
		// backups: {},
		// emailAccounts: {},
		// dataCentersLocations: {},
		// siteBuilder: {},
		// TODO: fill progressively
	},
	classLevelPermissions: {
		find: {
			'*': true,
		},
		get: {
			'*': true,
		},
		create: {
			requiresAuthentication: true,
		},
		update: {
			requiresAuthentication: true,
		},
	},
	indexes: {},
});

export default WebHostingSchema;
