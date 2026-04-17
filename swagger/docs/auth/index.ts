export const authComponents = {
  schemas: {
    RegisterDto: {
      type: 'object',
      required: ['email', 'password', 'name'],
      properties: {
        email: { type: 'string', format: 'email', description: "User's email address" },
        password: { type: 'string', minLength: 6, description: 'User password (min 6 characters)' },
        name: { type: 'string', minLength: 2, description: "User's full name" },
        phone: { type: 'string', description: 'Optional phone number' },
        profileImage: { type: 'string', format: 'uri', description: 'Optional profile image URL' },
      },
      example: {
        email: 'john@example.com',
        password: 'secret123',
        name: 'John Doe',
        phone: '+1234567890',
      },
    },
    LoginDto: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email', description: "User's email address" },
        password: { type: 'string', description: "User's password" },
      },
      example: {
        email: 'john@example.com',
        password: 'secret123',
      },
    },
    RefreshDto: {
      type: 'object',
      required: ['refreshToken'],
      properties: {
        refreshToken: { type: 'string', description: 'Valid refresh token' },
      },
      example: {
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
    TokenResponse: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string' },
            role: { type: 'string', enum: ['USER', 'ADMIN', 'DELIVERY'] },
            name: { type: 'string' },
          },
        },
        accessToken: { type: 'string', description: 'JWT access token' },
        refreshToken: { type: 'string', description: 'JWT refresh token' },
      },
    },
    Error: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        statusCode: { type: 'integer' },
      },
    },
  },
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    },
  },
};

export const authEndpoints = {
  '/api/v1/auth/register': {
    post: {
      summary: 'Register a new user',
      tags: ['Auth'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RegisterDto' },
          },
        },
      },
      responses: {
        201: {
          description: 'User registered successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  user: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      email: { type: 'string' },
                      role: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        409: { description: 'User already exists', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/v1/auth/login': {
    post: {
      summary: 'Login with email and password',
      tags: ['Auth'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LoginDto' },
          },
        },
      },
      responses: {
        200: { description: 'Login successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } } },
        401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/v1/auth/refresh': {
    post: {
      summary: 'Refresh access token',
      tags: ['Auth'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RefreshDto' },
          },
        },
      },
      responses: {
        200: {
          description: 'Token refreshed successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { accessToken: { type: 'string' } },
              },
            },
          },
        },
        401: { description: 'Invalid refresh token', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
    },
  },
  '/api/v1/auth/google': {
    get: {
      summary: 'Initiate Google OAuth flow',
      tags: ['Auth'],
      responses: { 302: { description: 'Redirects to Google consent screen' } },
    },
  },
  '/api/v1/auth/google/callback': {
    get: {
      summary: 'Google OAuth callback',
      tags: ['Auth'],
      responses: {
        200: { description: 'OAuth authentication successful', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, user: { type: 'object' } } } } } },
        401: { description: 'Authentication failed' },
      },
    },
  },
  '/api/v1/auth/facebook': {
    get: {
      summary: 'Initiate Facebook OAuth flow',
      tags: ['Auth'],
      responses: { 302: { description: 'Redirects to Facebook consent screen' } },
    },
  },
  '/api/v1/auth/facebook/callback': {
    get: {
      summary: 'Facebook OAuth callback',
      tags: ['Auth'],
      responses: {
        200: { description: 'OAuth authentication successful', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, user: { type: 'object' } } } } } },
        401: { description: 'Authentication failed' },
      },
    },
  },
};
