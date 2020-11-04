export class ServiceAdapter {
	outFile: string;

	constructor(config) {
		this.outFile = config.outFile;
	}
	
	generate(routes, viewModels, config) {}
}