import {
	applyQueryOptions,
	type QueryOptions,
} from '@/server/lib/parse/query.utils';
import {
	roleSet,
	type IRoleConfig,
	type RoleSet,
} from '@/shared/lib/constants';
import type { IRole } from '@/shared/types/db/role.types';

type RoleServiceProps = {
	sessionToken?: string;
	useMasterKey?: boolean;
};

export default class RoleService {
	sessionToken?: string;

	master?: boolean;

	constructor({ sessionToken, useMasterKey }: RoleServiceProps) {
		this.sessionToken = sessionToken;
		this.master = useMasterKey;
	}

	/**
	 * check if a user has at least one of the given roles
	 */
	async hasRole(user: Parse.User, roles: IRoleConfig[] | RoleSet) {
		const foundRole = await new Parse.Query(Parse.Role)
			.equalTo('users', user)
			.containedIn(
				'code',
				roles.map((config) => {
					return config.code;
				}),
			)
			.first({ sessionToken: this.sessionToken, useMasterKey: this.master });
		return !!foundRole;
	}

	async findRoleByCode(code: string) {
		const roleQuery = new Parse.Query(Parse.Role);
		return roleQuery
			.equalTo('code', code)
			.first({ sessionToken: this.sessionToken, useMasterKey: this.master });
	}

	async findRoleByName(code: string) {
		const roleQuery = new Parse.Query(Parse.Role);
		return roleQuery
			.equalTo('name', code)
			.first({ sessionToken: this.sessionToken, useMasterKey: this.master });
	}

	async assignRoleToUser(user: Parse.User, role: Parse.Role) {
		const relation = role.getUsers();
		relation.add(user);
		return role.save(null, {
			sessionToken: this.sessionToken,
			useMasterKey: this.master,
		});
	}

	async getUserRoles(
		user: Parse.User,
		options?: ({ json?: false } & QueryOptions) | undefined,
	): Promise<Parse.Role[]>;
	async getUserRoles(
		user: Parse.User,
		options: { json: true } & QueryOptions,
	): Promise<IRole[]>;
	async getUserRoles(
		user: Parse.User,
		options: { json?: boolean } & QueryOptions = {},
	) {
		const roleQuery = new Parse.Query(Parse.Role).equalTo('users', user);

		applyQueryOptions(roleQuery, options);

		const roles = await roleQuery.find({
			sessionToken: this.sessionToken,
			useMasterKey: this.master,
		});

		if (!options.json) return roles;

		const rolesJSON = roles.map((role) => {
			return role.toJSON() as unknown as IRole;
		});
		return rolesJSON;
	}

	async isUserStaffMember(user: Parse.User) {
		return this.hasRole(user, roleSet.STAFF_MEMBER);
	}
}
