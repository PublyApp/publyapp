export async function findRoleByCode(code: number, useMasterKey = false) {
	const roleQuery = new Parse.Query(Parse.Role);
	return roleQuery.equalTo('code', code).first({ useMasterKey });
}

export const assignRoleToUser = async (user: Parse.User, role: Parse.Role, useMasterKey = false) => {
	const relation = role.getUsers();
	relation.add(user);
	return role.save(null, { useMasterKey });
};
