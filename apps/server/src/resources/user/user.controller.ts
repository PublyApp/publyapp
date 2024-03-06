import type { RequestHandler } from 'express';
import _ from 'lodash';
import { nanoid } from 'nanoid';

import { createSessionServer } from '@/server/lib/parse/utils';

import { AuthCloudService } from '../auth/auth.cloud.service';

export const handlePasswordLogin: RequestHandler = async (req, res, next) => {
	try {
		const { username, password } = req.body;

		const user = await AuthCloudService.authenticateUserWithPassword({ usernameOrEmail: username, password });

		const ipAddress = (global.LOCAL ? req.ip : req.get('x-forwarded-for')) || nanoid();

		const result = await createSessionServer({
			userId: user.objectId,
			additionalSessionData: {
				ipAddress,
			},
		});

		_.set(user, 'sessionToken', result.sessionToken);

		return res.json(user);
	} catch (error) {
		return next(error);
	}
};
