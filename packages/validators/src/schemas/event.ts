import { z } from 'zod';

export const locationCoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const createEventSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  startTime: z.date(),
  endTime: z.date(),
  allDay: z.boolean().default(false),
  timezone: z.string().default('Europe/Berlin'),
  recurrenceRule: z.string().optional(),
  participants: z.array(z.string().uuid()),
  organizerId: z.string().uuid().optional(),
  location: z.string().max(500).optional(),
  locationCoordinates: locationCoordinatesSchema.optional(),
  travelTimeBefore: z.number().min(0).default(0),
  travelTimeAfter: z.number().min(0).default(0),
}).refine((data) => data.endTime > data.startTime, {
  message: 'End time must be after start time',
  path: ['endTime'],
});

export const updateEventSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  startTime: z.date().optional(),
  endTime: z.date().optional(),
  allDay: z.boolean().optional(),
  timezone: z.string().optional(),
  recurrenceRule: z.string().optional(),
  participants: z.array(z.string().uuid()).optional(),
  organizerId: z.string().uuid().optional(),
  location: z.string().max(500).optional(),
  locationCoordinates: locationCoordinatesSchema.optional(),
  travelTimeBefore: z.number().min(0).optional(),
  travelTimeAfter: z.number().min(0).optional(),
});

export const eventFilterSchema = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  participants: z.array(z.string().uuid()).optional(),
  organizerId: z.string().uuid().optional(),
});

export const eventIdSchema = z.string().uuid();
