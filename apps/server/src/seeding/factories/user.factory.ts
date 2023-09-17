// import { User, Role } from '@prisma/client';
import { Faker } from '@faker-js/faker';

import { User } from '@aktiveo/shared/parse/classes/user.class';

// import { RolesEnum } from '@aktiveo/shared/utils/constants';

// import { findRoleByCode } from '@/utils/role.utils';

export const userFactory = async (faker: Faker) => {
	// const getBool = faker.datatype.boolean;
	// const user = {} as User;
	const user = new User();

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
