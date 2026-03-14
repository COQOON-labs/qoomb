import { getInitials } from '@qoomb/types';
import { Button, Card, Input } from '@qoomb/ui';
import { useCallback, useState } from 'react';

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

  const deleteGroup = trpc.groups.delete.useMutation({
    onSuccess: () => {
      void utils.groups.list.invalidate();
      setDeletingId(null);
    },
    onError: () => {
      setDeletingId(null);
    },
  });

  const handleDeleteClick = useCallback(
    (id: string) => {
      if (!window.confirm(LL.groups.deleteConfirm())) return;
      setDeletingId(id);
      deleteGroup.mutate(id);
    },
    [LL, deleteGroup]
  );

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
                    className="group cursor-pointer hover:border-foreground/20 transition-colors"
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

                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(group.id);
                        }}
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
    </AppShell>
  );
}

// ── GroupDetail (inline sub-view) ─────────────────────────────────────────────

function GroupDetail({ groupId, onBack }: { groupId: string; onBack: () => void }) {
  const { LL } = useI18nContext();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: group, isLoading } = trpc.groups.get.useQuery(groupId, {
    enabled: !!user,
  });

  const { data: allMembers = [] } = trpc.persons.list.useQuery(undefined, {
    enabled: !!user,
  });

  // ── Add member ───────────────────────────────────────────────────────────
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState('');

  const addMember = trpc.groups.addMember.useMutation({
    onSuccess: () => {
      void utils.groups.get.invalidate(groupId);
      void utils.groups.list.invalidate();
      setSelectedPersonId('');
      setShowAddMember(false);
    },
  });

  const handleAddMember = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedPersonId) return;
      addMember.mutate({ groupId, personId: selectedPersonId });
    },
    [groupId, selectedPersonId, addMember]
  );

  // ── Remove member ────────────────────────────────────────────────────────
  const removeMember = trpc.groups.removeMember.useMutation({
    onSuccess: () => {
      void utils.groups.get.invalidate(groupId);
      void utils.groups.list.invalidate();
    },
  });

  const handleRemoveMember = useCallback(
    (personId: string, name: string | null) => {
      const display = name ?? '?';
      if (!window.confirm(LL.groups.removeMemberConfirm({ name: display }))) return;
      removeMember.mutate({ groupId, personId });
    },
    [LL, groupId, removeMember]
  );

  // Members not yet in this group (for add dropdown)
  const groupMemberIds = new Set(group?.members.map((m) => m.personId) ?? []);
  const availableMembers = allMembers.filter((m) => !groupMemberIds.has(m.id));

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{LL.common.loading()}</p>;
  }

  if (!group) {
    return (
      <div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          ← {LL.groups.backToGroups()}
        </button>
        <p className="text-sm text-foreground">{LL.groups.notFound()}</p>
      </div>
    );
  }

  return (
    <div>
      {/* Back + header */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        ← {LL.groups.backToGroups()}
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black text-foreground tracking-tight">{group.name}</h2>
          {group.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{group.description}</p>
          )}
        </div>
        {!showAddMember && (
          <Button
            variant="primary"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowAddMember(true)}
          >
            <PlusIcon className="w-4 h-4" />
            {LL.groups.addMember()}
          </Button>
        )}
      </div>

      {/* Add member form */}
      {showAddMember && (
        <Card padding="md" className="mb-4">
          <form onSubmit={handleAddMember} className="flex flex-col gap-3">
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              {LL.groups.selectMember()}
            </label>
            <select
              value={selectedPersonId}
              onChange={(e) => setSelectedPersonId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="">—</option>
              {availableMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName ?? '—'}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!selectedPersonId || addMember.isPending}
              >
                {LL.groups.addMember()}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddMember(false)}
              >
                {LL.common.cancel()}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Group members */}
      {group.members.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{LL.groups.noMembers()}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {group.members.map((member) => (
            <Card key={member.id} padding="none" className="group">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                  {getInitials(member.displayName, '?')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">
                    {member.displayName ?? '—'}
                  </p>
                </div>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                  onClick={() => handleRemoveMember(member.personId, member.displayName)}
                  aria-label={LL.groups.removeMember()}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
