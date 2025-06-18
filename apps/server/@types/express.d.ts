import type Parse from 'parse';
import type { RequestUtils } from '@/server/lib/express';

declare global {
	namespace Express {
		export interface Request {
			user?: Parse.User;
			// installationId?: string;
			requestUtils?: RequestUtils;
		}
	}
}
