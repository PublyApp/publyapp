// import { USE_MASTER_KEY } from '@/server/lib/constants';
import type { IRoleConfig, RoleSet } from '@/shared/lib/constants';
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

	async findRoleByCode(code: number) {
		const roleQuery = new Parse.Query(Parse.Role);
		return roleQuery.equalTo('code', code).first({ sessionToken: this.sessionToken, useMasterKey: this.master });
	}

	async assignRoleToUser(user: Parse.User, role: Parse.Role) {
		const relation = role.getUsers();
		relation.add(user);
		return role.save(null, { sessionToken: this.sessionToken, useMasterKey: this.master });
	}

	async getUserRoles(user: Parse.User, json?: false): Promise<Parse.Role[]>;
	async getUserRoles(user: Parse.User, json: true): Promise<IRole[]>;

	// eslint-disable-next-line func-style, prefer-arrow/prefer-arrow-functions
	async getUserRoles(user: Parse.User, json?: boolean) {
		const roleQuery = new Parse.Query(Parse.Role).equalTo('users', user);
		const roles = await roleQuery.find({ sessionToken: this.sessionToken, useMasterKey: this.master });

		if (!json) return roles;

		const rolesJSON = roles.map((role) => {
			return role.toJSON() as unknown as IRole;
		});
		return rolesJSON;
	}
}
