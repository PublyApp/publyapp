/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

export {};

declare global {
	declare namespace Parse {
		import type { PipelineStage } from 'mongoose';

		import type { AppLocale } from '../lib/i18n/resources';
		import type { DateType } from '../types/date.types';

		interface BaseAttributes {
			objectId: string;
			createdAt?: DateType;
			updatedAt?: DateType;
		}

		export type PipelineStage = PipelineStage;

		export type OmitBaseAttributes<T> = Omit<T, keyof BaseAttributes>;

		namespace Cloud {
			interface FunctionRequest<T extends Params = Params> {
				headers: Record<string, any> | undefined;
				ip: string | undefined;
			}

			// eslint-disable-next-line @typescript-eslint/ban-types
			interface TriggerRequest<T = Object> {
				query: Query<T> | undefined;
				context: (Record<string, unknown> & { locale?: unknown }) | undefined;
				headers: Record<string, any> | undefined;
			}

			interface JobRequest {
				headers: Record<string, any> | undefined;
				ip: string | undefined;
				jobName: string;
				jobId: string;
			}

			function define<T extends Params = Params>(name: string, handler: (request: FunctionRequest<T>) => any): void;
		}

		interface InstallationController {
			currentInstallationId(): Promise<string>;
		}

		namespace CoreManager {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			function set(key: string, value: any): void;
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			function get(key: string): void;

			function getInstallationController(): InstallationController;
		}

		// eslint-disable-next-line @typescript-eslint/ban-types
		interface Query<T extends Object = Object> /* extends Parse.Query */ {
			aggregate<V = any>(
				pipeline: /* Query.AggregationOptions | Query.AggregationOptions[] */ PipelineStage[],
			): Promise<V>;

			comment(comment: string): Query<T>;

			readPreference(readPreference: string, includeReadPreference?: string, subqueryReadPreference?: string): this;
		}

		namespace Query {
			interface ContextOptions {
				locale?: AppLocale | undefined;
				[key: string]: unknown;
			}

			interface FindOptions {
				context?: ContextOptions;
			}

			// TODO: add ContextOptions to more operations
		}
	}
}
