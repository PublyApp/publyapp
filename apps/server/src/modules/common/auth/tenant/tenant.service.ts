import _ from "lodash";

// import { USE_MASTER_KEY } from '@/server/lib/constants';
import {
	applyQueryOptions,
	applySkipAndLimit,
	type QueryOptions,
} from "@/server/lib/parse/query.utils";
import {
	className,
	DEFAULT_PAGE_SIZE,
	type TenantSubRoleSet,
} from "@/shared/lib/constants";
import type { ITenant } from "@/shared/types/db/tenant.types";

import type ParseUser from "../user/user.class";

import Parse_CustomJoinUserToTenant from "./$join-user-to-tenant.class";
import ParseTenant from "./tenant.class";

type Props = {
	sessionToken?: string;
	useMasterKey?: boolean;
};

export default class TenantService {
	sessionToken?: string;

	useMasterKey?: boolean;

	constructor({ sessionToken, useMasterKey }: Props) {
		this.sessionToken = sessionToken;
		this.useMasterKey = useMasterKey;
	}

	async getById(
		objectId: string,
		options: { select?: string[]; include?: string[]; exclude?: string[] } = {},
	) {
		const query = new Parse.Query(ParseTenant).equalTo("objectId", objectId);

		applyQueryOptions(query, options);

		return query.first({
			sessionToken: this.sessionToken,
			useMasterKey: this.useMasterKey,
		});
	}

	async isUserMemberOfTenant({
		user,
		tenant,
	}: {
		user: ParseUser;
		tenant: ParseTenant;
	}) {
		const foundRelation = await new Parse.Query(Parse_CustomJoinUserToTenant)
			.select([])
			.equalTo("user", user)
			.equalTo("tenant", tenant)
			.first({
				sessionToken: this.sessionToken,
				useMasterKey: this.useMasterKey,
			});

		return Boolean(foundRelation);
	}

	async findTenantsForUser(
		user: ParseUser,
		options: { page?: number; pageSize?: number; json: true } & QueryOptions,
	): Promise<ITenant[]>;
	async findTenantsForUser(
		user: ParseUser,
		options?:
			| ({
					page?: number;
					pageSize?: number;
					json?: false | undefined;
			  } & QueryOptions)
			| undefined,
	): Promise<ParseTenant[]>;
	async findTenantsForUser(
		user: ParseUser,
		options:
			| ({
					page?: number;
					pageSize?: number;
					json?: boolean | undefined;
			  } & QueryOptions)
			| undefined = {},
	) {
		const query = new Parse.Query(className._CUSTOM_JOIN_USER_TO_TENANT)
			.select(["tenant"])
			.equalTo("user", user);

		applySkipAndLimit(query, {
			type: "page",
			page: options.page ?? 1,
			pageSize: options.pageSize ?? DEFAULT_PAGE_SIZE,
		});
		applyQueryOptions(query, options);

		const relations = await query.find({
			sessionToken: this.sessionToken,
			useMasterKey: this.useMasterKey,
			json: options.json,
		});

		if (options.json) {
			const results: ITenant[] = [];

			(relations as unknown as { tenant?: ITenant }[]).forEach((relation) => {
				const tenant = _.get(relation, "tenant");

				if (tenant) {
					results.push(tenant);
				}
			});

			return results;
		}

		const results: ParseTenant[] = [];

		relations.forEach((relation) => {
			const tenant = relation.get("tenant");

			if (tenant) {
				results.push(tenant);
			}
		});

		return results;
	}

	async findTenant(options: QueryOptions) {
		const query = new Parse.Query(ParseTenant);

		applyQueryOptions(query, options);

		const tenants = await query.find({
			sessionToken: this.sessionToken,
			useMasterKey: this.useMasterKey,
		});
		return tenants;
	}

	async userHasRoleInTenant({
		tenant,
		tenantSubRoles,
		user,
	}: {
		user: ParseUser;
		tenant: ParseTenant;
		tenantSubRoles: TenantSubRoleSet;
	}) {
		const result = new Parse.Query(Parse_CustomJoinUserToTenant)
			.equalTo("tenant", tenant as never)
			.equalTo("user", user as never)
			.containedIn("subRoles", tenantSubRoles as never)
			.select([])
			.first({
				sessionToken: this.sessionToken,
				useMasterKey: this.useMasterKey,
			});

		return !!result;
	}
}
