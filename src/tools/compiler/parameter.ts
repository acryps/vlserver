import { sha512 } from "js-sha512";
import { ParameterDeclaration } from "typescript";
import { Route } from "./route";
import { Type } from "./type";

export class Parameter {
    id: string;
    name: string;
    type: Type;
    isArray: boolean;

    static from(node: ParameterDeclaration, route: Route) {
        const parameter = new Parameter();
        parameter.name = node.name.getText();

        const typeSource = node.type.getText();

        parameter.type = new Type(typeSource.split("[]").join("").split("Array<").join("").split(">").join(""));
        parameter.isArray = typeSource.includes("[]") || typeSource.includes("Array<");

        parameter.id = this.generateId(route, parameter, typeSource);

        return parameter;
    }

    static generateId(route: Route, parameter: Parameter, typeSource: string) {
        return sha512(`${route.id}-${parameter.name}-${typeSource}`).replace(/[a-f0-9]{16}/g, m => Buffer.from(parseInt(m, 16).toString(36)).toString('base64').substr(2, 4));
    }
}