'use client';

import { FormEvent, useEffect, useState } from 'react';
import { LoginMedia } from './LoginMedia';
import CloudSky from './CloudSky';
import { LoaderCircle, LockKeyhole, Mail, Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react';
import { FibraMapApp } from './FibraMapApp';

interface SessionState {
  configured: boolean;
  authenticated: boolean;
  setupRequired?: boolean;
  unavailable?: boolean;
  user?: { id: string; email: string; name: string } | null;
}

export function AuthGate() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('Stefani');
  const [setupToken, setSetupToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryHelp, setRecoveryHelp] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => setSession(await response.json() as SessionState))
      .catch(() => setSession({ configured: false, authenticated: false, unavailable: true }));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, setupToken, mode: session?.setupRequired ? 'setup' : 'login' }),
      });
      const result = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(result.message || 'Não foi possível entrar.');
      const refreshed = await fetch('/api/auth/session', { cache: 'no-store' });
      setSession(await refreshed.json() as SessionState);
      setPassword(''); setSetupToken('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível entrar.'); }
    finally { setBusy(false); }
  }

  if (!session) return <main className="auth-shell"><LoaderCircle className="auth-spinner" size={28} /><span>Preparando o Aster…</span></main>;
  if (!session.configured) return <FibraMapApp cloudEnabled={false} />;
  if (session.authenticated) return <FibraMapApp cloudEnabled currentUser={session.user ?? undefined} />;

  return (
    <main className="auth-shell premium-login">
      <div className="auth-sky" aria-hidden="true"><CloudSky background="#a9d4f7" baseColor="#eaf5ff" speed={8} style={{ width: '100%', height: '100%' }} /></div>
      <section className="login-frame">
        <div className="login-form-column">
          <header className="login-wordmark" aria-label="aster"><span>aster</span><svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 0 24 16 40 20 24 24 20 40 16 24 0 20 16 16Z" fill="currentColor" /></svg></header>
          <div className="login-heading">
            <h1>{session.setupRequired ? 'Criar acesso administrador.' : 'Bem-vinda de volta.'}</h1>
            <p>{session.setupRequired ? 'Prepare seu espaço para começar a jornada.' : 'Tudo pronto para continuar sua jornada.'}</p>
          </div>
          <form className="login-form" onSubmit={submit} aria-busy={busy}>
            {session.setupRequired && <label className="login-field">Seu nome<div><input id="auth-name" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" disabled={busy} /></div></label>}
            <label className="login-field" htmlFor="auth-email">E-mail<div><Mail size={20} aria-hidden="true" /><input id="auth-email" type="email" placeholder="Seu e-mail" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" disabled={busy} /></div></label>
            <label className="login-field" htmlFor="auth-password">Senha<div><LockKeyhole size={20} aria-hidden="true" /><input id="auth-password" type={showPassword ? 'text' : 'password'} placeholder="Sua senha" value={password} onChange={e => setPassword(e.target.value)} required minLength={10} autoComplete={session.setupRequired ? 'new-password' : 'current-password'} disabled={busy} /><button type="button" className="password-toggle" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></label>
            {session.setupRequired && <label className="login-field" htmlFor="auth-token">Código de configuração<div><input id="auth-token" type="password" value={setupToken} onChange={e => setSetupToken(e.target.value)} required autoComplete="off" disabled={busy} /></div></label>}
            {!session.setupRequired && <button type="button" className="login-recovery" aria-expanded={recoveryHelp} aria-controls="recovery-help" onClick={() => setRecoveryHelp(!recoveryHelp)}>Esqueceu sua senha?</button>}
            {recoveryHelp && <p className="login-notice" id="recovery-help" role="status">A recuperação automática ainda não está disponível. Solicite auxílio ao administrador responsável pelo acesso.</p>}
            {error && <p className="login-notice login-error" role="alert">{error}</p>}
            {session.unavailable && <p className="login-notice" role="status">O serviço de acesso está temporariamente indisponível. Tente novamente.</p>}
            <button className="login-submit" type="submit" disabled={busy || !email.trim() || !password || (session.setupRequired && (!name.trim() || !setupToken.trim()))}>
              {busy ? <><LoaderCircle className="auth-spinner" size={20} />Entrando…</> : <>{session.setupRequired ? 'Criar acesso' : 'Entrar'}<ArrowRight size={22} /></>}
            </button>
          </form>
          <footer className="login-footer"><ShieldCheck size={14} />Seu espaço. Seus dados. Sua próxima jornada.</footer>
        </div>
        <LoginMedia />
      </section>
    </main>
  );
}
