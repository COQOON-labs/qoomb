import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Card, ConfirmDialog, Input } from '@qoomb/ui';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CheckIcon, DragHandleIcon, PlusIcon, StarIcon, TrashIcon } from '../components/icons';
import { useI18nContext } from '../i18n/i18n-react';
import { AppShell } from '../layouts/AppShell';
import { useAuth } from '../lib/auth/useAuth';
import { addToast } from '../lib/toast';
import { trpc } from '../lib/trpc/client';

// ── Types ─────────────────────────────────────────────────────────────────────

type ListItem = {
  id: string;
  name: string;
  icon: string | null;
  systemKey: string | null;
  isArchived: boolean;
  isFavorite: boolean;
  favoriteSortOrder: number | null;
  _count?: { items: number };
};

// ── SortableFavoriteRow ───────────────────────────────────────────────────────

interface SortableFavoriteRowProps {
  list: ListItem;
  onStarClick: (id: string) => void;
  onDeleteClick: (id: string, systemKey: string | null) => void;
  onListClick: (id: string) => void;
  deletingId: string | null;
  itemCountLabel: (count: number) => string;
  deleteLabel: string;
  dragToReorderLabel: string;
  removeFromFavoritesLabel: string;
}

function SortableFavoriteRow({
  list,
  onStarClick,
  onDeleteClick,
  onListClick,
  deletingId,
  itemCountLabel,
  deleteLabel,
  dragToReorderLabel,
  removeFromFavoritesLabel,
}: SortableFavoriteRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        padding="none"
        className="group cursor-pointer hover:border-foreground/20 transition-colors"
        onClick={() => onListClick(list.id)}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span className="text-xl leading-none w-8 text-center shrink-0">{list.icon ?? '📋'}</span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground truncate">{list.name}</p>
            {list._count?.items !== undefined && (
              <span className="text-xs text-muted-foreground">
                {itemCountLabel(list._count.items)}
              </span>
            )}
          </div>
          {/* Star — filled, always visible */}
          <button
            type="button"
            className="p-2 rounded-md transition-colors text-primary flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onStarClick(list.id);
            }}
            aria-label={removeFromFavoritesLabel}
          >
            <StarIcon className="w-5 h-5 fill-primary stroke-primary" />
          </button>
          {/* Trash — always at 40% opacity, destructive on hover */}
          {!list.systemKey && (
            <button
              type="button"
              className="p-2 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteClick(list.id, list.systemKey);
              }}
              disabled={deletingId === list.id}
              aria-label={deleteLabel}
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          )}
          {/* Drag handle — trailing position, always visible at 40% */}
          <button
            type="button"
            className="p-2 rounded-md text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing transition-colors touch-none flex-shrink-0"
            aria-label={dragToReorderLabel}
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <DragHandleIcon className="w-5 h-5" />
          </button>
        </div>
      </Card>
    </div>
  );
}

// ── ListRow ───────────────────────────────────────────────────────────────────

interface ListRowProps {
  list: ListItem;
  onStarClick: (id: string) => void;
  onDeleteClick: (id: string, systemKey: string | null) => void;
  onListClick: (id: string) => void;
  deletingId: string | null;
  itemCountLabel: (count: number) => string;
  deleteLabel: string;
  archivedLabel: string;
  addToFavoritesLabel: string;
  removeFromFavoritesLabel: string;
}

function ListRow({
  list,
  onStarClick,
  onDeleteClick,
  onListClick,
  deletingId,
  itemCountLabel,
  deleteLabel,
  archivedLabel,
  addToFavoritesLabel,
  removeFromFavoritesLabel,
}: ListRowProps) {
  return (
    <Card
      padding="none"
      className="group cursor-pointer hover:border-foreground/20 transition-colors"
      onClick={() => onListClick(list.id)}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="text-xl leading-none w-8 text-center shrink-0">{list.icon ?? '📋'}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{list.name}</p>
          <div className="flex items-center gap-2">
            {list._count?.items !== undefined && (
              <span className="text-xs text-muted-foreground">
                {itemCountLabel(list._count.items)}
              </span>
            )}
            {list.isArchived && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {archivedLabel}
              </span>
            )}
          </div>
        </div>
        {/* Star — filled if favorite, outline otherwise; always at 40% opacity */}
        <button
          type="button"
          className={`p-2 rounded-md transition-colors flex-shrink-0 ${
            list.isFavorite ? 'text-primary' : 'text-muted-foreground/40 hover:text-primary'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onStarClick(list.id);
          }}
          aria-label={list.isFavorite ? removeFromFavoritesLabel : addToFavoritesLabel}
        >
          <StarIcon className={`w-5 h-5 ${list.isFavorite ? 'fill-primary stroke-primary' : ''}`} />
        </button>
        {/* Trash — always at 40% opacity, destructive on hover */}
        {!list.systemKey && (
          <button
            type="button"
            className="p-2 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteClick(list.id, list.systemKey);
            }}
            disabled={deletingId === list.id}
            aria-label={deleteLabel}
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        )}
      </div>
    </Card>
  );
}

// ── ListsPage ─────────────────────────────────────────────────────────────────

export function ListsPage() {
  const { LL } = useI18nContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  // ── Data ───────────────────────────────────────────────────────────────────
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: rawLists = [], isLoading } = trpc.lists.list.useQuery(
    { includeArchived: showArchived },
    { enabled: !!user }
  );

  const { data: templates = [] } = trpc.lists.listTemplates.useQuery(undefined, {
    enabled: !!user,
  });

  // ── Derived: sorted + filtered ────────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();

  const sortedLists = useMemo(() => {
    const filtered = q ? rawLists.filter((l) => l.name.toLowerCase().includes(q)) : rawLists;

    return [...filtered].sort((a, b) => {
      // 1. Favorites first (by favoriteSortOrder)
      const aFav = a.isFavorite ? (a.favoriteSortOrder ?? 0) : Infinity;
      const bFav = b.isFavorite ? (b.favoriteSortOrder ?? 0) : Infinity;
      if (aFav !== bFav) return aFav - bFav;
      // 2. Alphabetical within each group
      return a.name.localeCompare(b.name);
    });
  }, [rawLists, q]);

  const favoritesList = useMemo(() => sortedLists.filter((l) => l.isFavorite), [sortedLists]);

  const nonFavoritesList = useMemo(() => sortedLists.filter((l) => !l.isFavorite), [sortedLists]);

  // ── Local favorites order (optimistic DnD) ────────────────────────────────
  const [localFavOrder, setLocalFavOrder] = useState<string[] | null>(null);

  const displayedFavorites = useMemo(() => {
    if (!localFavOrder) return favoritesList;
    const byId = new Map(favoritesList.map((l) => [l.id, l]));
    const ordered = localFavOrder.map((id) => byId.get(id)).filter(Boolean) as typeof favoritesList;
    // Append any newly-favorited items not yet in localFavOrder
    const orderedIds = new Set(localFavOrder);
    return [...ordered, ...favoritesList.filter((l) => !orderedIds.has(l.id))];
  }, [favoritesList, localFavOrder]);

  // ── Toggle favorite ────────────────────────────────────────────────────────
  const toggleFavorite = trpc.lists.toggleFavorite.useMutation({
    onSuccess: (data) => {
      void utils.lists.list.invalidate();
      if (!data.isFavorite) setLocalFavOrder(null);
      addToast(data.isFavorite ? LL.lists.favoriteAdded() : LL.lists.favoriteRemoved(), 'success');
    },
    onError: () => addToast(LL.lists.updateError(), 'error'),
  });

  const handleStarClick = useCallback(
    (id: string) => {
      toggleFavorite.mutate({ listId: id });
    },
    [toggleFavorite]
  );

  // ── Reorder favorites (DnD) ────────────────────────────────────────────────
  const reorderFavorites = trpc.lists.reorderFavorites.useMutation({
    onError: () => {
      setLocalFavOrder(null);
      addToast(LL.lists.updateError(), 'error');
    },
  });

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleFavDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setLocalFavOrder((prev) => {
        const base = prev ?? favoritesList.map((l) => l.id);
        const oldIdx = base.indexOf(String(active.id));
        const newIdx = base.indexOf(String(over.id));
        if (oldIdx === -1 || newIdx === -1) return prev;
        const next = arrayMove(base, oldIdx, newIdx);
        reorderFavorites.mutate({ listIds: next });
        return next;
      });
    },
    [favoritesList, reorderFavorites]
  );

  // ── Create ─────────────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const createList = trpc.lists.create.useMutation({
    onSuccess: () => {
      void utils.lists.list.invalidate();
      setNewName('');
      setSelectedTemplateId('');
      setShowCreate(false);
    },
    onError: () => addToast(LL.lists.createError(), 'error'),
  });

  const handleCreateSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const name = newName.trim();
      if (!name) return;
      createList.mutate({
        name,
        visibility: 'hive',
        ...(selectedTemplateId ? { templateId: selectedTemplateId } : {}),
      });
    },
    [newName, selectedTemplateId, createList]
  );

  const handleCancelCreate = useCallback(() => {
    setNewName('');
    setSelectedTemplateId('');
    setShowCreate(false);
  }, []);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteList = trpc.lists.delete.useMutation({
    onSuccess: () => {
      void utils.lists.list.invalidate();
      setDeletingId(null);
    },
    onError: () => {
      setDeletingId(null);
      addToast(LL.lists.deleteError(), 'error');
    },
  });

  const handleDeleteClick = useCallback((id: string, systemKey: string | null) => {
    if (systemKey) return;
    setConfirmDeleteId(id);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!confirmDeleteId) return;
    setDeletingId(confirmDeleteId);
    deleteList.mutate(confirmDeleteId);
    setConfirmDeleteId(null);
  }, [confirmDeleteId, deleteList]);

  const handleListClick = useCallback((id: string) => void navigate(`/lists/${id}`), [navigate]);

  // ── Shared props for rows ──────────────────────────────────────────────────
  const baseRowProps = {
    onStarClick: handleStarClick,
    onDeleteClick: handleDeleteClick,
    onListClick: handleListClick,
    deletingId,
    itemCountLabel: (count: number) => LL.lists.itemCount({ count }),
    deleteLabel: LL.lists.deleteList(),
  };

  const favoriteRowProps = {
    ...baseRowProps,
    dragToReorderLabel: LL.lists.dragToReorder(),
    removeFromFavoritesLabel: LL.lists.removeFromFavorites(),
  };

  const listRowProps = {
    ...baseRowProps,
    archivedLabel: LL.lists.archivedBadge(),
    addToFavoritesLabel: LL.lists.addToFavorites(),
    removeFromFavoritesLabel: LL.lists.removeFromFavorites(),
  };

  return (
    <AppShell>
      <div className="px-4 md:px-8 pt-6 pb-10 max-w-3xl">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black text-foreground tracking-tight">{LL.lists.title()}</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setShowArchived((p) => !p)}
            >
              {showArchived ? LL.lists.hideArchived() : LL.lists.showArchived()}
            </Button>
            {!showCreate && (
              <Button
                variant="primary"
                size="sm"
                className="gap-1.5"
                onClick={() => setShowCreate(true)}
              >
                <PlusIcon className="w-4 h-4" />
                {LL.lists.newList()}
              </Button>
            )}
          </div>
        </div>

        {/* ── Search ───────────────────────────────────────────────────── */}
        <div className="mb-4">
          <Input
            placeholder={LL.lists.searchPlaceholder()}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* ── Inline create form ───────────────────────────────────────── */}
        {showCreate && (
          <Card padding="md" className="mb-4">
            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input
                    label={LL.lists.listNameLabel()}
                    placeholder={LL.lists.listNamePlaceholder()}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                {templates.length > 0 && (
                  <div className="w-48">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {LL.lists.chooseTemplate()}
                    </label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="">{LL.lists.blankList()}</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.icon ? `${t.icon} ` : ''}
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!newName.trim() || createList.isPending}
                >
                  {LL.lists.createList()}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={handleCancelCreate}>
                  {LL.common.cancel()}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* ── Content ──────────────────────────────────────────────────── */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{LL.common.loading()}</p>
        ) : rawLists.length === 0 && !showCreate ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <CheckIcon className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">{LL.lists.emptyState()}</p>
            <p className="text-sm text-muted-foreground">{LL.lists.emptyStateHint()}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-1 gap-1.5"
              onClick={() => setShowCreate(true)}
            >
              <PlusIcon className="w-3.5 h-3.5" />
              {LL.lists.newList()}
            </Button>
          </div>
        ) : (
          <>
            {q ? (
              /* ── Search mode: flat list, favorites shown with filled star ── */
              <div className="flex flex-col gap-2">
                {sortedLists.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {LL.common.noResults()}
                  </p>
                ) : (
                  sortedLists.map((list) => <ListRow key={list.id} list={list} {...listRowProps} />)
                )}
              </div>
            ) : (
              /* ── Normal mode: favorites + all lists ──────────────────── */
              <>
                {displayedFavorites.length > 0 && (
                  <section className="mb-5">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      {LL.lists.favorites()}
                    </h2>
                    <DndContext
                      sensors={dndSensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleFavDragEnd}
                    >
                      <SortableContext
                        items={displayedFavorites.map((l) => l.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="flex flex-col gap-2">
                          {displayedFavorites.map((list) => (
                            <SortableFavoriteRow key={list.id} list={list} {...favoriteRowProps} />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </section>
                )}

                {nonFavoritesList.length > 0 && (
                  <section>
                    {displayedFavorites.length > 0 && (
                      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">
                        {LL.lists.allLists()}
                      </h2>
                    )}
                    <div className="flex flex-col gap-2">
                      {nonFavoritesList.map((list) => (
                        <ListRow key={list.id} list={list} {...listRowProps} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title={LL.lists.deleteList()}
        description={LL.lists.deleteConfirm()}
        confirmLabel={LL.common.remove()}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
        variant="destructive"
      />
    </AppShell>
  );
}
