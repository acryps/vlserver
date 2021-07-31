# Endpoint Adapters
Services can be output in multiple formats.

## native Adapter
Creates native adapter for TypeScript frontends, using `window.fetch` encoded with `window.FormData` to get data. No frameworks are required for clients.

## angular Adapter
Creates bindings as a `@Injectable` angular `Service`. Data will still be fetched using `window.fetch` encoded with `window.FormData`. You'll obviously need angular.

## node Adapter
You need the APIs within another node application? We got you covered. 

You'll need to install `node-fetch` and `form-data` in your node application. 

You need to set `Service.baseUrl = "example.com"` before making any requests. 

You can set custom headers by running `Service.headers["My-Auth"] = "Some Token"` before making any requests. If you need more control, overwrite `Service.getHeaders: (route: string, data: any): any`.

## swift Adapter
vlserver supports Swift/iOS applications. You don't need any packages, vlserver implements FormData on its own. A custom `ServiceError` will be thrown on error.

You need to set `Service.baseUrl = "example.com"` before making any requests.

> Buffers/Blobs are **not** supported yet.