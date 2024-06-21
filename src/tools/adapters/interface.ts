import * as fs from "fs";
import { ServiceAdapter } from "./base";

export class InterfaceServiceAdapter extends ServiceAdapter {
    generate(routes, viewModels, config, enums) {
        fs.writeFileSync(this.outFile, `

${Object.keys(enums).map(name => `export enum ${name} {
	${Object.keys(enums[name]).map(prop => `${prop} = ${JSON.stringify(enums[name][prop])}`).join(",\n\t")}
}`).join("\n\n")}

${viewModels.map(viewModel => `
export interface ${viewModel.name} {
    ${Object.keys(viewModel.properties).map(name => {
        const property = viewModel.properties[name];

        return `${name}: ${property.propertyType}${(property.fetch && property.fetch.many) ? "[]" : ""};`;
    }).join("\n\t")}
}
`.trim()).join("\n\n")}
        `.trim());
    }
}
