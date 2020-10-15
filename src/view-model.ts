import { JSONResolvable } from "./resolve";

export class ViewModel<TModel> implements JSONResolvable {
	static meta: { 
		[key: string]: { 
			[key: string]: "boolean" | "string" | "number" | (new () => any) 
		} 
	}

	model: TModel; // model proxy

	constructor(source?: TModel) {}

	async toModel() {
		return this.model;
	}

	async resolveToJSON() {
		const meta = ViewModel.meta[this.constructor.name];
	}
}