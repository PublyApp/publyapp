import ParseUser from '../user/user.class';

import ParseTenant from './tenant.class';

type Props = {
	sessionToken?: string;
	// headers?: Record<string, unknown>;
};

export default class TenantService {
	sessionToken?: string;

	constructor({ sessionToken /* , headers */ }: Props) {
		this.sessionToken = sessionToken;
		// this.headers = headers;
	}

	async getById(objectId: string, options: { select?: string[]; include?: string[]; exclude?: string[] } = {}) {
		const query = new Parse.Query(ParseTenant).equalTo('objectId', objectId);

		if (options.exclude) {
			query.exclude(options.exclude as never);
		}

		if (options.select) {
			query.select(options.select as never);
		}

		if (options.include) {
			query.include(options.include as never);
		}

		return query.first({ sessionToken: this.sessionToken });
	}

	async isUserMemberOfTenant({ user, tenant }: { user: ParseUser; tenant: ParseTenant }) {
		const foundUser = await new Parse.Query(ParseUser)
			.select([])
			.equalTo('objectId', user.id)
			.equalTo('tenants.tenant', tenant)
			.first({ sessionToken: this.sessionToken });

		return Boolean(foundUser);
	}
}
