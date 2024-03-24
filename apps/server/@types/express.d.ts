import type Parse from 'parse';

export {};

declare global {
	namespace Express {
		export interface Request {
			user?: Parse.User;
			installationId?: string;
		}
	}
}
