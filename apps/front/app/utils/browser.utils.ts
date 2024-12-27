// eslint-disable-next-line consistent-return
export const getBrowserCookie = (name: string) => {
	const value = `; ${document.cookie}`;
	const parts = value.split(`; ${name}=`);

	if (parts.length === 2) {
		const part = parts.pop();
		if (part) return part.split(';').shift();
	}
};
