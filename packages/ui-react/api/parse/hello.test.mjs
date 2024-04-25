/* eslint-disable import/no-extraneous-dependencies */
import { describe, it } from 'node:test';

import { expect } from 'chai';

const sayHello = () => {
	return 'Hello';
};

describe('Hello', () => {
	it('should say hello', () => {
		expect(sayHello()).to.equal('Hello');
	});
});
