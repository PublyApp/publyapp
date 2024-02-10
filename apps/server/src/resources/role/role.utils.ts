import { USE_MASTER_KEY } from '@/server/lib/constants';
import type { IRoleConfig } from '@/shared/lib/constants';

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
}
