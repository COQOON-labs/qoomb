import { z } from 'zod';

import { uuidSchema, paginationSchema } from './common';

export const notificationIdSchema = uuidSchema;

export const listNotificationsSchema = paginationSchema.extend({
  onlyUnread: z.boolean().optional(),
});

export const markNotificationReadSchema = uuidSchema;

export const updateNotificationPreferencesSchema = z.record(
  z.string(),
  z.object({
    inApp: z.boolean(),
    email: z.boolean(),
  })
);
