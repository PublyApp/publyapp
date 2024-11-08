import { applySkipAndLimit } from '@/server/lib/parse/utils';
import { DEFAULT_PAGE_SIZE } from '@/shared/lib/constants';
import type { ITenant } from '@/shared/types/db/tenant.types';

import type ParseUser from '../user/user.class';

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
		// const foundUser = await new Parse.Query(ParseUser)
		// 	.select([])
		// 	.equalTo('objectId', user.id)
		// 	.equalTo('tenants.tenant', tenant)
		// 	.first({ sessionToken: this.sessionToken });
		const foundTenant = new Parse.Query(ParseTenant)
			.select([])
			.equalTo('objectId', tenant.id)
			.equalTo('users.user' as never, user as never)
			.first({ sessionToken: this.sessionToken });

		return Boolean(foundTenant);
	}

	async findTenantsForUser(
		user: ParseUser,
		options: { page?: number; pageSize?: number; json: true },
	): Promise<ITenant[]>;
	async findTenantsForUser(
		user: ParseUser,
		options?: { page?: number; pageSize?: number; json?: false | undefined } | undefined,
	): Promise<ParseTenant[]>;
	async findTenantsForUser(
		user: ParseUser,
		{
			page = 0,
			pageSize = DEFAULT_PAGE_SIZE,
			json = false,
		}: { page?: number; pageSize?: number; json?: boolean | undefined } | undefined = {},
	) {
		const query = new Parse.Query(ParseTenant).select(['name']).equalTo('users.user' as never, user as never);

		applySkipAndLimit(query, { type: 'page', page, pageSize });

		const tenants = await query.find({ sessionToken: this.sessionToken, json });

		if (json) {
			return tenants as unknown as ITenant[];
		}

		return tenants;
	}
}
