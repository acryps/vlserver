import * as fs from "fs";
import { ServiceAdapter } from "./base";

export class NativeServiceAdapter extends ServiceAdapter {
	generate(routes, viewModels, config) {
		const controllers = routes.map(r => r.controller).filter((c, i, a) => a.indexOf(c) == i);

		fs.writeFileSync(this.outFile, `
		
${viewModels.map(viewModel => `
export class ${viewModel.name} {
	${Object.keys(viewModel.properties).map(name => {
		const property = viewModel.properties[name];

		return `${name}: ${property.propertyType}${(property.fetch && property.fetch.many) ? "[]" : ""};`;
	}).join("\n\t")}
}
`.trim()).join("\n\n")}

${controllers.map(controller => `
export class ${controller.name} {
	${routes.filter(r => r.controller == controller).map(route => `
	
	async ${route.name}(${route.parameters.map(parameter => `${parameter.name}: ${parameter.type}${parameter.isArray ? "[]" : ""}`)}) {
		const data = new FormData();
		${route.parameters.map(parameter => `data.append(${JSON.stringify(parameter.id)}, ${parameter.name})`)}

		return await fetch(${JSON.stringify(route.id)}, {
			method: "post",
			body: data
		}).then(res => res.json()).then(r => {
			if ("data" in r) {
				return r.data;
			} else {
				throw new Error(r.error);
			}
		});
	}
	
	`.trim()).join("\n\n\t")}
}
`.trim()).join("\n\n")}
		
		`.trim());
	}
}