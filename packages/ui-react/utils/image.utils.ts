export const getImageFileFromUrl = async (url: string, filename: string) => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const _url = new URL(url);
	_url.protocol = 'https';
	const result = await fetch(_url);
	const blob = await result.blob();

	const file = new File([blob], filename);

	return file;

	// const newFile = Object.assign(file, {
	// 	preview: URL.createObjectURL(file),
	// });

	// return newFile;
};
