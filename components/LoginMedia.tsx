'use client';

import { useState } from 'react';
import CloudSky from './CloudSky';

// Place the real video at public/videos/login-balloon.mp4.
export function LoginMedia({ src = '/videos/login-balloon.mp4' }: { src?: string }) {
  const [available, setAvailable] = useState(false);
  const [failed, setFailed] = useState(false);
  return <aside className="login-media" aria-label="Céu azul e nuvens">
    {!available && <CloudSky background="#68acec" baseColor="#deedfa" speed={12} style={{ width: '100%', height: '100%' }} />}
    {!failed && <video className={available ? 'login-video ready' : 'login-video'} src={src}
      autoPlay muted loop playsInline preload="metadata" aria-hidden="true"
      onCanPlay={() => setAvailable(true)} onError={() => { setAvailable(false); setFailed(true); }} />}
  </aside>;
}
