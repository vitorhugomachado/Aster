'use client';

import { FormEvent, useEffect, useState } from 'react';
import Image from 'next/image';
import { LoaderCircle, LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';
import { FloatingInput } from './floating-input';
import { WatermelonButton, WatermelonCard } from './watermelon-system';
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
    <main className="auth-shell">
      <WatermelonCard className="auth-card">
        <header className="auth-brand">
          <span><Image src="/brand/aster-client-pin.png" alt="" width={42} height={42} priority /></span>
          <div><b>aster</b><small>Inteligência comercial</small></div>
        </header>
        <div className="auth-copy">
          <span className="auth-icon">{session.setupRequired ? <ShieldCheck size={20} /> : <LockKeyhole size={20} />}</span>
          <h1>{session.setupRequired ? 'Criar acesso administrador' : 'Entrar no Aster'}</h1>
          <p>{session.setupRequired ? 'Este cadastro será o proprietário da base comercial.' : 'Sua base está protegida e sincronizada no Railway.'}</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {session.setupRequired && <FloatingInput id="auth-name" label="Seu nome" value={name} onChange={(event) => setName(event.target.value)} required />}
          <FloatingInput id="auth-email" label="E-mail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          <FloatingInput id="auth-password" label="Senha" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} autoComplete={session.setupRequired ? 'new-password' : 'current-password'} />
          {session.setupRequired && <FloatingInput id="auth-token" label="Código de configuração" type="password" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} required autoComplete="off" />}
          {error && <div className="auth-error">{error}</div>}
          <WatermelonButton tone="primary" className="auth-submit" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="auth-spinner" size={17} /> : <LogIn size={17} />}
            {session.setupRequired ? 'Criar acesso e entrar' : 'Entrar'}
          </WatermelonButton>
        </form>
        <footer><ShieldCheck size={14} />Sessão protegida · dados privados</footer>
      </WatermelonCard>
    </main>
  );
}
