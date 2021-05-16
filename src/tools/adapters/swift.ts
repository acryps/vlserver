import { ServiceAdapter } from "./base";
import * as fs from "fs";

export class SwiftServiceAdapter extends ServiceAdapter {
	typeMappings = {
		string: "String",
		number: "Double",
		boolean: "Bool",
		Date: "Date"
	}

	getType(type) {
		if (type in this.typeMappings) {
			return this.typeMappings[type];
		}
		
		return type;
	}

	generate(routes, viewModels, config) {
		const controllers = routes.map(r => r.controller).filter((c, i, a) => a.indexOf(c) == i);

		fs.writeFileSync(this.outFile, `
import Foundation

class Service {
	static var baseUrl = ""
	
	func toURL(route: String) -> String {
		return "\\(Service.baseUrl)\\(route)"
	}
}

class RequestBody {
	var boundary: String
	var body: NSMutableData
	
	init() {
		boundary = "Boundary-\\(UUID().uuidString)"
		
		self.body = NSMutableData()
	}

	var header: String {
		return "multipart/form-data; boundary=----\\(boundary)"
	}
	
	func append(name: String, data: Data) {
		body.append("------\\(boundary)\\r\\n".data(using: .ascii)!)
		body.append("Content-Disposition: form-data; name=\\"\\(name)\\"\\r\\n\\r\\n".data(using: .ascii)!)
		body.append(data)
		body.append("\\r\\n------\\(boundary)--\\r\\n\\r\\n".data(using: .ascii)!)
	}
	
	func create() -> Data {
		return Data(body as Data)
	}
}

class ServiceError : Error {
	var message: String
	
	init(message: String) {
		self.message = message
	}
}

${viewModels.map(viewModel => `
class ${viewModel.name} : Codable {
	${Object.keys(viewModel.properties).map(name => {
		const property = viewModel.properties[name];
		const isArray = property.fetch && property.fetch.many;

		return `var ${name}: ${isArray ? "[" : ""}${this.getType(property.propertyType)}${isArray ? "]" : ""};`;
	}).join("\n\t")}
}
`.trim()).join("\n\n")}

${controllers.map(controller => `

class ${controller.name} : Service {
	${routes.filter(r => r.controller == controller).map(route => {
		const isVoid = route.returnType[route.returnType.length - 1] == "void";

		return `

	func ${route.name}(${[
		...route.parameters.map(
			parameter => `${parameter.name}: ${parameter.isArray ? "[" : ""}${this.getType(parameter.type)}${parameter.isArray ? "]" : ""}`
		),
		`completionHandler: @escaping (Error?${isVoid ? "" : `, ${
			route.returnType.slice(0, route.returnType.length - 1).map(t => `[`)
		}${
			this.getType(route.returnType[route.returnType.length - 1])
		}?${
			"]?".repeat(route.returnType.length - 1)
		}`}) -> Void`
	].join(", ")}) {
		let endpoint = URL(string: toURL(route: ${JSON.stringify(route.id)}))
		var request = URLRequest(url: endpoint!)
		request.httpMethod = "POST"
		
		let body = RequestBody()
		${route.parameters.map(
			parameter => `body.append(name: ${JSON.stringify(parameter.id)}, data: try! JSONEncoder().encode(${parameter.name}))`
		).join("\n\t\t")}
		
		request.setValue(body.header, forHTTPHeaderField: "Content-Type")
		request.httpBody = body.create()
		
		let task = URLSession.shared.dataTask(with: request) { (data, response, error) in
			if error != nil {
				completionHandler(error${isVoid ? "" : ", nil"})
				
				return
			}
			
			do {
				let res = try! JSONSerialization.jsonObject(with: data!, options: []) as! [String: Any]
				
				if res["data"] != nil {
					${isVoid ? "completionHandler(nil)" : `let result = res["data"]

					completionHandler(nil, ${route.returnType.slice(0, route.returnType.length - 1).map(t => `(result as! [Any?]).map({ result in return `)}${(() => {
						const type = route.returnType[route.returnType.length - 1];
	
						if (type == "boolean") {
							return "!!result";
						} else if (type == "string") {
							return "result == nil ? nil : result as! String"
						} else if (type == "number") {
							return "result == nil ? nil : result as! Double"
						} else if (type == "Date") {
							return "result == nil ? nil : result as! ISO8601DateFormatter().date(from: result)"
						} else {
							return `result == nil ? nil : try! JSONDecoder().decode(${type}.self, from: result as! Data)`
						} 
					})()}${"})".repeat(route.returnType.length - 1)})`}
				} else if res["aborted"] != nil {
					throw ServiceError(message: "request aborted by server")
				} else if res["error"] != nil {
					throw ServiceError(message: res["error"] as! String)
				}
			} catch let error {
				completionHandler(error${isVoid ? "" : ", nil"})
			}
		}
		
		task.resume()
	}
		`.trim()
	}).join("\n\n\t")}
}
`.trim()).join("\n\n")}`.trim());
	}
}