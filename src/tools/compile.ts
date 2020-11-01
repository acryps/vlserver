import { config } from "./config";
import * as ts from "typescript";
import * as fs from "fs";
import * as pathtools from "path";
import { sha512 } from "js-sha512";

let routes = [];
const viewModels = [];
const injects = {};

function compile(path: string, root: string, program: ts.Program, typeChecker: ts.TypeChecker) {
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
									pathtools.dirname(pathtools.resolve(config.root, config.services.serverOutFile)),
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
		
					imports.push({
						file: `./${pathtools.relative(
							pathtools.dirname(pathtools.resolve(config.root, config.services.serverOutFile)),
							sourceFile.fileName
						).replace(/\.ts$/, "")}`,
						name
					});

					const controller = {
						name,
						imports
					};
		
					// check for Service inheritage
					if (node.heritageClauses[0] && node.heritageClauses[0].types[0] && node.heritageClauses[0].types[0].expression.escapedText == "Service") {
						for (let member of node.members) {
							if (member.kind == ts.SyntaxKind.Constructor) {
								injects[name] = [];

								for (let param of member.parameters) {
									const parameterTypeName = param.type.typeName.escapedText;

									injects[name].push(parameterTypeName);
									injects[parameterTypeName] = [];

									for (let member of (typeChecker.getTypeFromTypeNode(param.type).symbol.declarations[0] as any).symbol.members.values()) {
										const declaration = member.declarations && member.declarations[0];

										if (declaration && declaration.kind == ts.SyntaxKind.Constructor) {
											for (let parameter of declaration.parameters) {
												injects[parameterTypeName].push(parameter.type.typeName.escapedText);
											}
										}
									}
								}
							}
		
							if (member.kind == ts.SyntaxKind.MethodDeclaration) {
								const types = [];
								let type = typeChecker.getSignatureFromDeclaration(member).getReturnType() as any;

								if (type.resolvedTypeArguments) {
									while (type && type.resolvedTypeArguments && type.resolvedTypeArguments[0]) {
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
						const modelProperties = typeChecker.getTypeAtLocation(node.heritageClauses[0].types[0].typeArguments[0]).getProperties();
						const baseViewModelProperties = typeChecker.getTypeAtLocation(node.heritageClauses[0].types[0]).getProperties();

						const viewModelProperties = typeChecker.getTypeAtLocation(node).getProperties()
							.filter(property => !baseViewModelProperties.find(p => p.escapedName == property.escapedName));

						const properties = {};

						for (let property of modelProperties) {
							const viewModelProperty = viewModelProperties.find(p => p.escapedName == property.escapedName);

							if (viewModelProperty) {
								const modelPropertyType = typeChecker.getTypeAtLocation(
									(property.declarations[0] as any).type
								);

								const viewModelPropertyType = typeChecker.getTypeAtLocation(
									(viewModelProperty.declarations[0] as any).type
								);

								if (modelPropertyType.symbol && modelPropertyType.symbol.escapedName == "ForeignReference") {
									properties[property.escapedName.toString()] = {
										name: property.escapedName,
										type: convertToStoredType(typeChecker.typeToString(viewModelPropertyType)),
										fetch: {
											single: typeChecker.typeToString(viewModelPropertyType),
										}
									}
								} else if (modelPropertyType.symbol && modelPropertyType.symbol.escapedName == "PrimaryReference") {
									const asViewModel = typeChecker.typeToString(
										(viewModelPropertyType as any).resolvedTypeArguments[0]
									);

									properties[property.escapedName.toString()] = {
										name: property.escapedName,
										type: convertToStoredType(typeChecker.typeToString(
											(viewModelPropertyType as any).resolvedTypeArguments[0]
										)),
										fetch: {
											many: asViewModel
										}
									}
								} else {
									properties[property.escapedName.toString()] = {
										name: property.escapedName,
										type: convertToStoredType(typeChecker.typeToString(modelPropertyType))
									}
								}
							}
						}

						for (let property of viewModelProperties) {
							if (!properties[property.escapedName.toString()]) {
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

						viewModels.push({
							name,
							properties,
							path
						});
					}
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

	let missingPaths = [];
		let path = pathtools.join(config.root, config.services.serverOutFile);

		while (!fs.existsSync(path = pathtools.dirname(path))) {
			missingPaths.push(path);
		}

		for (let path of missingPaths.reverse()) {
			fs.mkdirSync(path);
		}

	fs.writeFileSync(config.services.serverOutFile, `
import { BaseServer, ViewModel, Inject } from "vlserver";

${[
	...routes.map(r => r.controller.imports.map(i => `
		import { ${i.name} } from ${JSON.stringify(i.file.replace(/\\/g, "/"))};
	`.trim())).flat(),
	...viewModels.map(v => `import { ${v.name} } from ${JSON.stringify(`./${pathtools.relative(
		pathtools.basename(config.services.serverOutFile), 
		v.path.replace(/\.ts$/, "")
	).replace(/\\/g, "/")}`)};
	`.trim())
].filter((c, i, a) => a.indexOf(c) == i).join("\n")}

Inject.mappings = {
	${Object.keys(injects).map(key => `${JSON.stringify(key)}: {
		objectConstructor: ${key},
		parameters: ${JSON.stringify(injects[key])}
	}`).join(",\n\t")}
};

export class ManagedServer extends BaseServer {
	prepareRoutes() {
		${routes.map(route => `this.expose(
			${JSON.stringify(route.id)},
			{${route.parameters.length ? `
				${route.parameters.map(parameter => `${JSON.stringify(parameter.name)}: {
					isArray: ${parameter.isArray},
					type: ${convertToStoredType(parameter.type)}
				}`)}
			` : ""}},
			(inject, params) => inject.construct(${route.controller.name}).${route.name}(${route.parameters.map(p => `params.${p.name}`).join(", ")})
		)`).join(";\n\n\t\t")}
	}
}

ViewModel.mappings = {
	${viewModels.map(viewModel => `${viewModel.name}: class Composed${viewModel.name} extends ${viewModel.name} {
		async map() {
			return {
				${Object.keys(viewModel.properties).map(name => `${name}: ${(() => {
					if (!viewModel.properties[name].fetch) {
						return `this.model.${name}`;
					}

					if (viewModel.properties[name].fetch.single) {
						return `new ${viewModel.properties[name].fetch.single}(await this.model.${name}.fetch())`;
					}

					if (viewModel.properties[name].fetch.many) {
						const asViewModel = viewModel.properties[name].fetch.many;

						return `(await this.model.${name}.includeTree(ViewModel.mappings.${asViewModel}.items).toArray()).map(item => new ${asViewModel}(item))`;
					}
				})()}`).join(",\n\t\t\t\t")}
			}
		};

		static get items() { 
			return {
				${Object.keys(viewModel.properties).map(name => viewModel.properties[name].fetch ? `
			
				${name}: ViewModel.mappings.${viewModel.properties[name].fetch.single || viewModel.properties[name].fetch.many}.items

			`.trim() : `${name}: true`).join(",\n\t\t\t\t")}
			};
		}
	}`.trim()).join(",\n\t")}
};

	`.trim());
}

function convertToStoredType(type) {
	return {
		"boolean": '"boolean"',
		"string": '"string"',
		"number": '"number"'
	}[type] || type;
}