import { fSub } from '#app/utils/format-time.ts';

import {
	_ages,
	_booleans,
	_companyNames,
	_countryNames,
	_courseNames,
	_descriptions,
	_emails,
	_eventNames,
	_fileNames,
	_firstNames,
	_fullAddress,
	_fullNames,
	_id,
	_jobTitles,
	_lastNames,
	_nativeL,
	_nativeM,
	_nativeS,
	_percents,
	_phoneNumbers,
	_postTitles,
	_prices,
	_productNames,
	_ratings,
	_roles,
	_sentences,
	_taskNames,
	_tourNames,
} from './assets';

// ----------------------------------------------------------------------

export const _mock = {
	id: (index: number) => {
		return _id[index];
	},
	time: (index: number) => {
		return fSub({ days: index, hours: index });
	},
	boolean: (index: number) => {
		return _booleans[index];
	},
	role: (index: number) => {
		return _roles[index];
	},
	// Text
	courseNames: (index: number) => {
		return _courseNames[index];
	},
	fileNames: (index: number) => {
		return _fileNames[index];
	},
	eventNames: (index: number) => {
		return _eventNames[index];
	},
	taskNames: (index: number) => {
		return _taskNames[index];
	},
	postTitle: (index: number) => {
		return _postTitles[index];
	},
	jobTitle: (index: number) => {
		return _jobTitles[index];
	},
	tourName: (index: number) => {
		return _tourNames[index];
	},
	productName: (index: number) => {
		return _productNames[index];
	},
	sentence: (index: number) => {
		return _sentences[index];
	},
	description: (index: number) => {
		return _descriptions[index];
	},
	// Contact
	email: (index: number) => {
		return _emails[index];
	},
	phoneNumber: (index: number) => {
		return _phoneNumbers[index];
	},
	fullAddress: (index: number) => {
		return _fullAddress[index];
	},
	// Name
	firstName: (index: number) => {
		return _firstNames[index];
	},
	lastName: (index: number) => {
		return _lastNames[index];
	},
	fullName: (index: number) => {
		return _fullNames[index];
	},
	companyNames: (index: number) => {
		return _companyNames[index];
	},
	countryNames: (index: number) => {
		return _countryNames[index];
	},
	// Number
	number: {
		percent: (index: number) => {
			return _percents[index];
		},
		rating: (index: number) => {
			return _ratings[index];
		},
		age: (index: number) => {
			return _ages[index];
		},
		price: (index: number) => {
			return _prices[index];
		},
		nativeS: (index: number) => {
			return _nativeS[index];
		},
		nativeM: (index: number) => {
			return _nativeM[index];
		},
		nativeL: (index: number) => {
			return _nativeL[index];
		},
	},
	// Image
	image: {
		cover: (index: number) => {
			return `/assets/images/mock/cover/cover-${index + 1}.webp`;
		},
		avatar: (index: number) => {
			return `/assets/images/mock/avatar/avatar-${index + 1}.webp`;
		},
		travel: (index: number) => {
			return `/assets/images/mock/travel/travel-${index + 1}.webp`;
		},
		course: (index: number) => {
			return `/assets/images/mock/course/course-${index + 1}.webp`;
		},
		company: (index: number) => {
			return `/assets/images/mock/company/company-${index + 1}.webp`;
		},
		product: (index: number) => {
			return `/assets/images/mock/m-product/product-${index + 1}.webp`;
		},
		portrait: (index: number) => {
			return `/assets/images/mock/portrait/portrait-${index + 1}.webp`;
		},
	},
};
