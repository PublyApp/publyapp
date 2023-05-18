type ParseInnerFunction = (request?: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest) => Promise<unknown>;

export const parseFunction = (innerFunction: ParseInnerFunction) => {
	return async (request: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest): Promise<unknown> => {
		try {
			let result = await innerFunction(request);

			if (result == null) {
				result = 'ok';
			}

			return result;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			if (global.LOCAL) {
				console.trace(error);
			}

			let message;

			if (error && 'message' in error) {
				message = error.message;
			} else {
				message = 'Unknown error';
			}

			return Promise.reject(message);
		}
	};
};
