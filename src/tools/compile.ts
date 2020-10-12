import { config } from "../config";
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { sha512 } from "js-sha512";

let routes = [];

function compile(path: string, root: string, program: ts.Program, typeChecker: ts.TypeChecker) {
	console.log(`COMPILE ${path}`);

	const sourceFile = program.getSourceFile(path);

	const imports = [];

	ts.transform(sourceFile, [
		<T extends ts.Node>(context: ts.TransformationContext) => (rootNode: T) => {
			function visit(node): ts.Node {
				if (node.kind == ts.SyntaxKind.ImportDeclaration) {
					console.log(node);

					imports.push({
						path: sourceFile.fileName.replace(root, "."),
						root,
						sou: sourceFile.fileName
					})
				}

				if (node.kind == ts.SyntaxKind.ClassDeclaration) {
					const name = node.name.escapedText;
		
					console.group(name);

					const controller = {
						name,
						injects: [],
						imports
					};
		
					// check for Service inheritage
					if (node.heritageClauses[0] && node.heritageClauses[0].types[0] && node.heritageClauses[0].types[0].expression.escapedText == "Service") {
						for (let member of node.members) {
							console.log(ts.SyntaxKind[member.kind]);

							if (member.kind == ts.SyntaxKind.Constructor) {
								for (let param of member.parameters) {
									console.log(`Inject '${param.type.typeName.escapedText}' as '${param.name.escapedText}' to '${name}'`);

									controller.injects.push({
										name: param.type.typeName.escapedText
									});
								}
							}
		
							if (member.kind == ts.SyntaxKind.MethodDeclaration) {
								const types = [];
								let type = typeChecker.getSignatureFromDeclaration(member).getReturnType() as ts.TypeReference;

								while (type.typeArguments[0]) {
									types.push(type);

									type = type.typeArguments[0] as ts.TypeReference;
								}

								const id = sha512([
									controller.name,
									...types.map(type => type.symbol.escapedName),
									member.name.escapedText
								].join("-"));

								routes.push({
									id,
									controller,
									name: member.name.escapedText,
									returnType: types.map(type => type.symbol.escapedName),
									parameters: []
								});
							}
						}
					}
		
					console.groupEnd();
				}
		
				return ts.visitEachChild(node, visit, context);
			}
		
			return ts.visitNode(rootNode, visit);
		}
	]);
}

function scan(directory: string) {
	const compilerOptions = ts.parseJsonConfigFileContent(
		ts.readConfigFile(
			`${directory}/tsconfig.json`, 
			ts.sys.readFile
		).config,
		ts.sys,
		directory
	);

	const serviceFiles = [];

	for (let item of fs.readdirSync(directory)) {
		const path = `${directory}/${item}`;

		if (fs.lstatSync(path).isDirectory()) {
			scan(path);
		} else if (path.endsWith("service.ts")) {
			try {
				serviceFiles.push(path);
			} catch (e) {
				console.error(`Compiling of '${path}' failed!`, e);
			}
		}
	}

	const program = ts.createProgram([
		directory,
		...serviceFiles
	], null); //, // compilerOptions.options);

	const typeChecker = program.getTypeChecker();
	
	for (let path of serviceFiles) {
		compile(path, directory, program, typeChecker);
	}
}

export function compileServices() {
	for (let dir of config.services.scan) {
		scan(path.resolve(dir));
	}

	console.log(routes.map(r => r.controller.imports));

	fs.writeFileSync(config.services.routingFile, `
import { RootManagedServer } from "vlserver";

${routes.map(r => r.controller.imports.map(i => `
	import {  }
`.trim())).flat().filter((c, i, a) => a.indexOf(c) == i)}

export class ManagedServer extends RootManagedServer {
	prepareRoutes() {
		${routes.map(route => `this.expose(
			${JSON.stringify(route.id)},
			new ${route.controller.name}(${route.controller.injects.map(i => `new ${i.name}()`)}),
			(controller, ${route.parameters.map(p => p.name).join(", ")}) => controller.${route.name}(${route.parameters.map(p => p.name).join(", ")})
		)`).join(";\n\n\t\t")}
	}
}
	`.trim());
}