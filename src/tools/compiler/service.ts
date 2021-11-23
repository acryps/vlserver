import { type } from "os";
import ts = require("typescript");
import { Context } from "./context";
import { Inject } from "./inject";
import { Route } from "./route";

export class Service {
    name: string;

    routes: Route[] = [];

    static isService(node: ts.ClassDeclaration) {
        return node.heritageClauses && 
            node.heritageClauses[0] && 
            node.heritageClauses[0].types && 
            node.heritageClauses[0].types[0] && 
            node.heritageClauses[0].types[0].expression.getText() == "Service"
    }

    static from(node: ts.ClassDeclaration, typeChecker: ts.TypeChecker, context: Context, typescriptContext: ts.TransformationContext) {
        const service = new Service();
        service.name = node.name.getText();

        for (let member of node.members) {
            switch (member.kind) {
                case ts.SyntaxKind.Constructor: {
                    const serviceConstructor = member as ts.ConstructorDeclaration;

                    const inject = new Inject();
                    inject.name = service.name;

                    for (let parameter of serviceConstructor.parameters) {
                        const type = parameter.type.getText();

                        inject.parameters.push(type);

                        /*

                        for (let declaration of typeChecker.getTypeFromTypeNode(parameter.type).symbol.declarations as Declaration) {
                            for (let memboer of declaration.symbol)
                        }

                        ------


                        for (let member of (typeChecker.getTypeFromTypeNode(param.type).symbol.declarations[0] as any).symbol.members.values()) {
										const declaration = member.declarations && member.declarations[0];

										if (declaration && declaration.kind == ts.SyntaxKind.Constructor) {
											for (let parameter of declaration.parameters) {
												injects[parameterTypeName].push(parameter.type.typeName.escapedText);
											}
										}
									}

                        */
                        
                    }

                    break;
                }

                case ts.SyntaxKind.MethodDeclaration: {
                    const method = member as ts.MethodDeclaration;

                    const name = method.name.getText();

                    // filter special functions
                    if (name != "onrequrest" && name != "onerror") {
                        service.routes.push(Route.from(method, service, typeChecker, context, typescriptContext));
                    }

                    break;
                }
            }
        }

        return service;
    }
}