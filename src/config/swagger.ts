import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Malewa Fac API',
      version: '1.0.0',
      description: 'API documentation for Malewa Fac backend',
    },
    servers: [
      {
        url: env.appUrl,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/modules/**/routes.ts', './src/app.ts'], // Path to files with documentation
};

export const swaggerSpec = swaggerJsdoc(options);
