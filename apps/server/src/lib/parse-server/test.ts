// eslint-disable-next-line max-classes-per-file
class A {
	// eslint-disable-next-line class-methods-use-this
	get value(): string {
		return '3435453';
	}

	static ok() {
		return '123';
	}
}

class B extends A {
	get value(): string {
		return this.value;
	}

	static ok() {
		return A.ok();
		// super.ok();
	}
}

// const b = new B();

const ok = B.ok();

console.log(ok);
