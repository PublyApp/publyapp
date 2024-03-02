/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

namespace Parse {
	import type { PipelineStage } from 'mongoose';

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
			context: Record<string, unknown> | undefined;
		}
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
	}

	namespace Query {
		interface FindOptions {
			context?: Record<string, any>;
		}
	}
}
