import * as fs from "fs";
import { ServiceAdapter } from "./base";

export class NativeServiceAdapter extends ServiceAdapter {
	generate(routes, viewModels, config) {
		fs.writeFileSync(this.outFile, `
		
${viewModels.map(viewModel => `
export class ${viewModel.name} {
	${Object.keys(viewModel.properties).map(name => {
		const property = viewModel.properties[name];

		return `${name}: ${property.type}${(property.fetch && property.fetch.many) ? "[]" : ""};`;
	})}
}
`)}
		
		`.trim());
	}
}