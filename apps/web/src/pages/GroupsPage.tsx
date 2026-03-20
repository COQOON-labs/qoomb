import { Button, Card, ConfirmDialog, Input } from '@qoomb/ui';
import { useCallback, useState } from 'react';

import { GroupDetail } from '../components/groups/GroupDetail';
import { PlusIcon, TrashIcon, UsersIcon } from '../components/icons';
import { useI18nContext } from '../i18n/i18n-react';
import { AppShell } from '../layouts/AppShell';
import { useAuth } from '../lib/auth/useAuth';
import { trpc } from '../lib/trpc/client';

// ── GroupsPage ────────────────────────────────────────────────────────────────

export function GroupsPage() {
  const { LL } = useI18nContext();
  const { user } = useAuth();

  const utils = trpc.useUtils();

  const { data: groups = [], isLoading } = trpc.groups.list.useQuery(undefined, {
    enabled: !!user,
  });

  // ── Create form ──────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const createGroup = trpc.groups.create.useMutation({
    onSuccess: () => {
      void utils.groups.list.invalidate();
      setNewName('');
      setNewDescription('');
      setShowCreate(false);
    },
  });

  const handleCreateSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const name = newName.trim();
      if (!name) return;
      createGroup.mutate({
        name,
        ...(newDescription.trim() ? { description: newDescription.trim() } : {}),
      });
    },
    [newName, newDescription, createGroup]
  );

  const handleCancelCreate = useCallback(() => {
    setNewName('');
    setNewDescription('');
    setShowCreate(false);
  }, []);

  // ── Delete ───────────────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const deleteGroup = trpc.groups.delete.useMutation({
    onSuccess: () => {
      void utils.groups.list.invalidate();
      setDeletingId(null);
    },
    onError: () => {
      setDeletingId(null);
    },
  });

  const handleDeleteClick = useCallback((id: string) => {
    setConfirmDeleteId(id);
  }, []);

  const handleDeleteConfirmed = useCallback(() => {
    if (!confirmDeleteId) return;
    setDeletingId(confirmDeleteId);
    deleteGroup.mutate(confirmDeleteId);
    setConfirmDeleteId(null);
  }, [confirmDeleteId, deleteGroup]);

  // ── Detail view ──────────────────────────────────────────────────────────
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  return (
    <AppShell>
      <div className="px-4 md:px-8 pt-6 pb-10 max-w-3xl">
        {selectedGroupId ? (
          <GroupDetail groupId={selectedGroupId} onBack={() => setSelectedGroupId(null)} />
        ) : (
          <>
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-black text-foreground tracking-tight">
                {LL.groups.title()}
              </h1>
              {!showCreate && (
                <Button
                  variant="primary"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowCreate(true)}
                >
                  <PlusIcon className="w-4 h-4" />
                  {LL.groups.newGroup()}
                </Button>
              )}
            </div>

            {/* ── Create form ────────────────────────────────────── */}
            {showCreate && (
              <Card padding="md" className="mb-4">
                <form onSubmit={handleCreateSubmit} className="flex flex-col gap-3">
                  <Input
                    label={LL.groups.groupNameLabel()}
                    placeholder={LL.groups.groupNamePlaceholder()}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <Input
                    label={LL.groups.descriptionLabel()}
                    placeholder={LL.groups.descriptionPlaceholder()}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={!newName.trim() || createGroup.isPending}
                    >
                      {LL.groups.createGroup()}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={handleCancelCreate}>
                      {LL.common.cancel()}
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {/* ── Group list ─────────────────────────────────────── */}
            {isLoading ? (
              <p className="text-sm text-muted-foreground">{LL.common.loading()}</p>
            ) : groups.length === 0 && !showCreate ? (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <UsersIcon className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm font-medium text-foreground">{LL.groups.emptyState()}</p>
                <p className="text-sm text-muted-foreground">{LL.groups.emptyStateHint()}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1 gap-1.5"
                  onClick={() => setShowCreate(true)}
                >
                  <PlusIcon className="w-3.5 h-3.5" />
                  {LL.groups.newGroup()}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {groups.map((group) => (
                  <Card
                    key={group.id}
                    padding="none"
                    className="group hover:border-foreground/20 transition-colors"
                  >
                    <div className="flex items-center">
                      {/* F-001: native <button> as the main clickable surface so keyboard
                          users can focus + activate via Enter/Space (WCAG 2.1 SC 2.1.1).
                          The delete button sits outside this button to avoid nesting
                          interactive elements (WCAG 2.1 SC 4.1.2). */}
                      <button
                        type="button"
                        className="flex-1 text-left cursor-pointer"
                        onClick={() => setSelectedGroupId(group.id)}
                      >
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          <UsersIcon className="w-5 h-5 text-muted-foreground shrink-0" />

                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground truncate">{group.name}</p>
                            {group.description && (
                              <p className="text-xs text-muted-foreground truncate">
                                {group.description}
                              </p>
                            )}
                          </div>

                          <span className="text-xs text-muted-foreground shrink-0">
                            {LL.groups.memberCount({ count: group.memberCount })}
                          </span>
                        </div>
                      </button>

                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 mx-3 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                        onClick={() => handleDeleteClick(group.id)}
                        disabled={deletingId === group.id}
                        aria-label={LL.groups.deleteGroup()}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title={LL.groups.deleteConfirm()}
        confirmLabel={LL.groups.deleteGroup()}
        cancelLabel={LL.common.cancel()}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </AppShell>
  );
}
