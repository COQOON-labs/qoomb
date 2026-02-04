import { type BaseEntity, type EncryptedEntity, type UUID } from './common';

export interface Event extends BaseEntity, EncryptedEntity {
  hiveId: UUID;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  timezone: string;

  // Recurrence
  recurrenceRule?: string; // iCal RRULE format
  recurrenceExceptions?: Date[]; // Dates to skip

  // Participants
  participants: UUID[]; // Person IDs
  organizerId?: UUID;

  // Location
  location?: string;
  locationCoordinates?: {
    lat: number;
    lng: number;
  };

  // Travel buffer
  travelTimeBefore: number; // minutes
  travelTimeAfter: number; // minutes

  // External sync
  externalSource?: 'google' | 'apple';
  externalId?: string;
  lastSyncedAt?: Date;

  // Search
  embedding?: number[]; // pgvector embedding

  // Metadata
  createdBy: UUID;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  allDay?: boolean;
  timezone?: string;
  recurrenceRule?: string;
  participants: UUID[];
  organizerId?: UUID;
  location?: string;
  locationCoordinates?: {
    lat: number;
    lng: number;
  };
  travelTimeBefore?: number;
  travelTimeAfter?: number;
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  startTime?: Date;
  endTime?: Date;
  allDay?: boolean;
  timezone?: string;
  recurrenceRule?: string;
  participants?: UUID[];
  organizerId?: UUID;
  location?: string;
  locationCoordinates?: {
    lat: number;
    lng: number;
  };
  travelTimeBefore?: number;
  travelTimeAfter?: number;
}

export interface EventFilter {
  startDate?: Date;
  endDate?: Date;
  participants?: UUID[];
  organizerId?: UUID;
}
