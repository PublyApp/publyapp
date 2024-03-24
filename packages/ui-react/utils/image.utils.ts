export const getImageFileFromUrl = async (url: string, filename: string) => {
	const result = await fetch(url);
	const blob = await result.blob();

	const file = new File([blob], filename);

	return file;

	// const newFile = Object.assign(file, {
	// 	preview: URL.createObjectURL(file),
	// });

	// return newFile;
};
