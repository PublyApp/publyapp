import _ from 'lodash';

import { applyQueryOptions, applySkipAndLimit } from '@/server/lib/parse/utils';
import { className, DEFAULT_PAGE_SIZE } from '@/shared/lib/constants';
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

		applyQueryOptions(query, options);

		return query.first({ sessionToken: this.sessionToken });
	}

	async isUserMemberOfTenant({ user, tenant }: { user: ParseUser; tenant: ParseTenant }) {
		const foundTenant = await new Parse.Query(className.$JOIN_USER_TO_TENANT)
			.select([])
			.equalTo('user', user)
			.equalTo('tenant', tenant)
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
		const query = new Parse.Query(className.$JOIN_USER_TO_TENANT).select(['tenant']).equalTo('user', user);

		applySkipAndLimit(query, { type: 'page', page, pageSize });

		const relations = await query.find({ sessionToken: this.sessionToken, json });

		if (json) {
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
}
