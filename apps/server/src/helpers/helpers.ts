/* eslint-disable no-continue */
/* eslint-disable no-await-in-loop */
import { existsSync, promises as fs } from 'fs';

import { className, roleEnum } from '@devist/shared/lib/constants';

import { DISABLE_SIGNUP_CONFIG_KEY, FILE_UPLOAD_DESTINATION, USE_MASTER_KEY } from '@/server/lib/constants';

import logger from '../lib/logger';
import SchemaManager from '../lib/parse/classes/SchemaManager';
import { getDatabase, getGlobalConfig, setGlobalConfig } from '../lib/parse/utils';
import RoleSchema from '../resources/auth/role/role.schema';
import SessionSchema from '../resources/auth/session/session.schema';
import UserSchema from '../resources/auth/user/user.schema';
import BlogPostSchema from '../resources/blog/blogPost/blogPost.schema';
import BlogPostSlugSchema from '../resources/blog/blogPostSlug/blogPostSlug.schema';
import BlogPostTagSchema from '../resources/blog/blogPostTag/blogPostTag.schema';
import AppFileSchema from '../resources/file-manager/appFile/appFile.schema';

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

export const setUpGlobalConfig = async () => {
	const globalConfig = await getGlobalConfig();

	await setGlobalConfig({
		[DISABLE_SIGNUP_CONFIG_KEY]: { value: globalConfig.get(DISABLE_SIGNUP_CONFIG_KEY) ?? true },
	});
};

export const updateUserClpForDisabledSignupConfig = async () => {
	const disabledSignup: boolean = (await getGlobalConfig()).get(DISABLE_SIGNUP_CONFIG_KEY);

	if (!disabledSignup) {
		return;
	}

	const SchemaCollection = getDatabase().collection(className.SCHEMA);

	SchemaCollection.updateOne(
		{ _id: className.USER as never },
		{
			$set: {
				'_metadata.class_permissions.create': {},
			},
		},
	);
};

export const updateSchemasOnInit = async () => {
	SchemaManager.updateSchemas([
		// Auth
		RoleSchema,
		SessionSchema,
		UserSchema,
		// Blog
		BlogPostSchema,
		BlogPostSchema,
		BlogPostSlugSchema,
		BlogPostTagSchema,
		// File manager
		AppFileSchema,
	]);
	// updateSchemasPromise.then(async () => {
	// 	updateUserClpForDisabledSignupConfig();
	// });
	// ? in case of the updated schemas configurations are not took in consideration by Parse server
	/* .then(() => {
		parseServer.start();
	}); */
};
