import type { PipelineStage } from 'mongoose';

import type { AppLocale } from '../lib/i18n/resources';
import type { DateType } from '../types/date.types';

declare global {
	declare namespace Parse {
		interface BaseAttributes {
			objectId: string;
			createdAt?: DateType;
			updatedAt?: DateType;
		}

		export type PipelineStage = PipelineStage;

		export type OmitBaseAttributes<T> = Omit<T, keyof BaseAttributes>;

		namespace Cloud {
			interface FunctionRequest<T extends Params = Params> {
				// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
				headers: Record<string, any> | undefined;
				ip?: string | undefined;
				context: Record<string, unknown>;
				functionName: string;
			}

			// biome-ignore lint/complexity/noBannedTypes: safe to use Object type here
			interface TriggerRequest<T = Object> {
				query: Query<T> | undefined;
				context:
					| (Record<string, unknown> & { locale?: string; fromCloud?: boolean })
					| undefined;
				// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
				headers: Record<string, any> | undefined;
			}

			interface JobRequest {
				// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
				headers: Record<string, any> | undefined;
				ip: string | undefined;
				jobName: string;
				jobId: string;
			}

			function define<T extends Params = Params>(
				name: string,
				// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
				handler: (request: FunctionRequest<T>) => any,
			): void;
		}

		interface InstallationController {
			currentInstallationId(): Promise<string>;
			_setInstallationIdCache(iid: string): void;
		}

		namespace CoreManager {
			// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
			function set(key: string, value: any): void;
			function get(key: string): void;

			function getInstallationController(): InstallationController;
		}

		// biome-ignore lint/complexity/noBannedTypes: safe to use Object type here
		interface Query<T extends Object = Object> /* extends Parse.Query */ {
			// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
			aggregate<V = any>(
				pipeline: /* Query.AggregationOptions | Query.AggregationOptions[] */ PipelineStage[],
			): Promise<V>;

			comment(comment: string): Query<T>;

			readPreference(
				readPreference: string,
				includeReadPreference?: string,
				subqueryReadPreference?: string,
			): this;
		}

		namespace Query {
			interface ContextOptions {
				locale?: AppLocale | undefined;
				[key: string]: unknown;
			}

			interface FindOptions {
				context?: ContextOptions;
			}

			interface BatchOptions {
				context?: ContextOptions;
			}

			// TODO: add ContextOptions to more operations
		}
	}
}
