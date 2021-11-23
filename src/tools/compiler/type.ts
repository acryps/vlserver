export class Type {
    static boolean = new Type("boolean", "boolean", property => `!!${property}`);
    static string = new Type("string", "string", property => `${property} === null ? null : \`\$${property}\``);
    static number = new Type("number", "number", property => `${property} === null ? null : +${property}`);
    static Date = new Type("Date", "date", property => `${property} === null ? null : new Date(${property})`);
    static Buffer = new Type("Buffer", "buffer");

    constructor(
        public name: string, 
        public storedType?: string,
        public converter?: (property: string) => string
    ) {
        if (name in Type) {
            return Type[name];
        }
    }

    convertToStoredType() {
        if (this.storedType) {
            return `"${this.storedType}"`;
        }

        return this.name;
    }
}