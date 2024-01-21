/* eslint-disable @typescript-eslint/naming-convention */
import { sub } from 'date-fns';

//
import {
	age,
	blogTitle,
	boolean,
	brandsName,
	company,
	country,
	courseTitle,
	description,
	email,
	//
	firstName,
	//
	fullAddress,
	fullName,
	jobCategories,
	//
	jobTitle,
	lastName,
	percent,
	phoneNumber,
	//
	price,
	rating,
	role,
	sentence,
	tourName,
	video,
} from './assets';

// ----------------------------------------------------------------------

const _mock = {
	id: (index: number) => {
		return `e99f09a7-dd88-49d5-b1c8-1daf80c2d7b${index + 1}`;
	},
	email: (index: number) => {
		return email[index];
	},
	phoneNumber: (index: number) => {
		return phoneNumber[index];
	},
	time: (index: number) => {
		return sub(new Date(), { days: index, hours: index });
	},
	boolean: (index: number) => {
		return boolean[index];
	},
	role: (index: number) => {
		return role[index];
	},
	company: (index: number) => {
		return company[index];
	},
	address: {
		fullAddress: (index: number) => {
			return fullAddress[index];
		},
		country: (index: number) => {
			return country[index];
		},
	},
	name: {
		firstName: (index: number) => {
			return firstName[index];
		},
		lastName: (index: number) => {
			return lastName[index];
		},
		fullName: (index: number) => {
			return fullName[index];
		},
	},
	text: {
		blogTitle: (index: number) => {
			return blogTitle[index];
		},
		courseTitle: (index: number) => {
			return courseTitle[index];
		},
		jobTitle: (index: number) => {
			return jobTitle[index];
		},
		jobCategories: (index: number) => {
			return jobCategories[index];
		},
		tourName: (index: number) => {
			return tourName[index];
		},
		brandsName: (index: number) => {
			return brandsName[index];
		},
		sentence: (index: number) => {
			return sentence[index];
		},
		description: (index: number) => {
			return description[index];
		},
	},
	number: {
		percent: (index: number) => {
			return percent[index];
		},
		rating: (index: number) => {
			return rating[index];
		},
		age: (index: number) => {
			return age[index];
		},
		price: (index: number) => {
			return price[index];
		},
	},
	image: {
		avatar: (index: number) => {
			return `/assets/images/avatar/avatar_${index + 1}.jpg`;
		},
		company: (index: number) => {
			return `/assets/images/company/company_${index + 1}.png`;
		},
		marketing: (index: number) => {
			return `/assets/images/marketing/marketing_${index + 1}.jpg`;
		},
		travel: (index: number) => {
			return `/assets/images/travel/travel_${index + 1}.jpg`;
		},
		career: (index: number) => {
			return `/assets/images/career/career_${index + 1}.jpg`;
		},
		course: (index: number) => {
			return `/assets/images/course/course_${index + 1}.jpg`;
		},
		product: (index: number) => {
			return `/assets/images/product/product_${index + 1}.png`;
		},
	},
	video: (index: number) => {
		return video[index];
	},
	jobTitle,
	jobCategories,
	shareLinks: {
		facebook: 'facebook/user-name',
		instagram: 'instagram/user-name',
		linkedin: 'linkedin/user-name',
		twitter: 'twitter/user-name',
	},
};

export default _mock;
