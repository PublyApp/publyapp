import _ from 'lodash';

type JsClientError = {
	key?: string;
	messageEscaped: string;
	responseStatusCode: number;
	responseHeaders: Record<string, string>;
};

export const isJsClientError = (error: unknown): error is JsClientError => {
	if (
		_.isObject(error) &&
		_.has(error, 'messageEscaped') &&
		_.has(error, 'responseStatusCode') &&
		_.has(error, 'responseHeaders')
	) {
		return true;
	}

	return false;
};
