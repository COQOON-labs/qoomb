import { Button } from '@qoomb/ui';
import { startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { useState } from 'react';

import { useI18nContext } from '../../i18n/i18n-react';
import { trpc } from '../../lib/trpc/client';

/**
 * PassKey management panel — shown in user settings while authenticated.
 * Lists registered PassKeys, allows adding new ones, and removing existing ones.
 */
export function PassKeyManager() {
  const { LL } = useI18nContext();
  const utils = trpc.useUtils();
  const credentials = trpc.auth.passkey.list.useQuery();

  const generateOptions = trpc.auth.passkey.generateRegOptions.useMutation();
  const verifyReg = trpc.auth.passkey.verifyReg.useMutation({
    onSuccess: () => utils.auth.passkey.list.invalidate(),
  });
  const removeKey = trpc.auth.passkey.remove.useMutation({
    onSuccess: () => utils.auth.passkey.list.invalidate(),
  });

  const [addError, setAddError] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const isAdding = generateOptions.isPending || verifyReg.isPending;

  async function handleAdd() {
    setAddError('');
    try {
      const options = await generateOptions.mutateAsync();
      const response = await startRegistration({
        optionsJSON: options as PublicKeyCredentialCreationOptionsJSON,
      });
      await verifyReg.mutateAsync({ response, deviceName: deviceName || undefined });
      setShowAddForm(false);
      setDeviceName('');
    } catch (err) {
      if (err instanceof Error && err.name === 'NotAllowedError') return;
      setAddError(err instanceof Error ? err.message : LL.auth.passKey.registrationFailed());
    }
  }

  function formatDate(date: Date | string | null): string {
    if (!date) return LL.auth.passKey.never();
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(date));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">{LL.auth.passKey.sectionTitle()}</h3>
        <Button size="sm" variant="outline" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? LL.common.cancel() : LL.auth.passKey.addPassKey()}
        </Button>
      </div>

      {showAddForm && (
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
          <input
            type="text"
            placeholder={LL.auth.passKey.deviceNamePlaceholder()}
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button size="sm" fullWidth isLoading={isAdding} onClick={() => void handleAdd()}>
            {LL.auth.passKey.registerPassKey()}
          </Button>
          {addError && <p className="text-xs text-destructive">{addError}</p>}
        </div>
      )}

      {credentials.isLoading && (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {credentials.data && credentials.data.length === 0 && (
        <p className="text-sm text-muted-foreground">{LL.auth.passKey.noPassKeysYet()}</p>
      )}

      {credentials.data?.map((cred) => (
        <div
          key={cred.id}
          className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              {cred.deviceName ?? LL.auth.passKey.defaultName()}
            </span>
            <span className="text-xs text-muted-foreground">
              {LL.auth.passKey.added()} {formatDate(cred.createdAt)} · {LL.auth.passKey.lastUsed()}{' '}
              {formatDate(cred.lastUsedAt)}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            isLoading={removeKey.isPending}
            onClick={() => removeKey.mutate({ credentialId: cred.id })}
          >
            {LL.common.remove()}
          </Button>
        </div>
      ))}
    </div>
  );
}
