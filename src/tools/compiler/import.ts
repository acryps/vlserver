import path = require("path");
import ts = require("typescript");
import { Context } from "./context";

export class Import {
	constructor(public item: string, public source: string) {}

	toString() {
		return `import { ${this.item} } from ${JSON.stringify(`./${this.source.replace(/\\/g, "/")}`)};`;
	}

    static generateImports(context: Context) {
        /*

        const imports = [
		...routes.flatMap(r => r.controller.imports.map(i => new Import(i.name, i.file))),
		...viewModels.map(v => new Import(v.name, pathtools.relative(pathtools.basename(config.services.serverOutFile), v.path.replace(/\.ts$/, "")))),
		...viewModels.map(v => new Import(v.modelType, pathtools.relative(pathtools.basename(config.services.serverOutFile), v.modelSource.replace(/\.ts$/, ""))))
	];

        ${imports.filter((c, i, a) => c.source[0] == "." && a.map(e => e.item).indexOf(c.item) == i).map(s => s.toString()).join("\n")}

        */

        return 
    }

    static from(context: Context, basePath: string, node: ts.ImportDeclaration, sourceFile: ts.SourceFile) {
        const imports: Import[] = [];

        for (let name of node.getText(sourceFile).split("{")[1].split("}")[0].split(",")) {
            const moduleSpecifier = node.moduleSpecifier.getText()

            if (moduleSpecifier[0] == ".") {
                imports.push(new Import(name.trim(), `./${path.relative(
                    path.dirname(path.resolve(context.config.root, context.config.services.serverOutFile)),
                    path.resolve(path.dirname(basePath), moduleSpecifier)
                ).replace(/\.ts$/, "")}`));
            } else {
                imports.push(new Import(moduleSpecifier, name.trim()));
            }
        }

        return imports;
    }
}
