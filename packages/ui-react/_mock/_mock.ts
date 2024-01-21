import { sub } from 'date-fns';
// config
import { ASSETS_API } from 'src/config-global';

//
import {
	_ages,
	_booleans,
	_companyNames,
	_descriptions,
	_emails,
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
	id: (index: number) => _id[index],
	time: (index: number) => sub(new Date(), { days: index, hours: index }),
	boolean: (index: number) => _booleans[index],
	role: (index: number) => _roles[index],
	// Text
	taskNames: (index: number) => _taskNames[index],
	postTitle: (index: number) => _postTitles[index],
	jobTitle: (index: number) => _jobTitles[index],
	tourName: (index: number) => _tourNames[index],
	productName: (index: number) => _productNames[index],
	sentence: (index: number) => _sentences[index],
	description: (index: number) => _descriptions[index],
	// Contact
	email: (index: number) => _emails[index],
	phoneNumber: (index: number) => _phoneNumbers[index],
	fullAddress: (index: number) => _fullAddress[index],
	// Name
	firstName: (index: number) => _firstNames[index],
	lastName: (index: number) => _lastNames[index],
	fullName: (index: number) => _fullNames[index],
	companyName: (index: number) => _companyNames[index],
	// Number
	number: {
		percent: (index: number) => _percents[index],
		rating: (index: number) => _ratings[index],
		age: (index: number) => _ages[index],
		price: (index: number) => _prices[index],
		nativeS: (index: number) => _nativeS[index],
		nativeM: (index: number) => _nativeM[index],
		nativeL: (index: number) => _nativeL[index],
	},
	// Image
	image: {
		cover: (index: number) => `${ASSETS_API}/assets/images/cover/cover_${index + 1}.jpg`,
		avatar: (index: number) => `${ASSETS_API}/assets/images/avatar/avatar_${index + 1}.jpg`,
		travel: (index: number) => `${ASSETS_API}/assets/images/travel/travel_${index + 1}.jpg`,
		company: (index: number) => `${ASSETS_API}/assets/images/company/company_${index + 1}.png`,
		product: (index: number) => `${ASSETS_API}/assets/images/m_product/product_${index + 1}.jpg`,
		portrait: (index: number) => `${ASSETS_API}/assets/images/portrait/portrait_${index + 1}.jpg`,
	},
};
