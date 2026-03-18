import { Button, Card, ConfirmDialog, Input } from '@qoomb/ui';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { CheckIcon, PlusIcon, TrashIcon } from '../components/icons';
import { useI18nContext } from '../i18n/i18n-react';
import { AppShell } from '../layouts/AppShell';
import { useAuth } from '../lib/auth/useAuth';
import { addToast } from '../lib/toast';
import { trpc } from '../lib/trpc/client';

// ── ListsPage ─────────────────────────────────────────────────────────────────

export function ListsPage() {
  const { LL } = useI18nContext();
  const { user } = useAuth();
  const navigate = useNavigate();

  const utils = trpc.useUtils();

  const [showArchived, setShowArchived] = useState(false);

  const { data: lists = [], isLoading } = trpc.lists.list.useQuery(
    { includeArchived: showArchived },
    { enabled: !!user }
  );

  const { data: templates = [] } = trpc.lists.listTemplates.useQuery(undefined, {
    enabled: !!user,
  });

  // ── Create form state ──────────────────────────────────────────────────────
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
    onError: () => {
      addToast(LL.lists.createError(), 'error');
    },
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

  const handleListClick = useCallback(
    (id: string) => {
      void navigate(`/lists/${id}`);
    },
    [navigate]
  );

  return (
    <AppShell>
      <div className="px-4 md:px-8 pt-6 pb-10 max-w-3xl">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
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

        {/* ── List of lists ─────────────────────────────────────────────── */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{LL.common.loading()}</p>
        ) : lists.length === 0 && !showCreate ? (
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
          <div className="flex flex-col gap-2">
            {lists.map((list) => (
              <Card
                key={list.id}
                padding="none"
                className="group cursor-pointer hover:border-foreground/20 transition-colors"
                onClick={() => handleListClick(list.id)}
              >
                <div className="flex items-center gap-3 px-4 py-3.5">
                  {/* Icon / emoji */}
                  <span className="text-xl leading-none w-7 text-center shrink-0">
                    {list.icon ?? '📋'}
                  </span>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{list.name}</p>
                    <div className="flex items-center gap-2">
                      {list._count?.items !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          {LL.lists.itemCount({ count: list._count.items })}
                        </span>
                      )}
                      {list.isArchived && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          {LL.lists.archivedBadge()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Delete button — only for non-system lists */}
                  {!list.systemKey && (
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(list.id, list.systemKey);
                      }}
                      disabled={deletingId === list.id}
                      aria-label={LL.lists.deleteList()}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      {/* ── Delete confirmation ─────────────────────────────────────── */}
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
