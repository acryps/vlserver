export interface JSONResolvable {
	resolveToJSON(): Promise<any> | any;
}

// models marked as ResponseModel will have their references and entities converted to ViewModels.
export abstract class ResponseModel {}
