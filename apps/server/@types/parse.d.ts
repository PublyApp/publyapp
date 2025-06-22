import type { LoggerController } from 'parse-server/lib/Controllers/LoggerController';

declare global {
	declare namespace Parse {
		namespace Cloud {
			interface FunctionRequest<T extends Params = Params> {
				log: LoggerController;
			}

			interface JobRequest<T extends Params = Params> {
				log: LoggerController;
			}

			interface TriggerRequest<T = Parse.Object> {
				// installationId?: string | undefined;
				// master?: boolean | undefined;
				// user?: User | undefined;
				// ip: string;
				// headers: any;
				// triggerName: string;
				log: LoggerController;
				// object: T;
				// original?: T | undefined;
			}
		}
	}
}
