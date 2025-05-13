import type { RequestHandler } from 'express';
import { nanoid } from 'nanoid';

import { HttpException } from '@/server/exceptions/HttpException';
import { AuthCloudService } from '@/server/modules/common/auth/auth.cloud.service';
import {
	PARSE_INSTALLATION_ID_HEADER_KEY,
	PARSE_SESSION_TOKEN_HEADER_KEY,
	REST_API_HEADER_KEY,
	type RoleSet,
} from '@/shared/lib/constants';

import { expressHandler, getHeader, getRequestUtils } from '../lib/express';
import _ from 'lodash';
import { sleep } from '@/shared/utils/any.utils';

type ProtectionMiddlewareOptions = (
	| {
			withAuth: true;
			roles?: RoleSet;
	  }
	| {
			withAuth?: false;
			roles?: never;
	  }
) & {
	withKey?: boolean;
	withInstallation?: boolean;
};

const protectionMiddleware = ({
	withKey = true,
	withAuth = true,
	withInstallation = false,
	roles,
}: ProtectionMiddlewareOptions): RequestHandler => {
	return expressHandler(async (req, _res, next) => {
		const { t } = getRequestUtils(req);

		// should have a header session token
		if (withAuth) {
			const sessionToken =
				getHeader(req, PARSE_SESSION_TOKEN_HEADER_KEY) ||
				_.get(req, 'body._SessionToken');

			if (!sessionToken) {
				return next(new HttpException(401, t('unauthorized')));
			}

			const authService = await AuthCloudService.createAuthCloudService({
				sessionToken,
			});

			const user = authService.getUserForSessionToken();

			if (!(await user)) {
				return next(
					new HttpException(400, t('item-not-found', { item: t('user') })),
				);
			}

			if (roles) {
				const roleNames = await authService.getRoleNamesForSessionToken();

				const roleSetNames = _.map(roles, (role) => role.name);

				if (
					!_.some(roleNames, (roleName) =>
						roleSetNames.includes(roleName as never),
					)
				) {
					next(new HttpException(403, t('unauthorized')));
				}
			}

			req.user = await user;
		}

		// should have a header key
		if (withKey) {
			const apiKey = getHeader(req, REST_API_HEADER_KEY);

			if (!apiKey) {
				return next(new HttpException(401, t('unauthorized')));
			}

			// do some validation
			const kyeFromDb = await sleep(1000, nanoid());

			if (apiKey && apiKey !== kyeFromDb) {
				return next(new HttpException(401, t('unauthorized')));
			}
		}

		// should have a header installation id
		if (withInstallation) {
			const installationId =
				getHeader(req, PARSE_INSTALLATION_ID_HEADER_KEY) ||
				_.get(req, 'body._InstallationId');

			if (!installationId) {
				return next(new HttpException(401, t('unauthorized')));
			}

			req.installationId = installationId;
		}

		return next();
	});
};

export default protectionMiddleware;
