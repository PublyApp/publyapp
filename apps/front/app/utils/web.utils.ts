export const getBrowserCookie = (name: string) => {
	if (!document) return;

	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);

	if (parts.length === 2) {
		const part = parts.pop();
		// eslint-disable-next-line consistent-return
		if (part) return part.split(';').shift();
	}
};

export const getRequestCookie = (request: Request, cookieName: string) => {
	const cookies = request.headers.getSetCookie();
	let value = cookies.find((cookie) => {
		return cookie.startsWith(`${cookieName}=`);
	});

	if (value) {
		value = value?.split('=')[1];
	}

	return value;
};
