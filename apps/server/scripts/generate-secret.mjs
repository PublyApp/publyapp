import crypto from 'node:crypto';
import _ from 'lodash';

const [, , bytes_arg] = process.argv;

const _bytes_arg = Number(bytes_arg);

let bytes = 32;

if (_.isNil(_bytes_arg)) {
	// do nothing
} else {
	if (_.isInteger(_bytes_arg)) {
		bytes = _bytes_arg;
	} else {
		console.error(`Invalid bytes argument: ${bytes_arg}`);
		process.exit(1);
	}
}

console.log(
	`==================> generating ${bytes} bytes secret <=================`,
);

const secret = crypto.randomBytes(bytes).toString('base64');
console.log(secret);
