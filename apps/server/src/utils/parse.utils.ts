// type ParseInnerFunction = (req: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest) => Promise<unknown>;
type ParseInnerFunction =
	| ((req: Parse.Cloud.TriggerRequest) => Promise<any>)
	| ((req: Parse.Cloud.FunctionRequest) => Promise<any>);

export const parseFunction = (innerFunction: ParseInnerFunction) => {
	return async (req: Parse.Cloud.TriggerRequest | Parse.Cloud.FunctionRequest): Promise<any> => {
		try {
			let result = await innerFunction(req as any);

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

// type FromAction = (req: Parse.Cloud.FunctionRequest, user: Parse.User) => void;

// type FromOptions = {
// 	allowedRoles: any[];
// };

// export const from = async (action: FromAction, _options: FromOptions) => {
// 	return parseFunction(async (req: Parse.Cloud.FunctionRequest) => {
// 		const user = req.user;

// 		if (!user) {
// 			throw new Error('You need to be authenticated to perform this action');
// 		}

// 		// verify roles
// 		// TODO: verify roles

// 		return action(req, user);
// 	});
// };
