import { getInitials } from '@qoomb/types';
import { Button, Card, ConfirmDialog } from '@qoomb/ui';
import { useCallback, useMemo, useState } from 'react';

import { useI18nContext } from '../../i18n/i18n-react';
import { useAuth } from '../../lib/auth/useAuth';
import { trpc } from '../../lib/trpc/client';
import { PlusIcon, TrashIcon } from '../icons';

interface GroupDetailProps {
  groupId: string;
  onBack: () => void;
}

export function GroupDetail({ groupId, onBack }: GroupDetailProps) {
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
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<{
    personId: string;
    name: string;
  } | null>(null);

  const removeMember = trpc.groups.removeMember.useMutation({
    onSuccess: () => {
      void utils.groups.get.invalidate(groupId);
      void utils.groups.list.invalidate();
    },
  });

  const handleRemoveMember = useCallback((personId: string, name: string | null) => {
    setConfirmRemoveMember({ personId, name: name ?? '?' });
  }, []);

  const handleRemoveMemberConfirmed = useCallback(() => {
    if (!confirmRemoveMember) return;
    removeMember.mutate({ groupId, personId: confirmRemoveMember.personId });
    setConfirmRemoveMember(null);
  }, [confirmRemoveMember, groupId, removeMember]);

  // Members not yet in this group (for add dropdown)
  const availableMembers = useMemo(() => {
    const memberIds = new Set(group?.members.map((m) => m.personId) ?? []);
    return allMembers.filter((m) => !memberIds.has(m.id));
  }, [group?.members, allMembers]);

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

      <ConfirmDialog
        open={confirmRemoveMember !== null}
        title={
          confirmRemoveMember
            ? LL.groups.removeMemberConfirm({ name: confirmRemoveMember.name })
            : ''
        }
        confirmLabel={LL.groups.removeMember()}
        cancelLabel={LL.common.cancel()}
        onConfirm={handleRemoveMemberConfirmed}
        onCancel={() => setConfirmRemoveMember(null)}
      />
    </div>
  );
}
