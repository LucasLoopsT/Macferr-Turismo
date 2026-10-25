'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import SafeImg from '@/components/SafeImg';
import { IconChevronLeft, IconChevronRight } from '@/components/Icons';

const INTERVALO_MS = 5000;

/**
 * Carrossel de uma foto por vez, com troca automática e loop infinito (a última volta à primeira).
 * Transição em fade (sem "rebobinar" pela faixa inteira ao voltar ao início).
 * - 0 fotos: não renderiza nada.
 * - 1 foto: mostra a imagem fixa, sem controles nem temporizador.
 * - Pausa com o mouse/foco sobre o carrossel, com a aba oculta e quando o sistema pede menos movimento.
 */
export default function Carrossel({ fotos, titulo, intervalo = INTERVALO_MS }: { fotos: string[]; titulo: string; intervalo?: number }) {
  const total = fotos.length;
  const [atual, setAtual] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [aba, setAba] = useState(true);
  const [menosMovimento, setMenosMovimento] = useState(false);
  const toqueX = useRef<number | null>(null);

  // Se a lista de fotos encolher, mantém o índice válido.
  useEffect(() => { if (atual >= total) setAtual(0); }, [atual, total]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const ler = () => setMenosMovimento(mq.matches);
    ler();
    mq.addEventListener('change', ler);
    const vis = () => setAba(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', vis);
    return () => { mq.removeEventListener('change', ler); document.removeEventListener('visibilitychange', vis); };
  }, []);

  const ir = useCallback((i: number) => setAtual(((i % total) + total) % total), [total]);

  const rodando = total > 1 && !pausado && aba && !menosMovimento;
  // Reinicia o temporizador a cada troca (inclusive manual), então a foto nunca "pula" logo depois de um clique.
  useEffect(() => {
    if (!rodando) return;
    const t = setTimeout(() => setAtual((a) => (a + 1) % total), intervalo);
    return () => clearTimeout(t);
  }, [rodando, atual, total, intervalo]);

  if (total === 0) return null;

  const aoTeclar = (e: React.KeyboardEvent) => {
    if (total < 2) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); ir(atual - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); ir(atual + 1); }
  };

  const botao = 'absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-slate-800 shadow-sm backdrop-blur transition-all duration-200 hover:bg-white focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100';

  return (
    <div
      role="region"
      aria-roledescription="carrossel"
      aria-label={`Fotos da viagem ${titulo}`}
      tabIndex={total > 1 ? 0 : undefined}
      onKeyDown={aoTeclar}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      onTouchStart={(e) => { toqueX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (toqueX.current === null || total < 2) return;
        const dx = e.changedTouches[0].clientX - toqueX.current;
        toqueX.current = null;
        if (Math.abs(dx) > 40) ir(atual + (dx < 0 ? 1 : -1));
      }}
      className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-100 shadow-sm ring-1 ring-slate-200/70 sm:aspect-[16/9]"
    >
      {fotos.map((src, i) => (
        <div
          key={`${src}-${i}`}
          role="group"
          aria-roledescription="slide"
          aria-label={`Foto ${i + 1} de ${total}`}
          aria-hidden={i !== atual}
          className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${i === atual ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <SafeImg src={src} alt={`${titulo} — foto ${i + 1} de ${total}`} className="h-full w-full object-cover" />
        </div>
      ))}

      {total > 1 && (
        <>
          <button type="button" onClick={() => ir(atual - 1)} aria-label="Foto anterior" className={`${botao} left-3`}>
            <IconChevronLeft size={20} />
          </button>
          <button type="button" onClick={() => ir(atual + 1)} aria-label="Próxima foto" className={`${botao} right-3`}>
            <IconChevronRight size={20} />
          </button>

          <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center gap-2 bg-gradient-to-t from-slate-950/50 to-transparent px-4 pb-3 pt-8">
            {fotos.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => ir(i)}
                aria-label={`Ir para a foto ${i + 1}`}
                aria-current={i === atual}
                className="flex h-5 items-center"
              >
                <span className={`block h-2 rounded-full transition-all duration-300 ${i === atual ? 'w-6 bg-white' : 'w-2 bg-white/60 hover:bg-white/90'}`} />
              </button>
            ))}
          </div>
          <p className="sr-only" aria-live={rodando ? 'off' : 'polite'}>Foto {atual + 1} de {total}</p>
        </>
      )}
    </div>
  );
}
