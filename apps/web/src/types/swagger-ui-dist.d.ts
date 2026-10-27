// The ES bundle subpath ships without types; reuse the package's own SwaggerUIBundle typing.
declare module "swagger-ui-dist/swagger-ui-es-bundle.js" {
  import type { SwaggerUIBundle } from "swagger-ui-dist";
  const bundle: SwaggerUIBundle;
  export default bundle;
}
