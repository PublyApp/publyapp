import { existsSync, promises as fs } from 'node:fs';

import { className, roleEnum } from '@org/shared/lib/constants';

import {
	DISABLE_SIGNUP_CONFIG_KEY,
	FILE_UPLOAD_DESTINATION,
	USE_MASTER_KEY,
} from '@/server/lib/constants';
import { logger } from '@/server/lib/winston';

import SchemaManager from '../lib/parse/classes/SchemaManager';
import {
	getDatabase,
	getGlobalConfig,
	setGlobalConfig,
} from '../lib/parse/parse.utils';
import RoleSchema from '../modules/common/auth/role/role.schema';
import SessionSchema from '../modules/common/auth/session/session.schema';
import Parse_CustomJoinUserToTenantSchema from '../modules/common/auth/tenant/$join-user-to-tenant.schema';
import TenantSchema from '../modules/common/auth/tenant/tenant.schema';
import UserSchema from '../modules/common/auth/user/user.schema';

export const createRolesIfNotExists = async () => {
	const roleEntries = Object.values(roleEnum).map((e) => {
		return [e.name, { code: e.code, rank: e.rank }] as readonly [
			string,
			{ code: string; rank: number },
		];
	});

	for (const entry of roleEntries) {
		const [roleName, value] = entry;

		const roleACL = new Parse.ACL();
		roleACL.setPublicReadAccess(true);

		const foundRole = await new Parse.Query(Parse.Role)
			.equalTo('name', roleName)
			.first(USE_MASTER_KEY);

		if (foundRole) {
			logger.info(`role: '${roleName}' already exists, skipping its creation`);

			if (foundRole.get('code') !== value.code) {
				logger.info(`changing code for role: '${roleName}'`);
				foundRole.set('code', value.code);
			}

			if (foundRole.get('rank') !== value.rank) {
				logger.info(`changing rank for role: '${roleName}'`);
				foundRole.set('rank', value.rank);
			}

			const index = roleEntries.indexOf(entry);

			if (index > 0) {
				const childRoles = await foundRole
					.getRoles()
					.query()
					.find(USE_MASTER_KEY);
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
		role.set('code', value.code);
		role.set('rank', value.rank);

		await role.save(null, USE_MASTER_KEY);
	}
};

export const createUploadDirIfNotExists = async () => {
	if (existsSync(FILE_UPLOAD_DESTINATION)) {
		return;
	}

	fs.mkdir(FILE_UPLOAD_DESTINATION, { recursive: true });
};

export const setUpGlobalConfig = async () => {
	const globalConfig = await getGlobalConfig();

	await setGlobalConfig({
		[DISABLE_SIGNUP_CONFIG_KEY]: {
			value: globalConfig.get(DISABLE_SIGNUP_CONFIG_KEY) ?? true,
		},
	});
};

export const updateUserClpForDisabledSignupConfig = async () => {
	const disabledSignup: boolean = (await getGlobalConfig()).get(
		DISABLE_SIGNUP_CONFIG_KEY,
	);

	const SchemaCollection = getDatabase().collection(className.SCHEMA);

	const roleString = `role:${roleEnum.STAFF_ADMIN.name}`;

	if (!disabledSignup) {
		await SchemaCollection.updateOne(
			{ _id: className.USER as never },
			{
				$set: {
					'_metadata.class_permissions.create': {
						'*': true,
						[roleString]: true,
					},
				},
			},
		);
		return;
	}

	await SchemaCollection.updateOne(
		{ _id: className.USER as never },
		{
			$set: {
				'_metadata.class_permissions.create': {
					[roleString]: true,
				},
			},
		},
	);
};

export const updateSchemasOnInit = async () => {
	await SchemaManager.updateSchemas([
		// === Auth
		RoleSchema,
		SessionSchema,
		UserSchema,
		// === Multi Tenant
		TenantSchema,
		// === Custom Joins
		Parse_CustomJoinUserToTenantSchema,
	]);
	await updateUserClpForDisabledSignupConfig();
	// updateSchemasPromise.then(async () => {
	// 	updateUserClpForDisabledSignupConfig();
	// });
	// ? in case of the updated schemas configurations are not took in consideration by Parse server
	/* .then(() => {
		parseServer.start();
	}); */
};

export const overrideConsole = () => {
	const originalConsoleError = console.error;

	console.error = (...args: unknown[]) => {
		logger.warn('DO NOT USE console.error, use logger.error instead');
		originalConsoleError(...args);
	};

	const originalConsoleWarn = console.warn;

	console.warn = (...args: unknown[]) => {
		logger.warn('DO NOT USE console.warn, use logger.warn instead');
		originalConsoleWarn(...args);
	};

	const originalConsoleInfo = console.info;

	console.info = (...args: unknown[]) => {
		logger.warn('DO NOT USE console.info, use logger.info instead');
		originalConsoleInfo(...args);
	};

	const originalConsoleLog = console.log;

	console.log = (...args: unknown[]) => {
		logger.warn('DO NOT USE console.log, use logger.log/logger.info instead');
		originalConsoleLog(...args);
	};
	/* eslint-enable no-console */
};
