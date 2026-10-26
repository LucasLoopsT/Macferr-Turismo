'use client';

import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { btnPrimario } from '@/components/styles';
import {
  IconMenu,
  IconX,
  IconMail,
  IconMessage,
  IconInstagram,
  IconClock,
} from '@/components/Icons';
import {
  WHATSAPP_URL,
  EMAIL,
  INSTAGRAM_URL,
  CIDADE,
} from '@/lib/contato';

const BASE_PATH = '/Macferr-Turismo';

const LINKS = [
  { href: '#sobre', label: 'Sobre' },
  { href: '#destinos', label: 'Destinos' },
  { href: '#horarios', label: 'Horários' },
];

function linkHome(base: string, hash = ''): string {
  // Na home, mantém as âncoras locais.
  if (!base) {
    return hash || '#';
  }

  // Nas páginas internas, aponta para a home publicada no GitHub Pages.
  return `${BASE_PATH}/${hash}`;
}

// ── Navbar ─────────────────────────────────────────────────────────────────────

export function Navbar({ base = '' }: { base?: string }) {
  const [aberto, setAberto] = useState(false);
  const [rolou, setRolou] = useState(false);

  useEffect(() => {
    const fn = () => setRolou(window.scrollY > 8);

    fn();
    window.addEventListener('scroll', fn, { passive: true });

    return () => window.removeEventListener('scroll', fn);
  }, []);

  const hrefHome = linkHome(base);
  const hrefContato = linkHome(base, '#contato');

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b bg-white/90 backdrop-blur transition-all duration-200 ${
        rolou || aberto
          ? 'border-slate-200 shadow-sm'
          : 'border-transparent'
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href={hrefHome} aria-label="MacFerr Turismo, início">
          <Logo size={40} />
        </a>

        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="Principal"
        >
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={linkHome(base, l.href)}
              className="rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-600 transition-all duration-200 hover:bg-violet-50 hover:text-violet-700"
            >
              {l.label}
            </a>
          ))}

          <a
            href={hrefContato}
            className={`${btnPrimario} ml-3 px-5 py-2.5`}
          >
            Fale conosco
          </a>
        </nav>

        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          aria-controls="menu-mobile"
          aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 md:hidden"
        >
          {aberto ? <IconX /> : <IconMenu />}
        </button>
      </div>

      {aberto && (
        <div
          id="menu-mobile"
          className="border-t border-slate-200 bg-white px-4 pb-5 pt-3 md:hidden"
        >
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={linkHome(base, l.href)}
              onClick={() => setAberto(false)}
              className="block rounded-xl px-4 py-3 text-base font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700"
            >
              {l.label}
            </a>
          ))}

          <a
            href={hrefContato}
            onClick={() => setAberto(false)}
            className={`${btnPrimario} mt-3 w-full`}
          >
            Fale conosco
          </a>
        </div>
      )}
    </header>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────────

export function Footer({ base = '' }: { base?: string }) {
  const navegacao = [
    { href: '#sobre', label: 'Sobre nós' },
    { href: '#destinos', label: 'Destinos' },
    { href: '#horarios', label: 'Horários' },
    { href: '#contato', label: 'Contato' },
  ];

  const regioes = ['Europa', 'Caribe', 'Brasil', 'Ásia', 'Cruzeiros'];

  const social = [
    { Icone: IconInstagram, label: 'Instagram', href: INSTAGRAM_URL },
    { Icone: IconMessage, label: 'WhatsApp', href: WHATSAPP_URL },
    { Icone: IconMail, label: 'E-mail', href: `mailto:${EMAIL}` },
  ];

  return (
    <footer className="bg-slate-900 text-slate-300">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 py-16 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <a href={linkHome(base)} aria-label="MacFerr Turismo, início">
            <Logo tone="light" size={40} />
          </a>

          <p className="mt-5 max-w-xs text-sm leading-relaxed text-slate-400">
            Realizando sonhos desde sempre. Sua agência de viagens de confiança
            na Baixada Santista.
          </p>

          <div className="mt-5 flex gap-2.5">
            {social.map(({ Icone, label, href }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                {...(href.startsWith('http')
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition-all duration-200 hover:bg-violet-600"
              >
                <Icone size={18} />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-display text-base font-bold text-white">
            Navegação
          </h2>

          <ul className="mt-4 space-y-2.5 text-sm">
            {navegacao.map((l) => (
              <li key={l.href}>
                <a
                  href={linkHome(base, l.href)}
                  className="text-slate-400 transition-all duration-200 hover:text-white"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="font-display text-base font-bold text-white">
            Destinos
          </h2>

          <ul className="mt-4 space-y-2.5 text-sm">
            {regioes.map((r) => (
              <li key={r}>
                <a
                  href={linkHome(base, '#destinos')}
                  className="text-slate-400 transition-all duration-200 hover:text-white"
                >
                  {r}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <p>
            © {new Date().getFullYear()} MacFerr Turismo. Todos os direitos
            reservados.
          </p>

          <p className="inline-flex items-center gap-2">
            <IconClock size={14} />
            {CIDADE}, Brasil
          </p>
        </div>
      </div>
    </footer>
  );
}

// ── WhatsApp flutuante ─────────────────────────────────────────────────────────

export function WAFloat({ href = WHATSAPP_URL }: { href?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar pelo WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-emerald-600 sm:bottom-7 sm:right-7"
    >
      <IconMessage size={26} />
    </a>
  );
}
