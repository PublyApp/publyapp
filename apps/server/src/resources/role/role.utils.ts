import { USE_MASTER_KEY } from '@/server/lib/constants';
import type { IRoleConfig } from '@/shared/lib/constants';
import type { IRole } from '@/shared/types/db/role.types';

export default class RoleUtils {
	static async hasRole(user: Parse.User, roles: IRoleConfig[]) {
		const foundRole = await new Parse.Query(Parse.Role)
			.equalTo('users', user)
			.containedIn(
				'code',
				roles.map((config) => {
					return config.code;
				}),
			)
			.first(USE_MASTER_KEY);
		return !!foundRole;
	}

	static async findRoleByCode(code: number, useMasterKey = false) {
		const roleQuery = new Parse.Query(Parse.Role);
		return roleQuery.equalTo('code', code).first({ useMasterKey });
	}

	static async assignRoleToUser(user: Parse.User, role: Parse.Role, useMasterKey = false) {
		const relation = role.getUsers();
		relation.add(user);
		return role.save(null, { useMasterKey });
	}

	static async getUserRoles(user: Parse.User, toJSON?: false): Promise<Parse.Role[]>;
	static async getUserRoles(user: Parse.User, toJSON: true): Promise<IRole[]>;

	// eslint-disable-next-line func-style, prefer-arrow/prefer-arrow-functions
	static async getUserRoles(user: Parse.User, toJSON?: boolean) {
		const roleQuery = new Parse.Query(Parse.Role).equalTo('users', user);
		const roles = await roleQuery.find();

		if (!toJSON) return roles;

		const rolesJSON = roles.map((role) => {
			return role.toJSON() as unknown as IRole;
		});
		return rolesJSON;
	}
}
