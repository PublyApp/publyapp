import type Parse from 'parse';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Multer } from 'multer';

export {};

declare global {
	namespace Express {
		export interface Request {
			user?: Parse.User;
			installationId?: string;
		}
	}
}
