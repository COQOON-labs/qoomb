import { z } from 'zod';

import { paginationSchema, uuidSchema } from './common';

export const listActivitySchema = paginationSchema.extend({
  resourceType: z.string().max(50).optional(),
  resourceId: uuidSchema.optional(),
  actorPersonId: uuidSchema.optional(),
});
