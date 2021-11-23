import { Property } from "./property";
import { Type } from "./type";
import ts = require("typescript");
import { Context } from "./context";

export class ViewModel {
    name: string;
    path: string;
    
    model: Type;
    modelSourcePath: string;

    properties: Property[] = [];

    generateMapping() {
        return `class $${this.name} extends ${this.name} {
            async map() { 
                return {
                    ${this.properties.map(property => property.generateMapping()).join(",\n")}
                }
            }

            static get items() {
                return {
                    ${this.properties.map(property => property.generateTree()).join(",\n")}
                }
            }

            static toViewModel(data) {
                const item = new ${this.name}(null);

                ${this.properties.map(property => property.generateToViewModelConverter()).join("\n")}

                return item;
            }

            static async toModel(viewModel: ${this.name}) {
                ${this.properties.find(property => property.name == "id") ? `let model: ${this.model.convertToStoredType()};

                if (viewModel.id) {
                    model = await ViewModel.globalFetchingContext.findSet(${this.model.convertToStoredType()}).find(viewModel.id);
                } else {
                    model = new ${this.model.convertToStoredType()}();
                }` : `const model = new ${this.model.convertToStoredType()}();`}

                ${this.properties.map(property => property.generateToModelConverter()).join("\n")}

                return model;
            }
        }`;
    }

    static isViewModel(node: ts.ClassDeclaration) {
        return node.heritageClauses && 
            node.heritageClauses[0] && 
            node.heritageClauses[0].types && 
            node.heritageClauses[0].types[0] && 
            node.heritageClauses[0].types[0].expression.getText() == "ViewModel"
    }

    static from(context: Context, path: string, node: ts.ClassDeclaration, typeChecker: ts.TypeChecker) {
        if (!node.heritageClauses[0].types[0].typeArguments) {
            throw new Error("'ViewModel' must have a type argument.");
        }

        const viewModel = new ViewModel();
        viewModel.path = path;

        const modelType = typeChecker.getTypeAtLocation(node.heritageClauses[0].types[0].typeArguments[0]);
        const modelProperties = modelType.getProperties();

        const viewModelBaseProperties = typeChecker.getTypeAtLocation(node.heritageClauses[0].types[0]).getProperties();

        const viewModelProperties = typeChecker.getTypeAtLocation(node).getProperties()
            .filter(property => !viewModelBaseProperties.find(baseProperty => baseProperty.getName() == property.getName())); // skip properties from ViewModel-base class

        for (let viewModelProperty of viewModelProperties) {
            const modelProperty = modelProperties.find(modelProperty => modelProperty.getName() == viewModelProperty.getName());

            if (!modelProperty) {
                throw new Error(`View Model Property '${viewModelProperty.getName()}' from '${node.name.getText()}' not found in '${modelType.getSymbol().getName()}'. Is your database context up to date?`);
            }

            viewModel.properties.push(Property.from(context, viewModelProperty, modelProperty, typeChecker));
        }

        /*

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

        */

        viewModel.model = new Type(typeChecker.typeToString(modelType));
        viewModel.modelSourcePath = modelType.symbol.declarations[0].parent.getSourceFile().fileName;

        return viewModel;
    }
}