import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  emailSchema,
  NICKNAME_MAX,
  NICKNAME_MIN,
  nicknameSchema,
  PASSWORD_MIN,
  passwordSchema,
  type AuthResponse,
} from '@trader-sim/shared';
import { API_URL } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import { useApiErrorMessage } from '@/api/useApiError';
import { resolveLanguage } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { useProgressStore } from '@/store/progressStore';
import { useSyncStore } from '@/store/syncStore';
import { useUiStore, type AuthView } from '@/store/uiStore';
import { Button, Modal, TextField } from '@/shared/ui';

type FieldErrors = Partial<Record<'email' | 'password' | 'nickname' | 'confirm', string>>;

function useFinishAuth() {
  const setSession = useAuthStore((s) => s.setSession);
  const close = useUiStore((s) => s.closeAuth);
  return (res: AuthResponse) => {
    setSession(res.accessToken, res.user);
    close();
  };
}

function LoginForm({ go }: { go: (v: AuthView) => void }) {
  const { t } = useTranslation();
  const errorMessage = useApiErrorMessage();
  const finish = useFinishAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const login = useMutation({ mutationFn: authApi.login, onSuccess: finish });
  const providers = useQuery({
    queryKey: queryKeys.providers,
    queryFn: authApi.providers,
    staleTime: Infinity,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: FieldErrors = {};
    if (!emailSchema.safeParse(email).success) next.email = t('auth.validation.email');
    if (!password) next.password = t('auth.validation.required');
    setErrors(next);
    if (Object.keys(next).length === 0) login.mutate({ email, password });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <TextField
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
      />
      <TextField
        label={t('auth.password')}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
      />
      {login.isError && (
        <p role="alert" className="text-xs text-down">
          {errorMessage(login.error)}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" disabled={login.isPending}>
        {login.isPending ? t('common.loading') : t('auth.signIn')}
      </Button>
      {(providers.data?.providers.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          {providers.data?.providers.map((p) => (
            <a
              key={p}
              href={`${API_URL}/auth/oauth/${p}/start`}
              className="flex h-10 items-center justify-center rounded border border-border bg-surface-2 text-sm font-medium hover:border-muted"
            >
              {t(`auth.continueWith.${p}`)}
            </a>
          ))}
        </div>
      )}
      <div className="flex justify-between text-xs">
        <button type="button" className="text-accent hover:underline" onClick={() => go('forgot')}>
          {t('auth.forgotLink')}
        </button>
        <button
          type="button"
          className="text-accent hover:underline"
          onClick={() => go('register')}
        >
          {t('auth.noAccount')}
        </button>
      </div>
    </form>
  );
}

function RegisterForm({ go }: { go: (v: AuthView) => void }) {
  const { t, i18n } = useTranslation();
  const errorMessage = useApiErrorMessage();
  const finish = useFinishAuth();
  const localXp = useProgressStore((s) => s.xp);
  const localAchievements = useProgressStore((s) => s.unlocked);
  const markHandled = useSyncStore((s) => s.markGuestImportHandled);
  const achievementCount = Object.keys(localAchievements).length;
  const hasGuestProgress = localXp > 0 || achievementCount > 0;
  const [form, setForm] = useState({ email: '', nickname: '', password: '' });
  const [importGuest, setImportGuest] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const register = useMutation({
    mutationFn: authApi.register,
    onSuccess: (res) => {
      markHandled(res.user.id);
      finish(res);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: FieldErrors = {};
    if (!emailSchema.safeParse(form.email).success) next.email = t('auth.validation.email');
    if (!nicknameSchema.safeParse(form.nickname).success) {
      next.nickname = t('auth.validation.nickname', { min: NICKNAME_MIN, max: NICKNAME_MAX });
    }
    if (!passwordSchema.safeParse(form.password).success)
      next.password = t('auth.validation.password', { min: PASSWORD_MIN });
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    register.mutate({
      ...form,
      locale: resolveLanguage(i18n.language),
      guestProgress:
        hasGuestProgress && importGuest
          ? { xp: localXp, achievements: Object.keys(localAchievements) }
          : undefined,
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <TextField
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        error={errors.email}
      />
      <TextField
        label={t('auth.nickname')}
        autoComplete="username"
        value={form.nickname}
        onChange={(e) => setForm({ ...form, nickname: e.target.value })}
        error={errors.nickname}
        hint={t('auth.nicknameHint', { min: NICKNAME_MIN, max: NICKNAME_MAX })}
      />
      <TextField
        label={t('auth.password')}
        type="password"
        autoComplete="new-password"
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
        error={errors.password}
        hint={t('auth.passwordHint', { min: PASSWORD_MIN })}
      />
      {hasGuestProgress && (
        <label className="flex items-start gap-2 rounded border border-border bg-surface-2/60 p-2 text-xs">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={importGuest}
            onChange={(e) => setImportGuest(e.target.checked)}
          />
          <span>{t('auth.importGuest', { xp: localXp, count: achievementCount })}</span>
        </label>
      )}
      {register.isError && (
        <p role="alert" className="text-xs text-down">
          {errorMessage(register.error)}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" disabled={register.isPending}>
        {register.isPending ? t('common.loading') : t('auth.createAccount')}
      </Button>
      <p className="text-[11px] text-muted">{t('auth.privacyNote')}</p>
      <button
        type="button"
        className="self-start text-xs text-accent hover:underline"
        onClick={() => go('login')}
      >
        {t('auth.haveAccount')}
      </button>
    </form>
  );
}

function ForgotForm({ go }: { go: (v: AuthView) => void }) {
  const { t } = useTranslation();
  const errorMessage = useApiErrorMessage();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const forgot = useMutation({ mutationFn: authApi.forgotPassword });
  if (forgot.isSuccess) {
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="text-sm">
          {t('auth.forgotSent')}
        </p>
        <Button onClick={() => go('login')}>{t('auth.backToSignIn')}</Button>
      </div>
    );
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!emailSchema.safeParse(email).success) return setError(t('auth.validation.email'));
        setError(null);
        forgot.mutate(email);
      }}
    >
      <p className="text-sm text-muted">{t('auth.forgotIntro')}</p>
      <TextField
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
      />
      {forgot.isError && (
        <p role="alert" className="text-xs text-down">
          {errorMessage(forgot.error)}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={forgot.isPending}>
        {t('auth.sendLink')}
      </Button>
      <button
        type="button"
        className="self-start text-xs text-accent hover:underline"
        onClick={() => go('login')}
      >
        {t('auth.backToSignIn')}
      </button>
    </form>
  );
}

function ResetForm({ token, go }: { token: string; go: (v: AuthView) => void }) {
  const { t } = useTranslation();
  const errorMessage = useApiErrorMessage();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const reset = useMutation({ mutationFn: (p: string) => authApi.resetPassword(token, p) });
  if (reset.isSuccess) {
    return (
      <div className="flex flex-col gap-3">
        <p role="status" className="text-sm">
          {t('auth.resetDone')}
        </p>
        <Button variant="primary" onClick={() => go('login')}>
          {t('auth.signIn')}
        </Button>
      </div>
    );
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const next: FieldErrors = {};
        if (!passwordSchema.safeParse(password).success)
          next.password = t('auth.validation.password', { min: PASSWORD_MIN });
        if (password !== confirm) next.confirm = t('auth.validation.mismatch');
        setErrors(next);
        if (Object.keys(next).length === 0) reset.mutate(password);
      }}
    >
      <TextField
        label={t('auth.newPassword')}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
      />
      <TextField
        label={t('auth.confirmPassword')}
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
      />
      {reset.isError && (
        <p role="alert" className="text-xs text-down">
          {errorMessage(reset.error)}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={reset.isPending}>
        {t('auth.setPassword')}
      </Button>
    </form>
  );
}

function VerifyView({ token }: { token: string }) {
  const { t } = useTranslation();
  const errorMessage = useApiErrorMessage();
  const verify = useMutation({ mutationFn: authApi.verifyEmail });
  const { mutate } = verify;
  // Verification tokens are single-use: StrictMode's double effect must not send it twice.
  const sentFor = useRef<string | null>(null);
  useEffect(() => {
    if (sentFor.current === token) return;
    sentFor.current = token;
    mutate(token);
  }, [mutate, token]);
  if (verify.isPending || verify.isIdle) return <p role="status">{t('common.loading')}</p>;
  if (verify.isError)
    return (
      <p role="alert" className="text-sm text-down">
        {errorMessage(verify.error)}
      </p>
    );
  return (
    <p role="status" className="text-sm text-up">
      {t('auth.verified')}
    </p>
  );
}

/** Sign in / sign up / password reset / e-mail verification dialog. */
export function AuthModal() {
  const { t } = useTranslation();
  const auth = useUiStore((s) => s.auth);
  const openAuth = useUiStore((s) => s.openAuth);
  const close = useUiStore((s) => s.closeAuth);
  if (!auth) return null;
  const go = (view: AuthView) => openAuth(view);

  return (
    <Modal
      open
      onClose={close}
      size="sm"
      title={t(`auth.titles.${auth.view}`)}
      description={t('common.disclaimer')}
    >
      {auth.view === 'login' && <LoginForm go={go} />}
      {auth.view === 'register' && <RegisterForm go={go} />}
      {auth.view === 'forgot' && <ForgotForm go={go} />}
      {auth.view === 'reset' && auth.token && <ResetForm token={auth.token} go={go} />}
      {auth.view === 'verify' && auth.token && <VerifyView token={auth.token} />}
    </Modal>
  );
}
