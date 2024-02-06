import { multiTenantTrigger } from '@/server/lib/parse';

Parse.Cloud.beforeFind(
	'MyClass',
	multiTenantTrigger({
		trigger: async ({ req, t, locale }) => {},
	}),
);
