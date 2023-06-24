// import { DateTime } from 'luxon';

const slugify = (text) => {
	return text
		.toString()
		.toLowerCase()
		.replace(/\s+/g, '-') // Replace spaces with -
		.replace(/[^\w-]+/g, '') // Remove all non-word chars
		.replace(/--+/g, '-') // Replace multiple - with single -
		.replace(/^-+/, '') // Trim - from start of text
		.replace(/-+$/, ''); // Trim - from end of text
};

const removeDuplicates = (originalArray, prop) => {
	const newArray = [];
	const lookupObject = {};

	// eslint-disable-next-line no-restricted-syntax, guard-for-in
	for (const i in originalArray) {
		lookupObject[originalArray[i][prop]] = originalArray[i];
	}

	// eslint-disable-next-line no-restricted-syntax, guard-for-in
	for (const i in lookupObject) {
		newArray.push(lookupObject[i]);
	}

	return newArray;
};

// const SortingByDate = (posts) => {
// 	return posts.sort((post1, post2) => {
// 		const beforeDate = DateTime.fromFormat(post1.date, 'LLL dd yyyy');
// 		const afterDate = DateTime.fromFormat(post2.date, 'LLL dd yyyy');
// 		return afterDate - beforeDate;
// 	});
// };

const dateFormate = () => {
	const day = new Date().getDate();
	const month = new Date().toLocaleString('en-US', { month: 'long' });
	const year = new Date().getFullYear();

	const todayDate = `${day} ${month}, ${year}`;

	return todayDate;
};

export { slugify, removeDuplicates, /* SortingByDate, */ dateFormate };
