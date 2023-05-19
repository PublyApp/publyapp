// eslint-disable-next-line prettier/prettier
export {};

declare global {
	namespace Parse {
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
