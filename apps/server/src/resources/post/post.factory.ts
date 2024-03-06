import { type Faker } from '@faker-js/faker';

import { ParseUser } from '@/server/lib/parse/classes/user.class';

export const userFactory = async (faker: Faker) => {
	// const getBool = faker.datatype.boolean;
	// const user = {} as User;
	const user = new ParseUser();

	user.set('firstName', faker.person.firstName());
	user.set('lastName', faker.person.lastName());
	user.setEmail(faker.internet.email({ firstName: user.get('firstName'), lastName: user.get('lastName') }));
	user.setUsername(faker.internet.userName({ firstName: user.get('firstName'), lastName: user.get('lastName') }));
	user.setPassword('1234567890');

	// const userRolesRelation = user.relation<Parse.Role>('roles');
	// userRolesRelation.add(role);

	// user.verified = getBool();
	// user.profilePicUrl = getBool() ? faker.internet.avatar() : null;
	// profile related fields
	// user.bio = getBool() ? faker.lorem.sentence() : null;
	// user.location = getBool() ? faker.address.country() : null;
	// user.education = getBool() ? faker.lorem.words() : null;
	// user.work = getBool() ? faker.name.jobTitle() : null;
	// user.availableFor = getBool() ? faker.lorem.words() : null;

	return user;
};
