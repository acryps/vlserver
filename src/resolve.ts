export interface JSONResolvable {
	resolveToJSON(): Promise<any> | any;
}