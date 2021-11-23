import { Service } from "./service";
import { Parameter } from "./parameter";
import ts = require("typescript");
import { sha512 } from "js-sha512";
import { Context } from "./context";

export class Route {
    id: string;
    name: string;
    returnType: string[];

    service: Service;
    parameters: Parameter[];

    generatePreparedRoute() {
        return `this.expose(${this.id}, {
            ${this.parameters.map(parameter => `${JSON.stringify(parameter.id)}: { type: ${parameter.type.convertToStoredType()}, isArray: ${parameter.isArray} }`)}
        }, inject => inject.construct(${this.service.name}), (controller, params) => controller.${this.name}(
            ${this.parameters.map(p => `params[${JSON.stringify(p.id)}]`).join(", ")}
        ))`;
    }

    static from(method: ts.MethodDeclaration, service: Service, typeChecker: ts.TypeChecker, context: Context, typescriptContext: ts.TransformationContext) {
        const route = new Route();
        route.name = method.name.getText();
        route.service = service;

        // figure out what the method returns
        let types = [
            typeChecker.getSignatureFromDeclaration(method).getReturnType() as any
        ];

        // find all type arguments
        if (types[0].resolvedTypeArguments) {
            let type = types[0];

            while (type && type.resolvedTypeArguments && type.resolvedTypeArguments[0]) {
                type = type.resolvedTypeArguments[0];

                types.unshift(type);
            }
        }

        // remove Promises from type chain
        types = types.filter(type => {
            if (type.symbol) {
                return type.symbol.escapedName != "Promise";
            } 
            
            return true;
        }).map(t => t.symbol ? t.symbol.escapedName : t.intrinsicName);

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

                    return ts.visitEachChild(node, findReturn, typescriptContext);
                }

                ts.visitNode(method, findReturn);

                if (!name) {
                    throw new Error(`Cannot find return type of '${name}' in '${this.name}'!`);
                }

                // add resolved from name to type stack
                typeNames.push("Array", name);
            } else {
                typeNames.push(type);
            }
        }

        route.id = this.generateId(route, service, typeNames, method.parameters);
        route.returnType = typeNames;

        route.parameters = method.parameters.map(parameter => Parameter.from(parameter, route));

        return route;
    }

    static generateId(route: Route, service: Service, types: string[], parameters: ArrayLike<ts.ParameterDeclaration>) {
        return sha512([
            service.name, 
            ...types,
            route.name,
            JSON.stringify(Array.from(parameters).map(parameter => ({
                name: parameter.name.getText(),
                type: parameter.type.getText()
            })))
        ].join("-")).replace(/[a-f0-9]{16}/g, m => Buffer.from(parseInt(m, 16).toString(36)).toString('base64').substr(2, 4));
    }
}