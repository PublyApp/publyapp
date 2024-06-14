/* eslint-disable no-continue */
/* eslint-disable no-await-in-loop */
import { existsSync, promises as fs } from 'fs';

import { roleEnum } from '@devist/shared/lib/constants';

import { FILE_UPLOAD_DESTINATION, USE_MASTER_KEY } from '@/server/lib/constants';

import logger from '../lib/logger';

export const createRolesIfNotExists = async () => {
	const roleEntries = Object.values(roleEnum).map((e) => {
		return [e.name, e.code] as readonly [string, number];
	});

	// eslint-disable-next-line no-restricted-syntax
	for (const entry of roleEntries) {
		const [roleName, roleCode] = entry;

		const roleACL = new Parse.ACL();
		roleACL.setPublicReadAccess(true);

		const foundRole = await new Parse.Query(Parse.Role).equalTo('name', roleName).first(USE_MASTER_KEY);

		if (foundRole) {
			logger.info(`role: '${roleName}' already exists, skipping its creation`);

			if (foundRole.get('code') !== roleCode) {
				logger.info(`changing code for role: '${roleName}'`);
				foundRole.set('code', roleCode);
			}

			const index = roleEntries.indexOf(entry);

			if (index > 0) {
				const childRoles = await foundRole.getRoles().query().find(USE_MASTER_KEY);
				const directChildRole = await new Parse.Query(Parse.Role)
					.equalTo('name', roleEntries[index - 1][0])
					.first(USE_MASTER_KEY);

				if (!directChildRole) {
					// something that should never happen
					throw new Error('Something is going wrong!!');
				}

				const hasChildRole = childRoles.find((role) => {
					return role.id === directChildRole.id;
				});

				if (!hasChildRole) {
					logger.info(`setting child role for role: '${roleName}'`);
					foundRole.getRoles().add(directChildRole);
				}
			}

			if (foundRole.dirty()) {
				await foundRole.save(null, USE_MASTER_KEY);
			}

			continue;
		}

		const role = new Parse.Role(roleName, roleACL);
		role.set('code', roleCode);

		await role.save(null, USE_MASTER_KEY);
	}
};

export const createUploadDirIfNotExists = async () => {
	if (existsSync(FILE_UPLOAD_DESTINATION)) {
		return;
	}

	fs.mkdir(FILE_UPLOAD_DESTINATION, { recursive: true });
};
