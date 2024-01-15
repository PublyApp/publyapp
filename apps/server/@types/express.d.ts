import type Parse from 'parse';

declare global {
	namespace Express {
		export interface Request {
			user?: Parse.User;
			installationId?: string;
		}
	}
}
