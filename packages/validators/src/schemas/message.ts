import { z } from 'zod';

import { uuidSchema, paginationSchema } from './common';

export const sendMessageSchema = z.object({
  recipientPersonId: uuidSchema,
  body: z.string().trim().min(1, 'Message cannot be empty').max(10_000),
});

export const listMessagesSchema = paginationSchema.extend({
  partnerPersonId: uuidSchema,
});

export const listConversationsSchema = paginationSchema;

export const messageIdSchema = uuidSchema;
