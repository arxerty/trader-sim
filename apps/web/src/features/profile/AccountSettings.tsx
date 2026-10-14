import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi, meApi } from '@/api/endpoints';
import { useApiErrorMessage } from '@/api/useApiError';
import { useAuthStore } from '@/store/authStore';
import { useRunStore } from '@/store/runStore';
import { useUiStore } from '@/store/uiStore';
import { Button, Modal, Switch, TextField, toast } from '@/shared/ui';

/** Own-account section: verification, privacy, sessions, GDPR export and deletion. */
export function AccountSettings() {
  const { t } = useTranslation();
  const errorMessage = useApiErrorMessage();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');

  const resend = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => toast.show({ title: t('account.verificationSent'), variant: 'success' }),
  });
  const privacy = useMutation({
    mutationFn: meApi.privacy,
    onSuccess: (me) => {
      setUser(me);
      void qc.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });
  const logoutAll = useMutation({
    mutationFn: authApi.logoutAll,
    onSuccess: (res) => {
      toast.show({
        title: t('account.sessionsRevoked', { count: res.revoked }),
        variant: 'success',
      });
      useAuthStore.getState().setGuest();
      useUiStore.getState().closeCommunity();
    },
  });
  const exportData = useMutation({
    mutationFn: meApi.exportData,
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tradesim-${user?.nickname ?? 'export'}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
  const remove = useMutation({
    mutationFn: () => meApi.remove(password || undefined, password ? undefined : user?.nickname),
    onSuccess: () => {
      setDeleteOpen(false);
      useRunStore.getState().clear();
      useAuthStore.getState().setGuest();
      useUiStore.getState().closeCommunity();
      toast.show({ title: t('account.deleted'), variant: 'info' });
    },
  });

  if (!user) return null;

  return (
    <section
      aria-labelledby="account-settings"
      className="flex flex-col gap-3 border-t border-border pt-4"
    >
      <h3
        id="account-settings"
        className="text-xs font-semibold uppercase tracking-wide text-muted"
      >
        {t('account.title')}
      </h3>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          {user.email}{' '}
          <span className={user.emailVerified ? 'text-up' : 'text-warning'}>
            · {user.emailVerified ? t('account.verified') : t('account.notVerified')}
          </span>
        </span>
        {!user.emailVerified && (
          <Button size="sm" onClick={() => resend.mutate()} disabled={resend.isPending}>
            {t('account.resend')}
          </Button>
        )}
      </div>
      <Switch
        label={t('account.hideFromLeaderboard')}
        checked={user.hideFromLeaderboard}
        onChange={(v) => privacy.mutate(v)}
      />
      {privacy.isError && (
        <p role="alert" className="text-xs text-down">
          {errorMessage(privacy.error)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => exportData.mutate()} disabled={exportData.isPending}>
          {t('account.export')}
        </Button>
        <Button size="sm" onClick={() => logoutAll.mutate()} disabled={logoutAll.isPending}>
          {t('account.logoutAll')}
        </Button>
        <Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>
          {t('account.delete')}
        </Button>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        size="sm"
        title={t('account.deleteTitle')}
        description={t('account.deleteBody')}
        footer={
          <>
            <Button onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {t('account.deleteConfirm')}
            </Button>
          </>
        }
      >
        <TextField
          label={t('account.passwordConfirm')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={remove.isError ? errorMessage(remove.error) : null}
          hint={t('account.passwordConfirmHint')}
        />
      </Modal>
    </section>
  );
}
