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

		for (let key of mapping.parameters) {
			if (key in this.globalContext) {
				parameters.push(this.globalContext[key]);
			} else {
				parameters.push(this.construct(Inject.mappings[key].objectConstructor));
			}
		}

		return new objectConstructor(...parameters);
	}
}