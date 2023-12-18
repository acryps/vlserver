import { config } from "./config";
import * as ts from "typescript";
import * as fs from "fs";
import * as pathtools from "path";
import { sha512 } from "js-sha512";

let routes = [];
const viewModels: ViewModel[] = [];
const injects = {};
const enums = {};

type ViewModel = {
	name: string,
	baseViewModelProperties: ts.Symbol[],
	modelProperties: ts.Symbol[],
	viewModelProperties: ts.Symbol[],
	modelType: string,
	modelSource: string,
	properties: any,
	path: string
}

function compile(paths: string[], program: ts.Program, typeChecker: ts.TypeChecker) {
	let uncompiledNodes: {
		inheritance: string,
		node: ts.ClassDeclaration,
		name: string,
		path: string
	}[] = [];

	for (const path of paths) {
		const sourceFile = program.getSourceFile(path);
	
		const imports = [];
	
		ts.transform(sourceFile, [
			<T extends ts.Node>(context: ts.TransformationContext) => (rootNode: T) => {
				function visit(node): ts.Node {
					if (node.kind == ts.SyntaxKind.ImportDeclaration) {
						for (let name of node.getText(sourceFile).split("{")[1]?.split("}")[0].split(",") || []) {
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
	
						const inheritance = node.heritageClauses?.[0]?.types[0]?.expression.escapedText;
	
						if (inheritance == "Service") {
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
			
								if (member.kind == ts.SyntaxKind.MethodDeclaration && !(["onrequest", "onerror"].includes(member.name.escapedText))) {
									let type = typeChecker.getSignatureFromDeclaration(member).getReturnType() as any;
									let types = [type];
	
									if (type.resolvedTypeArguments) {
										while (type && type.resolvedTypeArguments && type.resolvedTypeArguments[0]) {
											type = type.resolvedTypeArguments[0];
	
											types.unshift(type);
										}
									}
	
									// remove Promises from type chain
									types = types.filter(t => t.symbol ? t.symbol.escapedName != "Promise" : true).map(t => t.symbol ? t.symbol.escapedName : t.intrinsicName);
	
									const typeNames = [];
	
									// resolve unknown from results
									for (let type of types.reverse()) {
										if (type == "UnknownFromResult") {
											let name;
	
											function findReturn(node): ts.Node {
												if (ts.isReturnStatement(node)) {
													if (node.expression) {
														if (ts.isCallExpression(node.expression)) {
															if ((node.expression.expression as any)?.name?.escapedText == "from") {
																if ((node.expression.expression as any).expression) {
																	name = (node.expression.expression as any).expression.escapedText;
																}
															}
														}
													}
												}
	
												return ts.visitEachChild(node, findReturn, context);
											}
	
											ts.visitNode(member, findReturn);
	
											if (!name) {
												throw new Error(`Cannot find return type of '${member.name.escapedText}' in '${controller.name}'!`);
											}
	
											// add resolved from name to type stack
											typeNames.push("Array", name);
										} else {
											typeNames.push(type);
										}
									}
	
									const id = sha512([
										controller.name,
										...types,
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
										returnType: typeNames,
										parameters: member.parameters.map(parameter => ({
											id: sha512([
												id,
												parameter.name.escapedText,
												parameter.type.getText(sourceFile)
											].join("_".repeat(420))).replace(/[a-f0-9]{16}/g, m => Buffer.from(parseInt(m, 16).toString(36)).toString('base64').substr(2, 4)),
											name: parameter.name.escapedText,
											isArray: parameter.type.getText(sourceFile).includes("[]") || parameter.type.getText(sourceFile).includes("Array<"),
											type: parameter.type.getText(sourceFile).replace("[]", "").replace("Array<", "").replace(">", "")
										}))
									});
								}
							}
						} else if (inheritance == "ViewModel") {
							const modelType = typeChecker.getTypeAtLocation(node.heritageClauses[0].types[0].typeArguments[0]);
							const modelProperties = typeChecker.getTypeAtLocation(node.heritageClauses[0].types[0].typeArguments[0]).getProperties();
							const baseViewModelProperties = typeChecker.getTypeAtLocation(node.heritageClauses[0].types[0]).getProperties();

							const viewModelProperties = typeChecker.getTypeAtLocation(node).getProperties()
								.filter(property => !baseViewModelProperties.find(p => p.escapedName == property.escapedName));

							const viewModel: ViewModel = {
								name,
								baseViewModelProperties,
								modelProperties,
								modelType: typeChecker.typeToString(modelType),
								modelSource: modelType.symbol.declarations[0].parent.getSourceFile().fileName,
								properties: {},
								viewModelProperties,
								path
							}

							viewModels.push(compileViewModel(typeChecker, viewModel));
						} else if (inheritance) {
							uncompiledNodes.push({
								inheritance,
								node,
								name, 
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

	let lastUncompiledNodeLength = uncompiledNodes.length;

	while (uncompiledNodes.length) {
		const node = uncompiledNodes.shift();

		const parent = viewModels.find(model => model.name == node.inheritance);

		if (parent) {
			const viewModelProperties = typeChecker.getTypeAtLocation(node.node).getProperties()
				.filter(property => !parent.baseViewModelProperties.find(p => p.escapedName == property.escapedName));

			for (const property of parent.viewModelProperties) {
				const matchingProperty = viewModelProperties.find(child => child.escapedName == property.escapedName && node.node.members.some(member => child.escapedName == (member.name as any)?.escapedText));

				function getTypeName(property: ts.Symbol) {
					return typeChecker.typeToString(typeChecker.getTypeAtLocation((property.declarations[0] as any).type))
				}

				if (matchingProperty && getTypeName(matchingProperty) == getTypeName(property)) {
					console.warn(`Duplicate property declaration: "${node.name}" extending from "${parent.name}" both have property "${matchingProperty.escapedName}" of same type`);
				}
			}

			const viewModel: ViewModel = {
				name: node.name,
				baseViewModelProperties: parent.baseViewModelProperties,
				modelProperties: [...parent.modelProperties],
				viewModelProperties,
				modelType: parent.modelType,
				modelSource: parent.modelSource,
				properties: {},
				path: node.path
			}

			viewModels.push(compileViewModel(typeChecker, viewModel));
		} else {
			uncompiledNodes.push(node);
		}

		// remaining classes are not children of view models
		if (lastUncompiledNodeLength == uncompiledNodes.length) {
			break;
		}

		lastUncompiledNodeLength = uncompiledNodes.length;
	}
}

function compileViewModel(typeChecker: ts.TypeChecker, viewModel: ViewModel) {
	const properties = {};

	for (let property of viewModel.modelProperties) {
		const viewModelProperty = viewModel.viewModelProperties.find(p => p.escapedName == property.escapedName);

		if (viewModelProperty) {
			const modelPropertyType = typeChecker.getTypeAtLocation(
				(property.declarations[0] as any).type
			);

			const viewModelPropertyType = typeChecker.getTypeAtLocation(
				(viewModelProperty.declarations[0] as any).type
			);

			const modelPropertyName = (property.declarations[0] as any) && (property.declarations[0] as any).type && (property.declarations[0] as any).type.getText();

			if (modelPropertyName && modelPropertyName.startsWith("Partial<ForeignReference<")) {
				properties[property.escapedName.toString()] = {
					name: property.escapedName,
					propertyType: typeChecker.typeToString(viewModelPropertyType),
					type: convertToStoredType(typeChecker.typeToString(viewModelPropertyType)),
					fetch: {
						single: typeChecker.typeToString(viewModelPropertyType),
					}
				}
			} else if (modelPropertyName && modelPropertyName.startsWith("PrimaryReference<")) {
				const asViewModel = typeChecker.typeToString(
					(viewModelPropertyType as any).resolvedTypeArguments[0]
				);

				properties[property.escapedName.toString()] = {
					name: property.escapedName,
					propertyType: typeChecker.typeToString(
						(viewModelPropertyType as any).resolvedTypeArguments[0]
					),
					type: convertToStoredType(typeChecker.typeToString(
						(viewModelPropertyType as any).resolvedTypeArguments[0]
					)),
					fetch: {
						many: asViewModel
					}
				}
			} else if (modelPropertyType.getBaseTypes()?.find(b => b.symbol.escapedName == "QueryEnum")) {
				const values = {};

				for (let [key, value] of modelPropertyType.symbol.exports as any) {
					if (value.valueDeclaration) {
						values[key] = value.valueDeclaration.initializer.text;
					}
				}

				enums[modelPropertyType.symbol.escapedName.toString()] = values;

				properties[property.escapedName.toString()] = {
					name: property.escapedName,
					propertyType: modelPropertyType.symbol.escapedName.toString(),
					type: modelPropertyType.symbol.escapedName.toString(),
					enum: true
				};
			} else {
				const type = typeChecker.typeToString(viewModelPropertyType);
				
				properties[property.escapedName.toString()] = {
					name: property.escapedName,
					propertyType: "symbol" in viewModelPropertyType && type != "any" ? type : typeChecker.typeToString(modelPropertyType),
					type: convertToStoredType(typeChecker.typeToString(modelPropertyType))
				};
			}
		}
	}

	for (let property of viewModel.viewModelProperties) {
		if (!properties[property.escapedName.toString()]) {
			throw new Error(`"${property.escapedName}" in ViewModel "${viewModel.name}" does not exist in Model "${viewModel.modelType}"`);
		}
	}

	viewModel.properties = properties;

	return viewModel;
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
			} else if (path.endsWith(".ts")) {
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
	
	compile(serviceFiles, program, typeChecker);
}

export class Import {
	constructor(public item: string, public source: string) {}

	toString() {
		return `import { ${this.item} } from ${JSON.stringify(`./${this.source.replace(/\\/g, "/")}`)};`;
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

	const imports = [
		...routes.flatMap(r => r.controller.imports.map(i => new Import(i.name, i.file))),
		...viewModels.map(v => new Import(v.name, pathtools.relative(pathtools.basename(config.services.serverOutFile), v.path.replace(/\.ts$/, "")))),
		...viewModels.map(v => new Import(v.modelType, pathtools.relative(pathtools.basename(config.services.serverOutFile), v.modelSource.replace(/\.ts$/, ""))))
	];

	fs.writeFileSync(config.services.serverOutFile, `
import { BaseServer, ViewModel, Inject } from "vlserver";

${imports.filter((c, i, a) => c.source[0] == "." && a.map(e => e.item).indexOf(c.item) == i).map(s => s.toString()).join("\n")}

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
				${route.parameters.map(parameter => `${JSON.stringify(parameter.id)}: {
					isArray: ${parameter.isArray},
					type: ${convertToStoredType(parameter.type)}
				}`)}
			` : ""}},
			inject => inject.construct(${route.controller.name}),
			(controller, params) => controller.${route.name}(
				${route.parameters.map(p => `params[${JSON.stringify(p.id)}]`).join(",\n\t\t\t\t")}
			)
		)`).join(";\n\n\t\t")}
	}
}

ViewModel.mappings = {
	${viewModels.map(viewModel => `${viewModel.name}: class Composed${viewModel.name} extends ${viewModel.name} {
		async map() {
			return {
				${Object.keys(viewModel.properties).map(name => `${name}: ${(() => {
					if (!viewModel.properties[name].fetch) {
						return `this.$$model.${name}`;
					}

					if (viewModel.properties[name].fetch.single) {
						return `new ${viewModel.properties[name].fetch.single}(await BaseServer.unwrap(this.$$model.${name}))`;
					}

					if (viewModel.properties[name].fetch.many) {
						const asViewModel = viewModel.properties[name].fetch.many;

						return `(await this.$$model.${name}.includeTree(ViewModel.mappings.${asViewModel}.items).toArray()).map(item => new ${asViewModel}(item))`;
					}
				})()}`).join(",\n\t\t\t\t")}
			}
		};

		static get items() {
			return this.getPrefetchingProperties(ViewModel.maximumPrefetchingRecursionDepth, []);
		}

		static getPrefetchingProperties(level: number, parents: string[]) {
			let repeats = false;

			for (let size = 1; size <= parents.length / 2; size++) {
				if (!repeats) {
					for (let index = 0; index < parents.length; index++) {
						if (parents[parents.length - 1 - index] == parents[parents.length - 1 - index - size]) {
							repeats = true;
						}
					}
				}
			}

			if (repeats) {
				level--;
			}

			if (!level) {
				return {};
			}

			return {
				${Object.keys(viewModel.properties).map(name => viewModel.properties[name].fetch ? `
			
				get ${name}() {
					return ViewModel.mappings.${viewModel.properties[name].fetch.single || viewModel.properties[name].fetch.many}.getPrefetchingProperties(
						level,
						[...parents, ${JSON.stringify(`${name}-${viewModel.name}`)}]
					);
				}

			`.trim() : `${name}: true`).join(",\n\t\t\t\t")}
			};
		};

		static toViewModel(data) {
			const item = new ${viewModel.name}(null);
			${Object.keys(viewModel.properties).map(name => `${JSON.stringify(name)} in data && (${(() => {
				if (viewModel.properties[name].fetch) {
					if (viewModel.properties[name].fetch.single) {
						return `item.${name} = data.${name} && ViewModel.mappings.${viewModel.properties[name].fetch.single}.toViewModel(data.${name})`;
					} else {
						return `item.${name} = data.${name} && [...data.${name}].map(i => ViewModel.mappings.${viewModel.properties[name].fetch.many}.toViewModel(i))`;
					}
				} else {
					if (viewModel.properties[name].propertyType == "boolean") {
						return `item.${name} = !!data.${name}`;
					}

					if (viewModel.properties[name].propertyType == "string") {
						return `item.${name} = data.${name} === null ? null : \`\${data.${name}}\``;
					}

					if (viewModel.properties[name].propertyType == "number") {
						return `item.${name} = data.${name} === null ? null : +data.${name}`;
					}

					if (viewModel.properties[name].propertyType == "Date") {
						return `item.${name} = data.${name} === null ? null : new Date(data.${name})`;
					}

					if (viewModel.properties[name].enum) {
						return `item.${name} = data.${name} === null ? null : data.${name}`;
					}
				}
			})()});`).join("\n\t\t\t")}

			return item;
		}

		static async toModel(viewModel: ${viewModel.name}) {
			${"id" in viewModel.properties ? `

			let model: ${viewModel.modelType};
			
			if (viewModel.id) {
				model = await ViewModel.globalFetchingContext.findSet(${viewModel.modelType}).find(viewModel.id)
			} else {
				model = new ${viewModel.modelType}();
			}

			`.trim() : `
			
			const model = new ${viewModel.modelType}();
			
			`.trim()}
			
			${Object.keys(viewModel.properties).map(name => `${JSON.stringify(name)} in viewModel && (${(() => {
				if (viewModel.properties[name].fetch) {
					if (viewModel.properties[name].fetch.single) {
						return `model.${name}.id = viewModel.${name} ? viewModel.${name}.id : null`;
					} else {
						return "null";
					}
				} else {
					if (viewModel.properties[name].propertyType == "boolean") {
						return `model.${name} = !!viewModel.${name}`;
					}

					if (viewModel.properties[name].propertyType == "string") {
						return `model.${name} = viewModel.${name} === null ? null : \`\${viewModel.${name}}\``;
					}

					if (viewModel.properties[name].propertyType == "number") {
						return `model.${name} = viewModel.${name} === null ? null : +viewModel.${name}`;
					}

					if (viewModel.properties[name].propertyType == "Date") {
						return `model.${name} = viewModel.${name} === null ? null : new Date(viewModel.${name})`;
					}

					if (viewModel.properties[name].enum) {
						return `model.${name} = viewModel.${name} === null ? null : viewModel.${name}`;
					}
				}
			})()});`).join("\n\t\t\t")}

			return model;
		}
	}`.trim()).join(",\n\t")}
};

	`.trim());

	for (let endpoint of config.services.endpoints) {
		endpoint.generate(routes, viewModels, config, enums);
	}
}

function convertToStoredType(type) {
	return {
		"boolean": '"boolean"',
		"string": '"string"',
		"number": '"number"',
		"Date": '"date"',
		"Buffer": '"buffer"'
	}[type] || type;
}
