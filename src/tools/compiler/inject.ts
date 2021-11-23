export class Inject {
    name: string;
    parameters: string[];

    static createMappings(injects: Inject[]) {
        return `Inject.mappings = {
            ${injects.map(inject => `${JSON.stringify(inject.name)}: {
                objectConstructor: ${inject.name},
                parameters: ${inject.parameters.map(parameter => `"${parameter}"`).join(", ")}
            }`).join(",\n\t")}
        };`;
    }
}