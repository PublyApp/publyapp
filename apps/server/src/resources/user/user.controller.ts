import type { RequestHandler } from 'express';
import _ from 'lodash';

import { createSessionServer } from '@/server/lib/parse';

import { AuthCloudService } from '../auth/auth.cloud.service';

export const handlePasswordLogin: RequestHandler = async (req, res, next) => {
	try {
		const { username, password } = req.body;

		const user = await AuthCloudService.authenticateUserWithPassword({ usernameOrEmail: username, password });

		const result = await createSessionServer({
			userId: user.objectId,
			additionalSessionData: {
				ipAddress: req.ip,
			},
		});

		_.set(user, 'sessionToken', result.sessionToken);

		return res.json(user);
	} catch (error) {
		return next(error);
	}
};
