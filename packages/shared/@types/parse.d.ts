/* eslint-disable @typescript-eslint/no-unused-vars */

namespace Parse {
	import type { PipelineStage } from 'mongoose';

	export type NewAttributes<T> = Omit<T, keyof BaseAttributes>;

	namespace Cloud {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		interface FunctionRequest<T extends Params = Params> {
			headers: Record<string, any>;
		}
	}

	namespace CoreManager {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		function set(key: string, value: any): void;
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		function get(key: string): void;
	}

	// eslint-disable-next-line @typescript-eslint/ban-types
	interface Query<T extends Object = Object> /* extends Parse.Query */ {
		aggregate<V = any>(
			pipeline: /* Query.AggregationOptions | Query.AggregationOptions[] */ PipelineStage[],
		): Promise<V>;
	}
}
