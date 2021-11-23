import { Type } from "./type";
import ts = require("typescript");
import { Enumeration } from "./enum";
import { Context } from "./context";

export class Property {
    name: string;
    type: Type;

    enum?: Enumeration;

    fetch?: {
        single?: Type,
        many?: Type
    }

    generateMapping() {
        if (this.fetch?.single) {
            return `new ${this.fetch.single}(await BaseServer.unwrap(this.model.${this.name}))`;
        }

        if (this.fetch?.many) {
            `(await this.model.${this.name}.includeTree(ViewModel.mappings.${this.fetch.many}.items).toArray()).map(item => new ${this.fetch.many}(item))`
        }

        return `this.model.${this.name}`;
    }

    generateTree() {
        if (this.fetch) {
            return `get ${this.name}() { return ViewModel.mappings.${this.fetch.single || this.fetch.many}.items }`;
        }

        return `${this.name}: true`;
    }

    generateToViewModelConverter() {
        if (this.fetch) {
            if (this.fetch.single) {
                return `${JSON.stringify(this.name)} in data && (item.${this.name} = data.${this.name} && ViewModel.mappings.${this.fetch.single}.toViewModel(data.${this.name}))`;
            } 
            
            if (this.fetch.many) {
                return `${JSON.stringify(this.name)} in data && (item.${this.name} = data.${this.name} && [...data.${this.name}].map(i => ViewModel.mappings.${this.fetch.many}.toViewModel(i)))`;
            }
        }

        return `${JSON.stringify(this.name)} in data && (${this.type.converter(`data.${this.name}`)})`;
    }

    generateToModelConverter() {
        if (this.fetch) {
            if (this.fetch.single) {
                return `${JSON.stringify(this.name)} in viewModel && (model.${this.name}.id = viewModel.${this.name} ? viewModel.${this.name}.id : null)`;
            } 
            
            if (this.fetch.many) {
                return ``;
            }
        }

        return `${JSON.stringify(this.name)} in viewModel && (${this.type.converter(`data.${this.name}`)})`;
    }

    static from(context: Context, viewModelProperty: ts.Symbol, modelProperty: ts.Symbol, typeChecker: ts.TypeChecker) {
        const property = new Property();
        property.name = viewModelProperty.getName();

        const modelPropertyDeclaration = modelProperty.declarations[0] as ts.PropertyDeclaration;
        const viewModelPropertyDeclaration = viewModelProperty.declarations[0] as ts.PropertyDeclaration;

        const modelPropertyType = typeChecker.getTypeAtLocation(modelPropertyDeclaration);
        const viewModelPropertyType = typeChecker.getTypeAtLocation(viewModelPropertyDeclaration);

        const modelPropertyTypeString = modelPropertyDeclaration.type?.getText();

        if (modelPropertyType && modelPropertyTypeString.startsWith("Partial<ForeignReference<")) {
            property.type = new Type(typeChecker.typeToString(viewModelPropertyType));
            property.fetch.single = new Type(typeChecker.typeToString(viewModelPropertyType));
        } else if (modelPropertyType && modelPropertyTypeString.startsWith("PrimaryReference<")) {
            property.type = new Type(typeChecker.typeToString((viewModelPropertyType as any).resolvedTypeArguments[0]));
            property.fetch.single = new Type(typeChecker.typeToString(viewModelPropertyType));
        } else if (modelPropertyType.getBaseTypes()?.find(base => base.symbol.getName() == "QueryEnum")) {
            const enumeration = new Enumeration();
            enumeration.name = modelPropertyType.getSymbol().getName();

            for (let [key, value] of modelPropertyType.symbol.exports as any) {
                if (value.valueDeclaration) {
                    enumeration.values[key] = value.valueDeclaration.initializer.text;
                }
            }

            property.type = new Type(enumeration.name);
            property.enum = enumeration;

            context.enumerations.push(enumeration);
        } else {
            property.type = new Type(typeChecker.typeToString(modelPropertyType));
        }

        return property;
    }
}