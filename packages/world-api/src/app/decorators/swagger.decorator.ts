import { applyDecorators } from '@nestjs/common';
import { ApiTags, ApiResponse, getSchemaPath } from '@nestjs/swagger';

export function Swagger({
  tag,
  description,
  response,
}: {
  tag: string;
  description: string;
  response: any;
}) {
  return applyDecorators(
    ApiTags(tag),
    ApiResponse({
      status: 200,
      description,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              totalCount: {
                type: 'number',
                description: 'Total count of results',
                example: 1,
              },
              results: {
                type: 'array',
                items: {
                  $ref: getSchemaPath(response),
                },
              },
            },
          },
        },
      },
    }),
    ApiResponse({
      status: 422,
      description: 'Bad request',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              code: {
                type: 'number',
                description: 'Error code',
                example: 422,
              },
              message: {
                type: 'string',
                description: 'Error message',
              },
            },
          },
        },
      },
    })
  );
}
