/* eslint-disable no-continue */
/* eslint-disable no-await-in-loop */
import { existsSync, promises as fs } from 'fs';

import { logger } from 'parse-server';

import cloudinary from 'cloudinary';
import { MongoClient } from 'mongodb';

import { className, RolesEnum } from '@devist/shared/utils/constants';

import { FILE_UPLOAD_DESTINATION, USE_MASTER_KEY } from '@server/utils/constants';
import { env } from '@server/utils/env';

const { CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, CLOUDINARY_NAME } = env;

export const createRolesIfNotExist = async () => {
	const roleEntries = Object.entries(RolesEnum).filter((e) => {
		return Number.isNaN(Number(e[0]));
	}) as [string, number][];

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

export const createIndexes = async () => {
	const client = new MongoClient(process.env.DATABASE_URI || '');
	await client.connect();

	const db = client.db('devist-local');

	// ! JUST For example
	const WebHost = db.collection(className.WEB_HOST);
	await WebHost.createIndex(
		{
			'translations.en.name': 1,
		},
		{
			name: 'translations.en.name_1',
			collation: {
				locale: 'en',
				strength: 2,
			},
		},
	);

	client.close();
};

export const initCloudinary = async () => {
	cloudinary.v2.config({
		cloud_name: CLOUDINARY_NAME,
		api_key: CLOUDINARY_API_KEY,
		api_secret: CLOUDINARY_API_SECRET,
		secure: true,
	});
};

export const createUploadDirIfNotExist = async () => {
	if (existsSync(FILE_UPLOAD_DESTINATION)) {
		return;
	}

	fs.mkdir(FILE_UPLOAD_DESTINATION, { recursive: true });
};
