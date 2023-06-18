// eslint-disable-next-line prettier/prettier
export {};

declare global {
	namespace Parse {
		namespace Cloud {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			interface FunctionRequest<T extends Params = Params> {
				headers: Record<string, any>;
			}
		}

		namespace Query {
			type AggregationOptions = {
				$search?: {
					index: string;
					autocomplete: {
						query: string;
						path: string;
						fuzzy: {
							maxEdits: number;
						};
					};
				};
			};
		}
	}
}
