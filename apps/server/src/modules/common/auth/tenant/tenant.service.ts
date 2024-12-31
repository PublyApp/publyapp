import _ from 'lodash';

import { USE_MASTER_KEY } from '@/server/lib/constants';
import { applyQueryOptions, applySkipAndLimit, type QueryOptions } from '@/server/lib/parse/query.utils';
import { className, DEFAULT_PAGE_SIZE } from '@/shared/lib/constants';
import type { ITenant } from '@/shared/types/db/tenant.types';

import type ParseUser from '../user/user.class';

import Parse_CustomJoinUserToTenant from './$join-user-to-tenant.class';
import ParseTenant from './tenant.class';

type Props = {
	sessionToken?: string;
};

export default class TenantService {
	sessionToken?: string;

	constructor({ sessionToken }: Props) {
		this.sessionToken = sessionToken;
	}

	async getById(objectId: string, options: { select?: string[]; include?: string[]; exclude?: string[] } = {}) {
		const query = new Parse.Query(ParseTenant).equalTo('objectId', objectId);

		applyQueryOptions(query, options);

		return query.first({ sessionToken: this.sessionToken });
	}

	static async isUserMemberOfTenant({ user, tenant }: { user: ParseUser; tenant: ParseTenant }) {
		const foundTenant = await new Parse.Query(Parse_CustomJoinUserToTenant)
			.select([])
			.equalTo('user', user)
			.equalTo('tenant', tenant)
			.first(USE_MASTER_KEY);

		return Boolean(foundTenant);
	}

	async findTenantsForUser(
		user: ParseUser,
		options: { page?: number; pageSize?: number; json: true } & QueryOptions,
	): Promise<ITenant[]>;
	async findTenantsForUser(
		user: ParseUser,
		options?: ({ page?: number; pageSize?: number; json?: false | undefined } & QueryOptions) | undefined,
	): Promise<ParseTenant[]>;
	async findTenantsForUser(
		user: ParseUser,
		options: ({ page?: number; pageSize?: number; json?: boolean | undefined } & QueryOptions) | undefined = {},
	) {
		const query = new Parse.Query(className._CUSTOM_JOIN_USER_TO_TENANT).select(['tenant']).equalTo('user', user);

		applySkipAndLimit(query, {
			type: 'page',
			page: options.page ?? 1,
			pageSize: options.pageSize ?? DEFAULT_PAGE_SIZE,
		});
		applyQueryOptions(query, options);

		const relations = await query.find({ sessionToken: this.sessionToken, json: options.json });

		if (options.json) {
			const results: ITenant[] = [];

			(relations as unknown as { tenant?: ITenant }[]).forEach((relation) => {
				const tenant = _.get(relation, 'tenant');

				if (tenant) {
					results.push(tenant);
				}
			});

			return results;
		}

		const results: ParseTenant[] = [];

		relations.forEach((relation) => {
			const tenant = relation.get('tenant');

			if (tenant) {
				results.push(tenant);
			}
		});

		return results;
	}

	async findTenant(options: QueryOptions) {
		const query = new Parse.Query(ParseTenant);

		applyQueryOptions(query, options);

		const tenants = await query.find({ sessionToken: this.sessionToken });
		return tenants;
	}
}
