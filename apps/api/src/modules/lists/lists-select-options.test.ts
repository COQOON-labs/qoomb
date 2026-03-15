/**
 * Unit tests for ListsService.getSelectOptions()
 *
 * Coverage targets:
 * - select field with options → returns string[]
 * - non-select field → returns []
 * - unknown fieldId / listId → returns []
 * - config without options key → returns []
 * - options array with non-string entries → non-strings filtered out
 */

import type { PrismaService } from '../../prisma/prisma.service';
import type { EncryptionService } from '../encryption';

import { ListsService } from './lists.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FindFirstArgs = {
  where?: { id?: string; listId?: string };
  select?: { fieldType?: boolean; config?: boolean };
};

type FieldStub = { fieldType: string; config: Record<string, unknown> } | null;

function makeService(findFirstResult: FieldStub): ListsService {
  const prisma = {
    listField: {
      findFirst: jest.fn().mockResolvedValue(findFirstResult) as jest.MockedFunction<
        (args: FindFirstArgs) => Promise<FieldStub>
      >,
    },
  } as unknown as PrismaService;

  const enc = {} as unknown as EncryptionService;

  return new ListsService(prisma, enc);
}

const FIELD_ID = 'aaaa0000-0000-0000-0000-000000000001';
const LIST_ID = 'bbbb0000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ListsService.getSelectOptions()', () => {
  it('returns the options array for a valid select field', async () => {
    const service = makeService({
      fieldType: 'select',
      config: { options: ['Open', 'In Progress', 'Done'] },
    });

    const result = await service.getSelectOptions(FIELD_ID, LIST_ID);

    expect(result).toEqual(['Open', 'In Progress', 'Done']);
  });

  it('returns [] for a non-select field type', async () => {
    const service = makeService({
      fieldType: 'text',
      config: { options: ['Open'] }, // options present but field is not select
    });

    const result = await service.getSelectOptions(FIELD_ID, LIST_ID);

    expect(result).toEqual([]);
  });

  it('returns [] when the field is not found (unknown id)', async () => {
    const service = makeService(null);

    const result = await service.getSelectOptions('unknown-id', LIST_ID);

    expect(result).toEqual([]);
  });

  it('returns [] when config has no options key', async () => {
    const service = makeService({
      fieldType: 'select',
      config: {}, // no options
    });

    const result = await service.getSelectOptions(FIELD_ID, LIST_ID);

    expect(result).toEqual([]);
  });

  it('returns [] when config.options is not an array', async () => {
    const service = makeService({
      fieldType: 'select',
      config: { options: 'Open' as unknown as string[] }, // wrong type
    });

    const result = await service.getSelectOptions(FIELD_ID, LIST_ID);

    expect(result).toEqual([]);
  });

  it('filters out non-string entries from the options array', async () => {
    const service = makeService({
      fieldType: 'select',
      config: { options: ['Open', 42, null, 'Done', true, {}] as unknown as string[] },
    });

    const result = await service.getSelectOptions(FIELD_ID, LIST_ID);

    expect(result).toEqual(['Open', 'Done']);
  });

  it('queries for the field using the provided fieldId and listId', async () => {
    const findFirstMock = jest.fn().mockResolvedValue({
      fieldType: 'select',
      config: { options: ['A'] },
    });
    const prisma = {
      listField: { findFirst: findFirstMock },
    } as unknown as PrismaService;

    const service = new ListsService(prisma, {} as unknown as EncryptionService);

    await service.getSelectOptions(FIELD_ID, LIST_ID);

    expect(findFirstMock).toHaveBeenCalledWith({
      where: { id: FIELD_ID, listId: LIST_ID },
      select: { fieldType: true, config: true },
    });
  });

  it('returns [] for an empty options array', async () => {
    const service = makeService({
      fieldType: 'select',
      config: { options: [] },
    });

    const result = await service.getSelectOptions(FIELD_ID, LIST_ID);

    expect(result).toEqual([]);
  });
});
