declare module 'swagger-jsdoc' {
  namespace swaggerJsdoc {
    interface Options {
      definition: {
        openapi?: string;
        info: {
          title: string;
          version: string;
          description?: string;
        };
        servers?: Array<{ url: string; description?: string }>;
        components?: Record<string, unknown>;
        paths?: Record<string, unknown>;
      };
      apis?: string[];
    }
  }

  function swaggerJsdoc(options: swaggerJsdoc.Options): object;
  export = swaggerJsdoc;
}
