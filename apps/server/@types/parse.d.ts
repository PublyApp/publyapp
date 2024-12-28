/* eslint-disable @typescript-eslint/no-unused-vars */
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
		}
	}
}
