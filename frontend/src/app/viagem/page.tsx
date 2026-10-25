'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchDestinos, type Destino } from '@/lib/api';
import { Navbar, Footer, WAFloat } from '@/components/SiteChrome';
import Carrossel from '@/components/Carrossel';
import SafeImg from '@/components/SafeImg';
import { btnPrimario, btnSecundario } from '@/components/styles';
import { IconArrowLeft, IconCalendar, IconUsers, IconMessage, IconMail, IconAlert, IconLoader, IconWallet } from '@/components/Icons';
import { whatsappViagem, emailViagem } from '@/lib/contato';

// Site em exportação estática: os IDs são criados no painel, então a viagem é identificada por /viagem/?id=<id>
// e carregada no navegador (uma rota dinâmica /viagem/[id] não conseguiria gerar essas páginas no build).

function Estado({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-32 text-center">{children}</div>;
}

function Conteudo() {
  const id = useSearchParams().get('id');
  const [viagem, setViagem] = useState<Destino | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    setLoading(true);
    setErro('');
    fetchDestinos()
      // Rascunho não é público: o link de uma viagem ainda não publicada cai em "não encontrada".
      .then((lista) => setViagem(lista.find((d) => d.id === id && d.status !== 'Rascunho') ?? null))
      .catch(() => setErro('Não foi possível carregar a viagem.'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (viagem) document.title = `${viagem.titulo} — MacFerr Turismo`;
  }, [viagem]);

  const voltar = (
    <a href="/#destinos" className={btnSecundario}><IconArrowLeft size={16} />Ver todas as viagens</a>
  );

  if (loading) {
    return (
      <Estado>
        <IconLoader size={28} className="animate-spin text-violet-600" />
        <p className="text-slate-500" aria-busy="true">Carregando viagem...</p>
      </Estado>
    );
  }
  if (erro) {
    return (
      <Estado>
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><IconAlert /></span>
        <p className="font-semibold text-slate-700">{erro}</p>
        <button type="button" onClick={carregar} className={btnPrimario}>Tentar de novo</button>
      </Estado>
    );
  }
  if (!viagem) {
    return (
      <Estado>
        <p className="font-display text-2xl font-bold text-slate-900">Viagem não encontrada</p>
        <p className="text-slate-500">O link pode estar incorreto ou a viagem foi removida.</p>
        {voltar}
      </Estado>
    );
  }

  // Mesma regra do backend: Disponivel/Esgotada = próxima viagem; Finalizada = realizada.
  const esgotada = viagem.status === 'Esgotada';
  const proxima = viagem.status === 'Disponivel' || esgotada;
  const tags = Array.from(new Set([viagem.categoria, ...viagem.tags].filter(Boolean)));
  // Galeria só nas viagens realizadas; próximas viagens nunca exibem o carrossel.
  const mostrarGaleria = viagem.status === 'Finalizada' && viagem.fotos.length > 0;

  return (
    <>
      {/* Banner de capa */}
      <section className="relative isolate overflow-hidden bg-slate-900">
        <SafeImg src={viagem.imagem} alt={viagem.titulo} className="absolute inset-0 h-full w-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-slate-950/30" />
        <div className="relative mx-auto flex min-h-[340px] max-w-6xl flex-col justify-end px-4 pb-10 pt-32 sm:min-h-[420px] sm:px-6 sm:pb-14 lg:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${esgotada ? 'bg-amber-500 text-white' : proxima ? 'bg-emerald-500 text-white' : 'bg-white/95 text-slate-700'}`}>
              {esgotada ? 'Esgotada' : proxima ? 'Próxima viagem' : 'Viagem realizada'}
            </span>
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-violet-600/90 px-3 py-1 text-xs font-bold text-white">{t}</span>
            ))}
          </div>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">{viagem.titulo}</h1>
        </div>
      </section>

      <section className="bg-slate-50 py-12 sm:py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_340px] lg:gap-14 lg:px-8">
          <div className="min-w-0">
            <a href="/#destinos" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-all duration-200 hover:text-violet-700">
              <IconArrowLeft size={16} />Voltar às viagens
            </a>
            <h2 className="mt-6 font-display text-2xl font-bold text-slate-900">Sobre a viagem</h2>
            <p className="mt-3 whitespace-pre-line text-lg leading-relaxed text-slate-600">{viagem.descricao}</p>

            {mostrarGaleria && (
              <div className="mt-12">
                <h2 className="mb-5 font-display text-2xl font-bold text-slate-900">Galeria de fotos</h2>
                <Carrossel fotos={viagem.fotos} titulo={viagem.titulo} />
              </div>
            )}
          </div>

          {/* Resumo + contato */}
          <aside className="h-fit rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70 lg:sticky lg:top-24">
            <dl className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><IconCalendar size={18} /></span>
                <div><dt className="text-slate-500">Data</dt><dd className="font-semibold text-slate-900">{viagem.data}</dd></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><IconUsers size={18} /></span>
                <div><dt className="text-slate-500">{proxima ? 'Grupo' : 'Viajantes'}</dt><dd className="font-semibold text-slate-900">{viagem.viajantes} {viagem.viajantes === 1 ? 'viajante' : 'viajantes'}</dd></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><IconWallet size={18} /></span>
                <div><dt className="text-slate-500">Preço</dt><dd className="font-semibold text-slate-900">{viagem.preco || 'Sob consulta'}</dd></div>
              </div>
            </dl>

            <div className="mt-6 space-y-3 border-t border-slate-100 pt-6">
              <p className="text-sm font-semibold text-slate-700">{esgotada ? 'Vagas esgotadas. Fale com a gente para entrar na lista de espera.' : proxima ? 'Quer garantir sua vaga?' : 'Gostou? Fale com a gente sobre uma nova saída.'}</p>
              <a href={whatsappViagem(viagem.titulo, viagem.status)} target="_blank" rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-white transition-all duration-200 hover:bg-emerald-600">
                <IconMessage size={18} />Chamar no WhatsApp
              </a>
              <a href={emailViagem(viagem.titulo, viagem.status)} className={`${btnSecundario} w-full`}>
                <IconMail size={18} />Enviar e-mail
              </a>
            </div>
          </aside>
        </div>
      </section>

      <WAFloat href={whatsappViagem(viagem.titulo, viagem.status)} />
    </>
  );
}

export default function ViagemPage() {
  return (
    <>
      <Navbar base="/" />
      <main className="min-h-[60vh]">
        {/* useSearchParams exige Suspense na exportação estática */}
        <Suspense fallback={<Estado><IconLoader size={28} className="animate-spin text-violet-600" /></Estado>}>
          <Conteudo />
        </Suspense>
      </main>
      <Footer base="/" />
    </>
  );
}
