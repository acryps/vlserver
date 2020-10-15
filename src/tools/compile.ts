import { config } from "../config";
import * as ts from "typescript";
import * as fs from "fs";
import * as pathtools from "path";
import { sha512 } from "js-sha512";

let routes = [];
const viewModels = [];

function compile(path: string, root: string, program: ts.Program, typeChecker: ts.TypeChecker) {
	console.log(`COMPILE ${path}`);

	const sourceFile = program.getSourceFile(path);

	const imports = [];

	ts.transform(sourceFile, [
		<T extends ts.Node>(context: ts.TransformationContext) => (rootNode: T) => {
			function visit(node): ts.Node {
				if (node.kind == ts.SyntaxKind.ImportDeclaration) {
					for (let name of node.getText(sourceFile).split("{")[1].split("}")[0].split(",")) {
						if (node.moduleSpecifier.text[0] == ".") {
							imports.push({
								file: `./${pathtools.relative(
									pathtools.dirname(pathtools.resolve(config.root, config.services.serverFile)),
									pathtools.resolve(pathtools.dirname(path), node.moduleSpecifier.text)
								).replace(/\.ts$/, "")}`,
								name: name.trim()
							});
						} else {
							imports.push({
								file: node.moduleSpecifier.text,
								name: name.trim()
							});
						}
					}
				}

				if (node.kind == ts.SyntaxKind.ClassDeclaration) {
					const name = node.name.escapedText;
		
					console.group(name);

					imports.push({
						file: `./${pathtools.relative(
							pathtools.dirname(pathtools.resolve(config.root, config.services.serverFile)),
							sourceFile.fileName
						).replace(/\.ts$/, "")}`,
						name
					});

					const controller = {
						name,
						injects: [],
						imports
					};
		
					// check for Service inheritage
					if (node.heritageClauses[0] && node.heritageClauses[0].types[0] && node.heritageClauses[0].types[0].expression.escapedText == "Service") {
						for (let member of node.members) {
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
								let type = typeChecker.getSignatureFromDeclaration(member).getReturnType() as any;

								if (type.resolvedTypeArguments) {
									while (type && type.resolvedTypeArguments && type.resolvedTypeArguments[0]) {
										console.log(type.intrinsicName);

										types.push(type);

										type = type.resolvedTypeArguments[0];
									}
								}

								const id = sha512([
									controller.name,
									...types.map(type => type.symbol.escapedName),
									member.name.escapedText,
									JSON.stringify(member.parameters.map(parameter => ({
										name: parameter.name.escapedText,
										type: parameter.type.getText(sourceFile)
									})))
								].join("-")).replace(/[a-f0-9]{16}/g, m => Buffer.from(parseInt(m, 16).toString(36)).toString('base64').substr(2, 4));

								routes.push({
									id,
									controller,
									name: member.name.escapedText,
									returnType: types.map(type => type.symbol.escapedName),
									parameters: member.parameters.map(parameter => ({
										name: parameter.name.escapedText,
										isArray: parameter.type.getText(sourceFile).includes("[]") || parameter.type.getText(sourceFile).includes("Array<"),
										type: parameter.type.getText(sourceFile).replace("[]", "").replace("Array<", "").replace(">", "")
									}))
								});
							}
						}
					}

					if (node.heritageClauses[0] && node.heritageClauses[0].types[0] && node.heritageClauses[0].types[0].expression.escapedText == "ViewModel") {
						console.log("VIEWMODEL\n", node.getText(sourceFile));

						const modelProperties = typeChecker.getTypeAtLocation(node.heritageClauses[0].types[0].typeArguments[0]).getProperties();

						const baseViewModelProperties = typeChecker.getTypeAtLocation(node.heritageClauses[0].types[0]).getProperties();

						const viewModelProperties = typeChecker.getTypeAtLocation(node).getProperties()
							.filter(property => !baseViewModelProperties.find(p => p.escapedName == property.escapedName));

						const properties = {};

						for (let property of modelProperties) {
							if (viewModelProperties.find(p => p.escapedName == property.escapedName)) {
								properties[property.escapedName.toString()] = {
									name: property.escapedName,
									type: convertToStoredType(
										typeChecker.typeToString(
											typeChecker.getTypeAtLocation(
												(property.declarations[0] as any).type
											)
										)
									),
									fetch: `this.model[${property.escapedName}]`
								}
							}
						}

						for (let property of viewModelProperties) {
							if (!properties[property.escapedName.toString()]) {
								console.log(property);

								properties[property.escapedName.toString()] = {
									name: property.escapedName,
									type: convertToStoredType(
										typeChecker.typeToString(
											typeChecker.getTypeAtLocation(
												(property.declarations[0] as any).type
											)
										)
									)
								}
							}
						}

						console.log(
							modelProperties.map(p => p.escapedName),
							properties
						);
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

	function scanDirectory(directory: string) {
		for (let item of fs.readdirSync(directory)) {
			const path = `${directory}/${item}`;

			if (fs.lstatSync(path).isDirectory()) {
				scanDirectory(path);
			} else if (path.endsWith("service.ts")) {
				serviceFiles.push(path);
			} else if (path.endsWith(".ts") && fs.readFileSync(path).toString().match(/extends\s+ViewModel\</)) {
				serviceFiles.push(path);
			}
		}
	}

	scanDirectory(directory);

	const program = ts.createProgram([
		directory,
		...serviceFiles
	], compilerOptions.options);

	const typeChecker = program.getTypeChecker();
	
	for (let path of serviceFiles) {
		compile(path, directory, program, typeChecker);
	}
}

export function compileServices() {
	for (let dir of config.services.scan) {
		scan(pathtools.resolve(dir));
	}

	fs.writeFileSync(config.services.serverFile, `
import { BaseServer } from "vlserver";

${routes.map(r => r.controller.imports.map(i => `
	import { ${i.name} } from ${JSON.stringify(i.file)};
`.trim())).flat().filter((c, i, a) => a.indexOf(c) == i).join("\n")}

export class ManagedServer extends BaseServer {
	prepareRoutes() {
		${routes.map(route => `this.expose(
			${JSON.stringify(route.id)},
			new ${route.controller.name}(${route.controller.injects.map(i => `new ${i.name}()`)}),
			{${route.parameters.length ? `
				${route.parameters.map(parameter => `${JSON.stringify(parameter.name)}: {
					isArray: ${parameter.isArray},
					type: ${convertToStoredType(parameter.type)}
				}`)}
			` : ""}},
			(controller, params) => controller.${route.name}(${route.parameters.map(p => `params.${p.name}`).join(", ")})
		)`).join(";\n\n\t\t")}
	}
}
	`.trim());
}

function convertToStoredType(type) {
	return {
		"boolean": '"boolean"',
		"string": '"string"',
		"number": '"number"'
	}[type] || type;
}