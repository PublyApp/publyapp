/* eslint-disable no-continue */
/* eslint-disable no-await-in-loop */

import { RolesEnum } from '@aktiveo/shared/utils/constants';

export const createRolesIfNotExist = async () => {
	const roleEntries = Object.entries(RolesEnum).filter((e) => {
		return Number.isNaN(Number(e[0]));
	}) as [string, number][];

	// eslint-disable-next-line no-restricted-syntax
	for (const entry of roleEntries) {
		const [roleName, roleCode] = entry;

		const roleACL = new Parse.ACL();
		roleACL.setPublicReadAccess(true);

		const foundRole = await new Parse.Query(Parse.Role).equalTo('name', roleName).first();

		if (foundRole) {
			console.log(`role: '${roleName}' already exists, skipping its creation`);

			if (foundRole.get('code') !== roleCode) {
				console.log(`changing code for role: '${roleName}'`);
				foundRole.set('code', roleCode);
			}

			const index = roleEntries.indexOf(entry);

			if (index > 0) {
				const childRoles = await foundRole.getRoles().query().find();
				const directChildRole = await new Parse.Query(Parse.Role).equalTo('name', roleEntries[index - 1][0]).first();

				if (!directChildRole) {
					// something that should never happen
					throw new Error('Something is going wrong!!');
				}

				const hasChildRole = childRoles.find((role) => {
					return role.id === directChildRole.id;
				});

				if (!hasChildRole) {
					console.log(`setting child role for role: '${roleName}'`);
					foundRole.getRoles().add(directChildRole);
				}
			}

			if (foundRole.dirty()) {
				await foundRole.save(null, { useMasterKey: true });
			}

			continue;
		}

		const role = new Parse.Role(roleName, roleACL);
		role.set('code', roleCode);

		await role.save(null, { useMasterKey: true });
	}
};

export async function findRoleByCode(code: number, useMasterKey = false) {
	const roleQuery = new Parse.Query(Parse.Role);
	return roleQuery.equalTo('code', code).first({ useMasterKey });
}

export const assignRoleToUser = async (user: Parse.User, role: Parse.Role, useMasterKey = false) => {
	const relation = role.getUsers();
	relation.add(user);
	return role.save(null, { useMasterKey });
};
