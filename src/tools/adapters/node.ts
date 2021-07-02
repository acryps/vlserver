import * as fs from "fs";
import { ServiceAdapter } from "./base";

export class NodeServiceAdapter extends ServiceAdapter {
	generate(routes, viewModels, config, enums) {
		const controllers = routes.map(r => r.controller).filter((c, i, a) => a.indexOf(c) == i);

		fs.writeFileSync(this.outFile, `

import fetch = require("node-fetch");
import FormData = require("form-data");

export class Service {
    static baseUrl = "";
}

${Object.keys(enums).map(name => `export class ${name} {
	${Object.keys(enums[name]).map(prop => `static readonly ${prop} = ${JSON.stringify(enums[name][prop])};`).join("\n\t")}
}`).join("\n\n")}

${viewModels.map(viewModel => `
export class ${viewModel.name} {
	${Object.keys(viewModel.properties).map(name => {
		const property = viewModel.properties[name];

		return `${name}: ${property.enum ? "keyof typeof " : ""}${property.propertyType}${(property.fetch && property.fetch.many) ? "[]" : ""};`;
	}).join("\n\t")}

	private static $build(raw) {
		const item = new ${viewModel.name}();
		${Object.keys(viewModel.properties).map(name => {
			const property = viewModel.properties[name];

			if (viewModel.properties[name].fetch) {
				if (viewModel.properties[name].fetch.single) {
					return `item.${name} = raw.${name} ? ${viewModel.properties[name].fetch.single}["$build"](raw.${name}) : null`;
				} else {
					return `item.${name} = raw.${name} ? raw.${name}.map(i => ${viewModel.properties[name].fetch.many}["$build"](i)) : null`;
				}
			} else {
				if (viewModel.properties[name].propertyType == "boolean") {
					return `item.${name} = !!raw.${name}`;
				} else if (viewModel.properties[name].propertyType == "string") {
					return `item.${name} = raw.${name} === null ? null : \`\${raw.${name}}\``;
				} else if (viewModel.properties[name].propertyType == "number") {
					return `item.${name} = raw.${name} === null ? null : +raw.${name}`;
				} else if (viewModel.properties[name].propertyType == "Date") {
					return `item.${name} = raw.${name} ? new Date(raw.${name}) : null`;
				} else if (viewModel.properties[name].enum) {
					return `item.${name} = raw.${name}`;
				} else {
					return `item.${name} = raw.${name} ? ${viewModel.properties[name].propertyType}["$build"](raw.${name}) : null`;
				}
			}
		}).join("\n\t\t")}
		
		return item;
	}
}
`.trim()).join("\n\n")}


${controllers.map(controller => `
export class ${controller.name} {
	${routes.filter(r => r.controller == controller).map(route => `
	
	async ${route.name}(${route.parameters.map(parameter => `${parameter.name}: ${parameter.type}${parameter.isArray ? "[]" : ""}`)}): Promise<${
        route.returnType.slice(0, route.returnType.length - 1).map(t => `Array<`)
    }${
        route.returnType[route.returnType.length - 1]
    }${
        ">".repeat(route.returnType.length - 1)
    }> {
		const data = new FormData();
		${route.parameters.map(
			parameter => `${parameter.name} !== undefined && data.append(${JSON.stringify(parameter.id)}, JSON.stringify(${parameter.name}))`
		).join("\n\t\t")}

		return await fetch(\`\${Service.baseUrl}${route.id}\`, {
			method: "post",
			body: data
		}).then(res => res.json()).then(r => {
			${((!route.returnType.length || route.returnType[0] == "void") ? `

			if ("aborted" in r) {
				throw new Error("request aborted by server");
			}
			
			if ("error" in r) {
				throw new Error(\`\${r.error}\n\${r.stack}\`);
			}
			
			` : `

			if ("data" in r) {
				const d = r.data;

				return ${route.returnType.slice(0, route.returnType.length - 1).map(t => `d.map(d => `)}${(() => {
					const type = route.returnType[route.returnType.length - 1];

					if (type == "boolean") {
						return "!!d";
					} else if (type == "string") {
						return "d === null ? null : `${d}`";
					} else if (type == "number") {
						return "d === null ? null : +d";
					} else if (type == "Date") {
						return "d === null ? null : new Date(d)";
					} else {
						return `d === null ? null : ${type}["$build"](d)`;
					} 
				})()}${")".repeat(route.returnType.length - 1)};
			} else if ("aborted" in r) {
				throw new Error("request aborted by server");
			} else if ("error" in r) {
				throw new Error(\`\${r.error}\n\${r.stack}\`);
			}
			
			`).trim()}
		});
	}
	
	`.trim()).join("\n\n\t")}
}
`.trim()).join("\n\n")}`.trim());
	}
}