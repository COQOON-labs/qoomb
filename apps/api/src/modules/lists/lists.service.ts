import { Injectable } from '@nestjs/common';
import {
  type ListField,
  type ListItem,
  type ListItemValue,
  type ListView,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { DecryptFields, EncryptDecryptFields, EncryptionService } from '../encryption';

// ============================================
// TYPES
// ============================================

/** List row including decrypted name and nested fields + views */
export type ListRow = {
  id: string;
  hiveId: string | null;
  creatorId: string | null;
  groupId: string | null;
  name: string; // decrypted (plaintext for global templates)
  icon: string | null;
  type: string;
  systemKey: string | null;
  isTemplate: boolean;
  visibility: string;
  sortOrder: number;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  fields: ListFieldRow[];
  views: ListViewRow[];
  _count?: { items: number };
};

/** ListField row with decrypted name */
export type ListFieldRow = Omit<ListField, 'name'> & { name: string };

/** ListView row with decrypted name */
export type ListViewRow = Omit<ListView, 'name'> & { name: string };

/** ListItem row with decrypted values */
export type ListItemRow = Omit<ListItem, 'values'> & { values: ListItemValueRow[] };

/** Single EAV value with decrypted value */
export type ListItemValueRow = Omit<ListItemValue, 'value'> & { value: string | null };

// ── Input interfaces ──────────────────────────────────────────────────────────

export interface CreateListData {
  name: string;
  icon?: string;
  type?: string;
  visibility: string;
  groupId?: string;
}

export interface UpdateListData {
  name?: string;
  icon?: string | null;
  visibility?: string;
  groupId?: string | null;
  isArchived?: boolean;
  sortOrder?: number;
}

export interface CreateFieldData {
  fieldType: string;
  name: string;
  config?: Record<string, unknown>;
  isRequired?: boolean;
  isTitle?: boolean;
}

export interface UpdateFieldData {
  name?: string;
  config?: Record<string, unknown>;
  isRequired?: boolean;
  sortOrder?: number;
}

export interface CreateViewData {
  name: string;
  viewType: string;
  sortMode?: string;
  config?: Record<string, unknown>;
  filter?: Record<string, unknown>;
  sortBy?: Array<{ fieldId: string; direction: string }>;
  isDefault?: boolean;
}

export interface UpdateViewData {
  name?: string;
  sortMode?: string;
  config?: Record<string, unknown>;
  filter?: Record<string, unknown> | null;
  sortBy?: Array<{ fieldId: string; direction: string }> | null;
  isDefault?: boolean;
}

export interface UpdateItemData {
  values?: Record<string, unknown>;
  sortOrder?: number;
  recurrenceRule?: Record<string, unknown> | null;
}

// ============================================
// SERVICE
// ============================================

/**
 * ListsService
 *
 * Handles all DB operations for lists, list items, fields, and views.
 *
 * Encryption (ADR-0005):
 * - List.name → AES-256-GCM (hive-scoped key)
 * - ListField.name → AES-256-GCM (hive-scoped key)
 * - ListView.name → AES-256-GCM (hive-scoped key)
 * - ListItemValue.value → AES-256-GCM for ALL field types (single encrypted column)
 *   Values are serialized to string before encryption. Client parses back by field type.
 *
 * Encryption approach:
 * - @DecryptFields / @EncryptDecryptFields decorators with nested path syntax
 *   (e.g. 'fields.*.name') handle List, ListField, and ListView name fields.
 * - ListItemValue encryption is manual (_buildValueUpserts / _decryptItemValues)
 *   because values need to be serialized to string before encryption.
 *
 * Callers are responsible for authorization (use requirePermission / requireResourceAccess in the router).
 */

/** Encrypted field paths for a List with included fields + views */
const LIST_ENC_FIELDS = ['name', 'fields.*.name', 'views.*.name'];

/** Encrypted field for a single ListField row */
const FIELD_ENC_FIELDS = ['name'];

/** Encrypted field for a single ListView row */
const VIEW_ENC_FIELDS = ['name'];

/** Safely converts an unknown field value to string without falling back to [object Object]. */
function unknownToStr(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value) ?? '';
}

@Injectable()
export class ListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService
  ) {}

  // ── List CRUD ─────────────────────────────────────────────────────────────

  @DecryptFields({ fields: LIST_ENC_FIELDS, hiveIdArg: 0 })
  // eslint-disable-next-line @typescript-eslint/require-await -- await handled by @DecryptFields wrapper
  async list(
    hiveId: string,
    visibilityFilter: Prisma.ListWhereInput,
    includeArchived = false
  ): Promise<ListRow[]> {
    const where: Prisma.ListWhereInput = { hiveId, ...visibilityFilter };
    if (!includeArchived) where.isArchived = false;

    return this.prisma.list.findMany({
      where,
      include: {
        fields: { orderBy: { sortOrder: 'asc' } },
        views: true,
        _count: { select: { items: true } },
      },
      orderBy: { sortOrder: 'asc' },
    }) as unknown as ListRow[];
  }

  @DecryptFields({ fields: LIST_ENC_FIELDS, hiveIdArg: 1 })
  // eslint-disable-next-line @typescript-eslint/require-await -- await handled by @DecryptFields wrapper
  async getById(id: string, hiveId: string): Promise<ListRow | null> {
    return this.prisma.list.findFirst({
      where: { id, hiveId },
      include: { fields: { orderBy: { sortOrder: 'asc' } }, views: true },
    }) as unknown as ListRow | null;
  }

  @EncryptDecryptFields({ fields: LIST_ENC_FIELDS, hiveIdArg: 1 })
  // eslint-disable-next-line @typescript-eslint/require-await -- await handled by @EncryptDecryptFields wrapper
  async create(data: CreateListData, hiveId: string, creatorId: string): Promise<ListRow> {
    return this.prisma.list.create({
      data: {
        hiveId,
        creatorId,
        name: data.name,
        icon: data.icon ?? null,
        type: data.type ?? 'custom',
        visibility: data.visibility,
        groupId: data.groupId ?? null,
        systemKey: null,
      },
      include: { fields: true, views: true },
    }) as unknown as ListRow;
  }

  @DecryptFields({ fields: LIST_ENC_FIELDS, hiveIdArg: 2 })
  async update(id: string, data: UpdateListData, hiveId: string): Promise<ListRow> {
    const patch: Prisma.ListUncheckedUpdateInput = {};
    if (data.name !== undefined) patch.name = this._encryptName(data.name, hiveId);
    if ('icon' in data) patch.icon = data.icon ?? null;
    if (data.visibility !== undefined) patch.visibility = data.visibility;
    if ('groupId' in data) patch.groupId = data.groupId ?? null;
    if (data.isArchived !== undefined) patch.isArchived = data.isArchived;
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;

    const result = await this.prisma.list.updateMany({ where: { id, hiveId }, data: patch });
    if (result.count === 0) throw new Error('List not found in this hive');

    return this.prisma.list.findUniqueOrThrow({
      where: { id },
      include: { fields: { orderBy: { sortOrder: 'asc' } }, views: true },
    }) as unknown as ListRow;
  }

  async remove(id: string, hiveId: string): Promise<boolean> {
    const result = await this.prisma.list.deleteMany({ where: { id, hiveId } });
    return result.count > 0;
  }

  /**
   * Returns the inbox list for a particular person in a hive, creating it
   * on first access if it does not yet exist.
   *
   * The inbox is a private list with type='inbox'. It is the landing zone for
   * Quick-Add without an explicit list selection. Each person has exactly one
   * inbox per hive, enforced by the partial unique index
   * lists_hive_id_creator_id_inbox_key.
   *
   * Name is stored as plaintext "Inbox" (not encrypted) — it is a fixed system
   * name, not user-defined PII. The client may display a localised label instead.
   */
  @DecryptFields({ fields: LIST_ENC_FIELDS, hiveIdArg: 0 })
  // eslint-disable-next-line @typescript-eslint/require-await -- await handled by @DecryptFields wrapper
  async getOrCreateInbox(hiveId: string, personId: string): Promise<ListRow> {
    return this.prisma.list.upsert({
      where: {
        // Use the raw unique index fields via Prisma's compound unique selector.
        // The partial index (WHERE type='inbox') is enforced at the DB level;
        // Prisma uses the regular compound unique to locate the record.
        hiveId_creatorId_systemKey: { hiveId, creatorId: personId, systemKey: 'inbox' },
      },
      create: {
        hiveId,
        creatorId: personId,
        name: 'Inbox',
        type: 'inbox',
        systemKey: 'inbox',
        visibility: 'private',
        sortOrder: -1, // Always first in the nav
      },
      update: {},
      include: { fields: { orderBy: { sortOrder: 'asc' } }, views: true },
    }) as unknown as ListRow;
  }

  // ── Field CRUD ────────────────────────────────────────────────────────────

  @EncryptDecryptFields({ fields: FIELD_ENC_FIELDS, hiveIdArg: 1 })
  async createField(listId: string, hiveId: string, data: CreateFieldData): Promise<ListFieldRow> {
    const maxOrder = await this.prisma.listField.aggregate({
      where: { listId },
      _max: { sortOrder: true },
    });
    return this.prisma.listField.create({
      data: {
        listId,
        name: data.name,
        fieldType: data.fieldType,
        config: (data.config ?? {}) as Prisma.InputJsonValue,
        isRequired: data.isRequired ?? false,
        isTitle: data.isTitle ?? false,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
      },
    }) as unknown as ListFieldRow;
  }

  @DecryptFields({ fields: FIELD_ENC_FIELDS, hiveIdArg: 2 })
  async updateField(
    id: string,
    listId: string,
    hiveId: string,
    data: UpdateFieldData
  ): Promise<ListFieldRow> {
    const patch: Prisma.ListFieldUncheckedUpdateInput = {};
    if (data.name !== undefined) patch.name = this._encryptName(data.name, hiveId);
    if (data.config !== undefined) patch.config = data.config as Prisma.InputJsonValue;
    if (data.isRequired !== undefined) patch.isRequired = data.isRequired;
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;

    const result = await this.prisma.listField.updateMany({ where: { id, listId }, data: patch });
    if (result.count === 0) throw new Error('Field not found in this list');

    return this.prisma.listField.findUniqueOrThrow({ where: { id } }) as unknown as ListFieldRow;
  }

  async removeField(id: string, listId: string): Promise<boolean> {
    const result = await this.prisma.listField.deleteMany({ where: { id, listId } });
    return result.count > 0;
  }

  /**
   * Return the options array for a select-type field.
   *
   * Options labels are stored as plaintext in the JSONB `config` column —
   * they describe the hive's data schema (e.g. "Open", "Done") but not
   * personal data. Encryption is intentionally omitted here; see ADR-0007.
   *
   * Returns [] for non-select fields or fields with no configured options.
   */
  async getSelectOptions(fieldId: string, listId: string): Promise<string[]> {
    const field = await this.prisma.listField.findFirst({
      where: { id: fieldId, listId },
      select: { fieldType: true, config: true },
    });
    if (!field || field.fieldType !== 'select') return [];
    const cfg = field.config as { options?: unknown };
    if (!Array.isArray(cfg.options)) return [];
    return cfg.options.filter((o): o is string => typeof o === 'string');
  }

  // ── View CRUD ─────────────────────────────────────────────────────────────

  @EncryptDecryptFields({ fields: VIEW_ENC_FIELDS, hiveIdArg: 1 })
  async createView(listId: string, hiveId: string, data: CreateViewData): Promise<ListViewRow> {
    // Q-004: wrap the two-step isDefault reset + create in a transaction so a
    // crash between the two writes never leaves the list with no default view.
    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.listView.updateMany({
          where: { listId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.listView.create({
        data: {
          listId,
          name: data.name,
          viewType: data.viewType,
          sortMode: data.sortMode ?? 'manual',
          config: (data.config ?? {}) as Prisma.InputJsonValue,
          filter: data.filter ? (data.filter as Prisma.InputJsonValue) : Prisma.JsonNull,
          sortBy: data.sortBy ? (data.sortBy as Prisma.InputJsonValue) : Prisma.JsonNull,
          isDefault: data.isDefault ?? false,
        },
      }) as unknown as ListViewRow;
    });
  }

  @DecryptFields({ fields: VIEW_ENC_FIELDS, hiveIdArg: 2 })
  async updateView(
    id: string,
    listId: string,
    hiveId: string,
    data: UpdateViewData
  ): Promise<ListViewRow> {
    const patch: Prisma.ListViewUncheckedUpdateInput = {};
    if (data.name !== undefined) patch.name = this._encryptName(data.name, hiveId);
    if (data.sortMode !== undefined) patch.sortMode = data.sortMode;
    if (data.config !== undefined) patch.config = data.config as Prisma.InputJsonValue;
    if ('filter' in data)
      patch.filter = data.filter ? (data.filter as Prisma.InputJsonValue) : Prisma.JsonNull;
    if ('sortBy' in data)
      patch.sortBy = data.sortBy ? (data.sortBy as Prisma.InputJsonValue) : Prisma.JsonNull;

    if (data.isDefault !== undefined) {
      if (data.isDefault) {
        // Q-004: run the two writes atomically — crash between them would leave
        // the list with no default view.
        await this.prisma.$transaction(async (tx) => {
          await tx.listView.updateMany({
            where: { listId, isDefault: true },
            data: { isDefault: false },
          });
          await tx.listView.updateMany({
            where: { id, listId },
            data: { ...patch, isDefault: true },
          });
        });
        return this.prisma.listView.findUniqueOrThrow({ where: { id } }) as unknown as ListViewRow;
      }
      patch.isDefault = data.isDefault;
    }

    const result = await this.prisma.listView.updateMany({ where: { id, listId }, data: patch });
    if (result.count === 0) throw new Error('View not found in this list');

    return this.prisma.listView.findUniqueOrThrow({ where: { id } }) as unknown as ListViewRow;
  }

  async removeView(id: string, listId: string): Promise<boolean> {
    const result = await this.prisma.listView.deleteMany({ where: { id, listId } });
    return result.count > 0;
  }

  // ── Item CRUD ─────────────────────────────────────────────────────────────

  async listItems(listId: string, hiveId: string): Promise<ListItemRow[]> {
    const items = await this.prisma.listItem.findMany({
      where: { listId, hiveId },
      include: { values: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return this._decryptItemValues(items, hiveId);
  }

  async createItem(
    listId: string,
    hiveId: string,
    creatorId: string,
    values: Record<string, unknown>,
    recurrenceRule?: Record<string, unknown> | null
  ): Promise<ListItemRow> {
    const fields = await this.prisma.listField.findMany({ where: { listId } });
    const fieldMap = new Map(fields.map((f) => [f.id, f]));

    // Place new item at the end of the list
    const lastItem = await this.prisma.listItem.findFirst({
      where: { listId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const nextSortOrder = (lastItem?.sortOrder ?? -1) + 1;

    const item = await this.prisma.listItem.create({
      data: {
        listId,
        hiveId,
        creatorId,
        sortOrder: nextSortOrder,
        ...(recurrenceRule ? { recurrenceRule: recurrenceRule as Prisma.InputJsonValue } : {}),
      },
    });

    const upserts = this._buildValueUpserts(item.id, fieldMap, values, hiveId);
    if (upserts.length > 0) {
      await Promise.all(
        upserts.map((v) =>
          this.prisma.listItemValue.upsert({
            where: { itemId_fieldId: { itemId: item.id, fieldId: v.fieldId } },
            create: v,
            update: v,
          })
        )
      );
    }

    const updated = await this.prisma.listItem.findUniqueOrThrow({
      where: { id: item.id },
      include: { values: true },
    });
    const [decrypted] = this._decryptItemValues([updated], hiveId);
    return decrypted;
  }

  async updateItem(id: string, hiveId: string, data: UpdateItemData): Promise<ListItemRow> {
    const item = await this.prisma.listItem.findFirst({ where: { id, hiveId } });
    if (!item) throw new Error('ListItem not found in this hive');

    const patch: Prisma.ListItemUncheckedUpdateInput = {};
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
    if ('recurrenceRule' in data) {
      patch.recurrenceRule =
        data.recurrenceRule !== null && data.recurrenceRule !== undefined
          ? (data.recurrenceRule as Prisma.InputJsonValue)
          : Prisma.JsonNull;
    }

    if (Object.keys(patch).length > 0) {
      await this.prisma.listItem.update({ where: { id }, data: patch });
    }

    if (data.values && Object.keys(data.values).length > 0) {
      const fields = await this.prisma.listField.findMany({ where: { listId: item.listId } });
      const fieldMap = new Map(fields.map((f) => [f.id, f]));
      const upserts = this._buildValueUpserts(id, fieldMap, data.values, hiveId);
      if (upserts.length > 0) {
        await Promise.all(
          upserts.map((v) =>
            this.prisma.listItemValue.upsert({
              where: { itemId_fieldId: { itemId: id, fieldId: v.fieldId } },
              create: v,
              update: v,
            })
          )
        );
      }
    }

    const updated = await this.prisma.listItem.findUniqueOrThrow({
      where: { id },
      include: { values: true },
    });
    const [decrypted] = this._decryptItemValues([updated], hiveId);
    return decrypted;
  }

  async removeItem(id: string, hiveId: string): Promise<boolean> {
    const result = await this.prisma.listItem.deleteMany({ where: { id, hiveId } });
    return result.count > 0;
  }

  /**
   * Bulk-update sort_order for a set of items in a single transaction.
   *
   * The client sends every item with its new integer index (0, 1, 2, …)
   * after each drag-and-drop reorder. All items must belong to the given
   * listId + hiveId — any unrecognised id is silently skipped.
   */
  async reorderItems(
    listId: string,
    hiveId: string,
    items: Array<{ id: string; sortOrder: number }>
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const { id, sortOrder } of items) {
        await tx.listItem.updateMany({
          where: { id, listId, hiveId },
          data: { sortOrder },
        });
      }
    });
  }

  /**
   * Bulk-update sort_order for a set of fields in a single transaction.
   * Same full-list reindex pattern as reorderItems.
   */
  async reorderFields(
    listId: string,
    fields: Array<{ id: string; sortOrder: number }>
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const { id, sortOrder } of fields) {
        await tx.listField.updateMany({
          where: { id, listId },
          data: { sortOrder },
        });
      }
    });
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  /**
   * Returns global templates (hiveId=null) + hive-specific templates.
   * Global templates store name as plaintext (no hive key available — see ADR-0009).
   * Hive templates have encrypted name/fields/views and are decrypted before returning.
   */
  async listTemplates(hiveId: string): Promise<ListRow[]> {
    const rows = await this.prisma.list.findMany({
      where: {
        isTemplate: true,
        OR: [{ hiveId: null }, { hiveId }],
      },
      include: { fields: { orderBy: { sortOrder: 'asc' } }, views: true },
    });
    return rows.map((t): ListRow => {
      if (t.hiveId === null) {
        // Global template — name and field names are plaintext
        return {
          ...t,
          fields: t.fields,
          views: t.views,
        };
      }
      // Hive-owned template — decrypt name, field names, and view names
      return {
        ...t,
        name: this._decryptName(t.name, hiveId),
        fields: t.fields.map((f) => ({ ...f, name: this._decryptName(f.name, hiveId) })),
        views: t.views.map((v) => ({ ...v, name: this._decryptName(v.name, hiveId) })),
      };
    });
  }

  /**
   * Create a new list by copying the schema (fields + views) from a template.
   *
   * The template is identified by templateId. Both global (hiveId=null) and
   * hive-specific templates are supported. The resulting list is a fully
   * independent copy — changes to the template do not affect it, and vice versa.
   *
   * Field names from global templates are stored as plaintext in the template
   * but are encrypted using the hive key when copied into the new list.
   * This preserves encryption invariants for the new list's data.
   *
   * Returns the new list with fields and views.
   */
  @DecryptFields({ fields: LIST_ENC_FIELDS, hiveIdArg: 3 })
  async createFromTemplate(
    templateId: string,
    data: CreateListData,
    creatorId: string,
    hiveId: string
  ): Promise<ListRow> {
    const template = await this.prisma.list.findFirst({
      where: {
        id: templateId,
        isTemplate: true,
        OR: [{ hiveId: null }, { hiveId }],
      },
      include: { fields: { orderBy: { sortOrder: 'asc' } }, views: true },
    });

    if (!template) throw new Error('Template not found');

    // Encrypt the new list name with the hive key
    const encryptedName = this._encryptName(data.name, hiveId);

    return this.prisma.list.create({
      data: {
        hiveId,
        creatorId,
        name: encryptedName,
        icon: data.icon ?? template.icon ?? null,
        type: 'custom',
        visibility: data.visibility,
        groupId: data.groupId ?? null,
        systemKey: null,
        fields: {
          create: template.fields.map((f) => ({
            name: this._encryptName(f.name, hiveId),
            fieldType: f.fieldType,
            config: f.config as Prisma.InputJsonValue,
            isRequired: f.isRequired,
            isTitle: f.isTitle,
            sortOrder: f.sortOrder,
          })),
        },
        views: {
          create: template.views.map((v) => ({
            name: this._encryptName(v.name, hiveId),
            viewType: v.viewType,
            sortMode: 'sortMode' in v && typeof v.sortMode === 'string' ? v.sortMode : 'manual',
            config: v.config as Prisma.InputJsonValue,
            filter: v.filter ?? Prisma.JsonNull,
            sortBy: v.sortBy ?? Prisma.JsonNull,
            isDefault: v.isDefault,
          })),
        },
      },
      include: { fields: { orderBy: { sortOrder: 'asc' } }, views: true },
    }) as unknown as ListRow;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  // Q-006: Why _encryptName() is used manually instead of @EncryptFields:
  // @EncryptDecryptFields is used on methods where the ENTIRE input object can be
  // encrypted in-place before the method body runs (e.g. create, createField).
  // For partial updates (updateList, updateField, updateView), the method builds
  // a `patch` object from optional fields. @EncryptFields would encrypt the whole
  // `data` argument including undefined fields, which breaks partial-update logic.
  // Manual encryption via _encryptName() is intentional here — it is NOT a gap
  // in safety because _encryptName is always called when `data.name !== undefined`.
  private _encryptName(name: string, hiveId: string): string {
    return this.enc.serializeToStorage(this.enc.encrypt(name, hiveId));
  }

  private _decryptName(ciphertext: string, hiveId: string): string {
    try {
      return this.enc.decrypt(this.enc.parseFromStorage(ciphertext), hiveId);
    } catch {
      return ciphertext; // Fallback: return ciphertext (e.g. during plaintext migration)
    }
  }

  /**
   * Build ListItemValue upsert payloads for the given values map.
   * All values are serialized to string and encrypted (single `value` column).
   */
  private _buildValueUpserts(
    itemId: string,
    fieldMap: Map<string, ListField>,
    values: Record<string, unknown>,
    hiveId: string
  ): Prisma.ListItemValueUncheckedCreateInput[] {
    const rows: Prisma.ListItemValueUncheckedCreateInput[] = [];

    for (const [fieldId, value] of Object.entries(values)) {
      if (value === null || value === undefined) continue;
      const field = fieldMap.get(fieldId);
      if (!field) continue;

      const serialized =
        field.fieldType === 'person' && Array.isArray(value)
          ? JSON.stringify(value)
          : unknownToStr(value);

      rows.push({
        itemId,
        fieldId,
        value: this._encryptName(serialized, hiveId),
      });
    }

    return rows;
  }

  /** Decrypt value column for all items. */
  private _decryptItemValues(
    items: (ListItem & { values: ListItemValue[] })[],
    hiveId: string
  ): ListItemRow[] {
    return items.map((item) => ({
      ...item,
      values: item.values.map((v) => ({
        ...v,
        value: v.value ? this._decryptName(v.value, hiveId) : null,
      })),
    }));
  }
}
