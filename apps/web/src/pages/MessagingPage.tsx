import { Button, Input } from '@qoomb/ui';
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useI18nContext } from '../i18n/i18n-react';
import { AppShell } from '../layouts/AppShell';
import { useAuth } from '../lib/auth/useAuth';
import { trpc } from '../lib/trpc/client';

// ── MessagingPage ─────────────────────────────────────────────────────────────

export function MessagingPage() {
  const { LL } = useI18nContext();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [searchParams] = useSearchParams();

  // Active conversation partner (from URL param or selected in list)
  const [partnerPersonId, setPartnerPersonId] = useState<string | null>(
    searchParams.get('with') ?? null
  );
  const [messageText, setMessageText] = useState('');

  // ── Conversations list ────────────────────────────────────────────────────
  const { data: conversations = [] } = trpc.messaging.listConversations.useQuery(
    { limit: 20, page: 1 },
    { enabled: !!user }
  );

  // ── Messages in selected conversation ────────────────────────────────────
  const { data: messages = [], isLoading: messagesLoading } = trpc.messaging.listMessages.useQuery(
    { partnerPersonId: partnerPersonId ?? '', limit: 50, page: 1 },
    { enabled: !!user && !!partnerPersonId }
  );

  // ── Hive members for "new message" selector ───────────────────────────────
  const { data: members = [] } = trpc.persons.list.useQuery(undefined, { enabled: !!user });

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = trpc.messaging.send.useMutation({
    onSuccess: () => {
      setMessageText('');
      void utils.messaging.listMessages.invalidate();
      void utils.messaging.listConversations.invalidate();
    },
  });

  const handleSend = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!partnerPersonId || !messageText.trim()) return;
      sendMessage.mutate({ recipientPersonId: partnerPersonId, body: messageText.trim() });
    },
    [partnerPersonId, messageText, sendMessage]
  );

  // ── Mark conversation read when partner changes ───────────────────────────
  const markRead = trpc.messaging.markConversationRead.useMutation({
    onSuccess: () => void utils.messaging.listConversations.invalidate(),
  });

  const handleSelectPartner = useCallback(
    (pid: string) => {
      setPartnerPersonId(pid);
      markRead.mutate({ partnerPersonId: pid });
    },
    [markRead]
  );

  // Sorted messages: oldest first for chat display
  const sortedMessages = [...messages].reverse();

  // Build a lookup map once whenever the members list changes (O(n) vs O(n²))
  const memberNameMap = useMemo(
    () => new Map(members.map((m) => [m.id, m.displayName])),
    [members]
  );
  const getDisplayName = useCallback(
    (personId: string) => memberNameMap.get(personId) ?? personId.slice(0, 8),
    [memberNameMap]
  );

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-3.5rem)] md:h-screen">
        {/* ── Conversations sidebar ────────────────────────────────────── */}
        <div className="w-64 shrink-0 border-r border-border flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            <h1 className="text-base font-black text-foreground">{LL.messaging.title()}</h1>
          </div>

          {/* Member selector for new conversation */}
          <div className="px-3 py-2 border-b border-border">
            <select
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              value={partnerPersonId ?? ''}
              onChange={(e) => e.target.value && handleSelectPartner(e.target.value)}
            >
              <option value="">{LL.messaging.newMessage()}</option>
              {members
                .filter((m) => m.id !== user?.personId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName ?? m.id.slice(0, 8)}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground px-4 py-4">
                {LL.messaging.noConversations()}
              </p>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.partnerPersonId}
                  onClick={() => handleSelectPartner(conv.partnerPersonId)}
                  className={`w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted transition-colors ${
                    partnerPersonId === conv.partnerPersonId ? 'bg-muted' : ''
                  }`}
                >
                  <div className="w-8 h-8 bg-muted-foreground/20 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                    {getDisplayName(conv.partnerPersonId).slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {getDisplayName(conv.partnerPersonId)}
                    </p>
                    {conv.unreadCount > 0 && (
                      <p className="text-xs text-primary font-semibold">
                        {LL.messaging.unread({ count: conv.unreadCount })}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Message thread ───────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {!partnerPersonId ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">{LL.messaging.selectConversation()}</p>
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-border shrink-0">
                <p className="font-bold text-foreground">{getDisplayName(partnerPersonId)}</p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
                {messagesLoading ? (
                  <p className="text-sm text-muted-foreground">{LL.common.loading()}</p>
                ) : sortedMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {LL.messaging.noMessages()}
                  </p>
                ) : (
                  sortedMessages.map((msg) => {
                    const isOwn = msg.senderPersonId === user?.personId;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] px-3 py-2 rounded-xl text-sm ${
                            isOwn
                              ? 'bg-primary text-primary-foreground rounded-br-sm'
                              : 'bg-muted text-foreground rounded-bl-sm'
                          }`}
                        >
                          {msg.body}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form onSubmit={handleSend} className="border-t border-border px-4 py-3 flex gap-2">
                <Input
                  placeholder={LL.messaging.messagePlaceholder()}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={!messageText.trim() || sendMessage.isPending}
                >
                  {LL.messaging.send()}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
