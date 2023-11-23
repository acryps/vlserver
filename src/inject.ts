export class Inject {
	static mappings: {
		[key: string]: {
			objectConstructor: new (...args) => any,
			parameters: any[]
		}
	};

	constructor(
		public globalContext: any
	) {}

	construct(objectConstructor: new (...args) => any) {
		const mapping = Inject.mappings[objectConstructor.name];

		if (!mapping) {
			return new objectConstructor();
		}

		const parameters = [];

		for (let index = 0; index < mapping.parameters.length; index++) {
			const key = mapping.parameters[index];

			if (key in this.globalContext) {
				parameters.push(this.globalContext[key]);
			} else if (key in Inject.mappings) {
				parameters.push(this.construct(Inject.mappings[key].objectConstructor));
			} else {
				throw new Error(`Inject '${objectConstructor.name}' failed: type '${key}' used as parameter ${index + 1} of new ${objectConstructor.name}() not found in mappings.`);
			}
		}

		return new objectConstructor(...parameters);
	}
}