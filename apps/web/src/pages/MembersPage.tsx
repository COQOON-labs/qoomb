import { getInitials, ROLE_I18N_KEYS, type PersonRole, type RoleI18nKey } from '@qoomb/types';
import { Button, Card, ConfirmDialog, Input } from '@qoomb/ui';
import { useCallback, useState } from 'react';

import { PlusIcon, TrashIcon, UserIcon } from '../components/icons';
import { useI18nContext } from '../i18n/i18n-react';
import { AppShell } from '../layouts/AppShell';
import { useAuth } from '../lib/auth/useAuth';
import { trpc } from '../lib/trpc/client';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ── MembersPage ───────────────────────────────────────────────────────────────

export function MembersPage() {
  const { LL } = useI18nContext();
  const { user } = useAuth();

  const utils = trpc.useUtils();

  const { data: members = [], isLoading } = trpc.persons.list.useQuery(undefined, {
    enabled: !!user,
  });

  // ── Invite form ──────────────────────────────────────────────────────────
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const invite = trpc.persons.invite.useMutation({
    onSuccess: () => {
      setInviteEmail('');
      setInviteSuccess(true);
      setTimeout(() => setInviteSuccess(false), 3000);
    },
  });

  const handleInviteSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const email = inviteEmail.trim();
      if (!email) return;
      invite.mutate({ email });
    },
    [inviteEmail, invite]
  );

  const handleCancelInvite = useCallback(() => {
    setInviteEmail('');
    setShowInvite(false);
    setInviteSuccess(false);
  }, []);

  // ── Role change ──────────────────────────────────────────────────────────
  const updateRole = trpc.persons.updateRole.useMutation({
    onSuccess: () => {
      void utils.persons.list.invalidate();
    },
  });

  const handleRoleChange = useCallback(
    (personId: string, newRole: PersonRole) => {
      updateRole.mutate({ personId, role: newRole });
    },
    [updateRole]
  );

  // ── Remove member ────────────────────────────────────────────────────────
  const removeMember = trpc.persons.remove.useMutation({
    onSuccess: () => {
      void utils.persons.list.invalidate();
    },
  });

  // F-002: confirmation state replacing window.confirm
  const [confirmRemove, setConfirmRemove] = useState<{ personId: string; name: string } | null>(
    null
  );
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const handleRemove = useCallback((personId: string, name: string | null) => {
    setConfirmRemove({ personId, name: name ?? '?' });
  }, []);

  const handleRemoveConfirmed = useCallback(() => {
    if (confirmRemove) removeMember.mutate(confirmRemove.personId);
    setConfirmRemove(null);
  }, [confirmRemove, removeMember]);

  // ── Pending invitations ───────────────────────────────────────────────────
  const { data: invitations = [], refetch: refetchInvitations } =
    trpc.persons.listInvitations.useQuery(undefined, { enabled: !!user });

  const resendInvitation = trpc.persons.resendInvitation.useMutation({
    onSuccess: () => void refetchInvitations(),
  });
  const revokeInvitation = trpc.persons.revokeInvitation.useMutation({
    onSuccess: () => void refetchInvitations(),
  });

  const handleResend = useCallback(
    (invitationId: string) => resendInvitation.mutate(invitationId),
    [resendInvitation]
  );

  const handleRevoke = useCallback((invitationId: string) => {
    setConfirmRevoke(invitationId);
  }, []);

  const handleRevokeConfirmed = useCallback(() => {
    if (confirmRevoke) revokeInvitation.mutate(confirmRevoke);
    setConfirmRevoke(null);
  }, [confirmRevoke, revokeInvitation]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function getRoleLabel(role: string): string {
    const key = ROLE_I18N_KEYS[role as keyof typeof ROLE_I18N_KEYS] as RoleI18nKey | undefined;
    return LL.roles[key ?? 'member']();
  }

  const isCurrentUser = (personId: string) => personId === user?.personId;

  return (
    <AppShell>
      <div className="px-4 md:px-8 pt-6 pb-10 max-w-3xl">
        {/* ── Header ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-black text-foreground tracking-tight">
            {LL.members.title()}
          </h1>
          {!showInvite && (
            <Button
              variant="primary"
              size="sm"
              className="gap-1.5"
              onClick={() => setShowInvite(true)}
            >
              <PlusIcon className="w-4 h-4" />
              {LL.members.invite()}
            </Button>
          )}
        </div>

        {/* ── Invite form ──────────────────────────────────────────── */}
        {showInvite && (
          <Card padding="md" className="mb-4">
            <form onSubmit={handleInviteSubmit} className="flex flex-col gap-3">
              <Input
                label={LL.members.inviteEmailLabel()}
                type="email"
                placeholder={LL.members.inviteEmailPlaceholder()}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              {inviteSuccess && (
                <p className="text-sm text-success font-medium">{LL.members.inviteSuccess()}</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!inviteEmail.trim() || invite.isPending}
                >
                  {LL.members.inviteSend()}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={handleCancelInvite}>
                  {LL.common.cancel()}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* ── Members list ─────────────────────────────────────────── */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{LL.common.loading()}</p>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <UserIcon className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">{LL.members.emptyState()}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((member) => (
              <Card key={member.id} padding="none" className="group">
                <div className="flex items-center gap-3 px-4 py-3.5">
                  {/* Avatar placeholder */}
                  <div className="w-9 h-9 bg-muted rounded-full flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                    {getInitials(member.displayName, '?')}
                  </div>

                  {/* Name + role */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">
                      {member.displayName ?? '—'}
                      {isCurrentUser(member.id) && (
                        <span className="text-xs text-muted-foreground ml-1.5">
                          {LL.members.you()}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{getRoleLabel(member.role)}</p>
                  </div>

                  {/* Role selector (admin only, not for self) */}
                  {!isCurrentUser(member.id) && (
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value as PersonRole)}
                      className="text-xs rounded border border-border bg-background px-2 py-1 text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={LL.members.changeRole()}
                    >
                      <option value="parent">{LL.roles.parent()}</option>
                      <option value="child">{LL.roles.child()}</option>
                      <option value="org_admin">{LL.roles.orgAdmin()}</option>
                      <option value="manager">{LL.roles.manager()}</option>
                      <option value="member">{LL.roles.member()}</option>
                      <option value="guest">{LL.roles.guest()}</option>
                    </select>
                  )}

                  {/* Remove button (not for self) */}
                  {!isCurrentUser(member.id) && (
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                      onClick={() => handleRemove(member.id, member.displayName)}
                      aria-label={LL.members.removeMember()}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
        {/* ── Pending Invitations ───────────────────────────────────── */}
        {invitations.length > 0 && (
          <div className="mt-8">
            <h2 className="text-base font-bold text-foreground mb-3">
              {LL.members.pendingInvitations()}
            </h2>
            <div className="flex flex-col gap-2">
              {invitations.map((inv) => (
                <Card key={inv.id} padding="none" className="group">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate text-sm">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {LL.members.invitedAt()}: {formatDate(inv.createdAt)} &middot;{' '}
                        {LL.members.expiresAt()}: {formatDate(inv.expiresAt)}
                      </p>
                    </div>
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleResend(inv.id)}
                        disabled={resendInvitation.isPending}
                        className="text-xs px-2 py-1 rounded-md border border-border text-foreground hover:bg-muted transition-colors"
                      >
                        {LL.members.resendInvitation()}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevoke(inv.id)}
                        disabled={revokeInvitation.isPending}
                        className="text-xs px-2 py-1 rounded-md text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        {LL.members.revokeInvitation()}
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* F-002: ConfirmDialog replaces window.confirm for remove member */}
      <ConfirmDialog
        open={!!confirmRemove}
        title={LL.members.removeConfirm({ name: confirmRemove?.name ?? '' })}
        confirmLabel={LL.members.removeMember()}
        cancelLabel={LL.common.cancel()}
        onConfirm={handleRemoveConfirmed}
        onCancel={() => setConfirmRemove(null)}
      />

      {/* F-002: ConfirmDialog for revoke invitation */}
      <ConfirmDialog
        open={!!confirmRevoke}
        title={LL.members.revokeConfirm()}
        confirmLabel={LL.members.revokeInvitation()}
        cancelLabel={LL.common.cancel()}
        onConfirm={handleRevokeConfirmed}
        onCancel={() => setConfirmRevoke(null)}
      />
    </AppShell>
  );
}
