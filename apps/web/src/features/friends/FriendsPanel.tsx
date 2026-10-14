import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { nicknameSchema } from '@trader-sim/shared';
import { friendsApi } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import { useApiErrorMessage } from '@/api/useApiError';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { Button, EmptyState, ErrorState, Skeleton, TextField } from '@/shared/ui';

function NickButton({ nickname }: { nickname: string }) {
  const openCommunity = useUiStore((s) => s.openCommunity);
  return (
    <button
      type="button"
      className="truncate font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      onClick={() => openCommunity('profile', nickname)}
    >
      {nickname}
    </button>
  );
}

export function FriendsPanel() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const errorMessage = useApiErrorMessage();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [nickname, setNickname] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const friends = useQuery({
    queryKey: queryKeys.friends,
    queryFn: friendsApi.list,
    enabled: Boolean(user),
  });
  const requests = useQuery({
    queryKey: queryKeys.friendRequests,
    queryFn: friendsApi.requests,
    enabled: Boolean(user),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['friends'] });
  const send = useMutation({
    mutationFn: friendsApi.send,
    onSuccess: () => {
      setNickname('');
      void invalidate();
    },
  });
  const accept = useMutation({ mutationFn: friendsApi.accept, onSuccess: invalidate });
  const decline = useMutation({ mutationFn: friendsApi.decline, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: friendsApi.remove, onSuccess: invalidate });

  if (!user) {
    return (
      <EmptyState icon="🤝" title={t('friends.signInTitle')}>
        <Button size="sm" variant="primary" onClick={() => useUiStore.getState().openAuth('login')}>
          {t('auth.signIn')}
        </Button>
      </EmptyState>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!nicknameSchema.safeParse(nickname).success)
      return setFieldError(t('friends.invalidNickname'));
    setFieldError(null);
    send.mutate(nickname);
  };

  const incoming = requests.data?.requests.filter((r) => r.direction === 'incoming') ?? [];
  const outgoing = requests.data?.requests.filter((r) => r.direction === 'outgoing') ?? [];

  return (
    <div className="flex flex-col gap-4 p-3">
      <form onSubmit={submit} noValidate className="flex items-end gap-2">
        <TextField
          className="flex-1"
          label={t('friends.addLabel')}
          placeholder={t('friends.addPlaceholder')}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          error={fieldError ?? (send.isError ? errorMessage(send.error) : null)}
        />
        <Button type="submit" variant="primary" disabled={send.isPending} className="mb-[1px] h-10">
          {t('friends.send')}
        </Button>
      </form>
      {send.isSuccess && (
        <p role="status" className="-mt-2 text-xs text-up">
          {send.data.direction === 'incoming' ? t('friends.nowFriends') : t('friends.requestSent')}
        </p>
      )}

      {incoming.length > 0 && (
        <section aria-labelledby="friends-incoming">
          <h3
            id="friends-incoming"
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted"
          >
            {t('friends.incoming', { count: incoming.length })}
          </h3>
          <ul className="flex flex-col gap-1">
            {incoming.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded bg-surface-2/60 px-3 py-2 text-sm"
              >
                <NickButton nickname={r.nickname} />
                <div className="flex gap-1">
                  <Button size="sm" variant="up" onClick={() => accept.mutate(r.id)}>
                    {t('friends.accept')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => decline.mutate(r.id)}>
                    {t('friends.decline')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="friends-list">
        <h3
          id="friends-list"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted"
        >
          {t('friends.title')}
        </h3>
        {friends.isPending ? (
          <Skeleton rows={3} className="p-0" />
        ) : friends.isError ? (
          <ErrorState
            message={errorMessage(friends.error)}
            onRetry={() => void friends.refetch()}
          />
        ) : friends.data.friends.length === 0 ? (
          <EmptyState icon="👥" title={t('friends.empty')}>
            {t('friends.emptyHint')}
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-1">
            {friends.data.friends.map((f) => (
              <li
                key={f.nickname}
                className="flex items-center justify-between gap-2 rounded px-3 py-2 text-sm hover:bg-surface-2/60"
              >
                <div className="flex min-w-0 flex-col">
                  <NickButton nickname={f.nickname} />
                  <span className="text-[11px] text-muted">
                    {t(`stats.levels.${f.level}`, { defaultValue: f.level })} ·{' '}
                    {t('friends.since', { date: fmt.dateOnly(f.since) })}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('friends.removeAria', { nickname: f.nickname })}
                  onClick={() => remove.mutate(f.nickname)}
                >
                  {t('friends.remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {outgoing.length > 0 && (
        <section aria-labelledby="friends-outgoing">
          <h3
            id="friends-outgoing"
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted"
          >
            {t('friends.outgoing')}
          </h3>
          <ul className="flex flex-col gap-1 text-sm text-muted">
            {outgoing.map((r) => (
              <li key={r.id} className="px-3 py-1">
                {r.nickname} · {t('friends.pending')}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
