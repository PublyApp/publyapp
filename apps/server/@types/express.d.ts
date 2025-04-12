import type Parse from 'parse';

import type { Multer } from 'multer';

declare global {
	namespace Express {
		export interface Request {
			user?: Parse.User;
			installationId?: string;
		}
	}
}
