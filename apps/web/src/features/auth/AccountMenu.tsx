import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/api/endpoints';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { Button } from '@/shared/ui';

/** Header entry point: "Sign in" for guests, a menu for signed-in players. */
export function AccountMenu() {
  const { t } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const openAuth = useUiStore((s) => s.openAuth);
  const openCommunity = useUiStore((s) => s.openCommunity);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (status === 'unknown')
    return <span className="h-9 w-20 animate-pulse rounded bg-surface-2" aria-hidden="true" />;
  if (!user) {
    return (
      <Button size="sm" variant="primary" onClick={() => openAuth('login')}>
        {t('auth.signIn')}
      </Button>
    );
  }

  const item = (label: string, onClick: () => void) => (
    <li role="none">
      <button
        type="button"
        role="menuitem"
        className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
        onClick={() => {
          setOpen(false);
          onClick();
        }}
      >
        {label}
      </button>
    </li>
  );

  return (
    <div ref={ref} className="relative">
      <Button
        size="sm"
        variant="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">👤</span>
        <span className="max-w-[8rem] truncate">{user.nickname}</span>
      </Button>
      {open && (
        <ul
          id={menuId}
          role="menu"
          aria-label={t('account.menu')}
          className="absolute right-0 z-40 mt-1 w-48 overflow-hidden rounded border border-border bg-surface py-1 shadow-xl"
        >
          {item(t('community.tabs.profile'), () => openCommunity('profile'))}
          {item(t('community.tabs.leaderboard'), () => openCommunity('leaderboard'))}
          {item(t('community.tabs.daily'), () => openCommunity('daily'))}
          {item(t('community.tabs.friends'), () => openCommunity('friends'))}
          {item(t('auth.signOut'), () => {
            void authApi.logout().finally(() => useAuthStore.getState().setGuest());
          })}
        </ul>
      )}
    </div>
  );
}
