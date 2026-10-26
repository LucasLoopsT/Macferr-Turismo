'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchProximasDestinos, fetchDestinosRealizados, type Destino } from '@/lib/api';
import { Navbar, Footer, WAFloat } from '@/components/SiteChrome';
import { EMAIL, WHATSAPP_URL, WHATSAPP_TEXTO, INSTAGRAM_URL, INSTAGRAM_USER, ENDERECO, CIDADE, MAPS_URL } from '@/lib/contato';
import hero from '../imgs/hero.jpeg';
import SafeImg from '@/components/SafeImg';
import { campo, rotulo, btnPrimario, btnSecundario } from '@/components/styles';
import {
  IconMenu, IconX, IconCalendar, IconUsers, IconMapPin, IconMail, IconMessage, IconSend, IconCheck,
  IconGlobe, IconSun, IconShip, IconHeart, IconAward, IconHeadphones, IconWallet, IconSparkles,
  IconInstagram, IconArrowUpRight, IconClock, IconAlert,
} from '@/components/Icons';
import agencia from '../imgs/agencia.png'

// ── Título de seção ────────────────────────────────────────────────────────────
function Titulo({ titulo, texto, claro = false }: { titulo: string; texto?: string; claro?: boolean }) {
  return (
    <div className="max-w-2xl">
      <h2 className={`font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl ${claro ? 'text-white' : 'text-slate-900'}`}>
        {titulo}
      </h2>
      {texto && <p className={`mt-4 text-lg leading-relaxed ${claro ? 'text-white/70' : 'text-slate-500'}`}>{texto}</p>}
    </div>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-slate-900" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #603a0f 100%)' }}>
      <img src={hero.src} alt="Paisagem de viagem" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.22 }}/>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-slate-950/65 via-violet-950/30 to-slate-950/80" style={{ background: 'linear-gradient(to bottom, rgba(26,26,46,.65) 0%, rgba(26,26,46,.3) 50%, rgba(26,26,46,.9) 100%)' }} />
      <div className="mx-auto max-w-6xl flex flex-col items-center px-4 pb-20 pt-36 sm:px-6 sm:pb-36 sm:pt-44 lg:px-8">
        <div className="z-10 inline-block mb-6 px-5 py-2 rounded-full text-xs font-bold tracking-[2px] uppercase border bg-violet-800/30 border-violet-300 text-violet-300 text-center">
          ✈️ Sua agência de confiança em Cubatão
        </div>
        <h1 className="z-10 font-display text-6xl text-white leading-tight mb-6 text-center">
          Realize o seu<br />
          <em className="not-italic text-violet-400">sonho de viajar</em>
        </h1>
        <p className="z-10 text-white/75 text-lg leading-relaxed mb-10 max-w-xl mx-auto text-center">
          Da Baixada Santista para o mundo. A MacFerr Turismo cuida de cada detalhe da sua viagem com carinho e experiência.
        </p>
        <div className="z-10 flex gap-4 justify-center flex-wrap">
          <a href="#destinos" className="px-9 py-4 rounded-full text-white font-bold text-sm tracking-wide transition-all hover:brightness-110 hover:-translate-y-1"
            style={{ background: 'linear-gradient(135deg, #a65df8, #6f35f7)', boxShadow: '0 8px 25px rgba(157, 53, 255, 0.4)' }}>
            Ver destinos ✈️
          </a>
          <a href="#contato" className="px-9 py-4 rounded-full text-white font-semibold text-sm border-2 transition-all hover:bg-white/10"
            style={{ borderColor: 'rgba(255,255,255,.5)' }}>
            Solicitar orçamento
          </a>
        </div>
      </div>
    </section>

  );
}

// ── Sobre ──────────────────────────────────────────────────────────────────────
function Sobre() {
  const servicos = [
    { Icone: IconGlobe, label: 'Destinos internacionais' },
    { Icone: IconSun, label: 'Pacotes nacionais' },
    { Icone: IconShip, label: 'Cruzeiros' },
    { Icone: IconHeart, label: 'Lua de mel' },
  ];
  return (
    <section id="sobre" className="overflow-hidden bg-white py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8">
        <div className="relative mx-auto h-[420px] w-full max-w-lg sm:h-[500px]">
          <SafeImg src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=80" alt="Praia de águas claras"
            className="absolute left-0 top-0 h-[78%] w-[76%] rounded-2xl object-cover shadow-sm" />
          <SafeImg src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=700&q=80" alt="Asa de avião sobre as nuvens"
            className="absolute bottom-0 right-0 h-[52%] w-[56%] rounded-2xl border-[6px] border-white object-cover shadow-sm" />
          <div className="absolute right-0 top-8 rounded-2xl bg-violet-600 px-5 py-4 text-white shadow-sm">
            <strong className="block font-display text-3xl font-extrabold leading-none">30+</strong>
            <span className="mt-1 block text-sm text-white/85">anos de experiência</span>
          </div>
        </div>

        <div>
          <Titulo titulo="Viagens inesquecíveis começam aqui" />
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-500">
            A MacFerr Turismo nasceu do amor por descobrir novos destinos. Localizada em Cubatão, SP, somos especializados em transformar o sonho das suas férias em uma realidade perfeita.
          </p>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-500">
            Seja uma viagem internacional, pacote nacional, cruzeiro ou lua de mel, cuidamos de tudo para que você só se preocupe em aproveitar cada momento.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {servicos.map(({ Icone, label }) => (
              <li key={label} className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700"><Icone size={18} /></span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ── Destinos (Próximos/Realizados) ───────────────────────────────────────────────────────────────────

function CardViagem({ d }: { d: Destino }) {
  const esgotada = d.status === 'Esgotada';
  const finalizada = d.status === 'Finalizada';

  const badge = esgotada
    ? {
        texto: 'Ingressos esgotados',
        estilo: 'bg-rose-600 text-white',
      }
    : finalizada
      ? {
          texto: 'Viagem realizada',
          estilo: 'bg-slate-700 text-white',
        }
      : {
          texto: 'Próxima viagem',
          estilo: 'bg-emerald-500 text-white',
        };

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 transition-all duration-200 hover:shadow-md hover:ring-violet-300 focus-within:ring-violet-400">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <SafeImg
          src={d.imagem}
          alt={d.titulo}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-violet-700 shadow-sm">
          {d.categoria}
        </span>

        <span
          className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-bold shadow-sm ${badge.estilo}`}
        >
          {badge.texto}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-display text-2xl font-bold leading-snug text-slate-900">
          <a
            href={`/viagem/?id=${encodeURIComponent(d.id)}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {d.titulo}
          </a>
        </h3>

        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-500">
          {d.descricao}
        </p>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500">
          <span className="inline-flex items-center gap-2">
            <IconCalendar size={16} />
            {d.data}
          </span>

          <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
            <IconUsers size={16} />
            {d.viajantes} viajantes
          </span>
        </div>

        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-violet-700">
          Ver detalhes
          <IconArrowUpRight size={16} />
        </span>
      </div>
    </article>
  );
}


function Destinos() {
  const [proximasDestinos, setProximasDestinos] = useState<Destino[]>([]);
  const [realizadasDestinos, setRealizadasDestinos] = useState<Destino[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('Todos');

  const carregar = useCallback(() => {
    setLoading(true);
    setErro('');

    Promise.all([
      fetchProximasDestinos(),
      fetchDestinosRealizados(),
    ])
      .then(([proximas, realizadas]) => {
        setProximasDestinos(proximas);
        setRealizadasDestinos(realizadas);
      })
      .catch(() => {
        setErro('Não foi possível carregar os destinos.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const destinos = useMemo(
    () => [...proximasDestinos, ...realizadasDestinos],
    [proximasDestinos, realizadasDestinos],
  );

  const categorias = useMemo(
    () => [
      'Todos',
      ...Array.from(new Set(destinos.map((d) => d.categoria))),
    ],
    [destinos],
  );

  const filtrar = useCallback(
    (lista: Destino[]) =>
      filtro === 'Todos'
        ? lista
        : lista.filter((d) => d.categoria === filtro),
    [filtro],
  );

  const proximas = filtrar(proximasDestinos);
  const realizadas = filtrar(realizadasDestinos);

  return (
    <section id="destinos" className="bg-slate-100 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Titulo
          titulo="Nossas viagens"
          texto="Confira as próximas saídas e reviva momentos que ajudamos a criar."
        />

        {categorias.length > 2 && (
          <div
            className="mt-8 flex flex-wrap gap-2"
            role="group"
            aria-label="Filtrar por categoria"
          >
            {categorias.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFiltro(c)}
                aria-pressed={filtro === c}
                className={`rounded-full px-4 py-2 text-sm font-bold transition-all duration-200 ${
                  filtro === c
                    ? 'bg-violet-600 text-white'
                    : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-violet-50 hover:text-violet-700'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="mt-10">
          {loading && (
            <div
              className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              aria-busy="true"
              aria-label="Carregando destinos"
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="animate-pulse overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70"
                >
                  <div className="aspect-[4/3] bg-slate-200" />
                  <div className="space-y-3 p-6">
                    <div className="h-5 w-2/3 rounded bg-slate-200" />
                    <div className="h-4 w-full rounded bg-slate-100" />
                    <div className="h-4 w-4/5 rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {erro && (
            <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-rose-200">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <IconAlert />
              </span>

              <p className="font-semibold text-slate-700">{erro}</p>

              <button
                type="button"
                onClick={carregar}
                className={btnSecundario}
              >
                Tentar de novo
              </button>
            </div>
          )}

          {!loading && !erro && destinos.length === 0 && (
            <p className="rounded-2xl bg-white p-10 text-center text-slate-500 shadow-sm ring-1 ring-slate-200/70">
              Nenhum destino cadastrado ainda.
            </p>
          )}

          {!loading && !erro && destinos.length > 0 &&
            proximas.length === 0 && realizadas.length === 0 && (
              <p className="rounded-2xl bg-white p-10 text-center text-slate-500 shadow-sm ring-1 ring-slate-200/70">
                Nenhuma viagem encontrada nessa categoria.
              </p>
            )}

          {!loading && !erro && proximas.length > 0 && (
            <div className="mb-12">
              <h3 className="mb-5 font-display text-2xl font-bold text-slate-900">
                Próximas viagens
              </h3>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {proximas.map((d) => (
                  <CardViagem key={d.id} d={d} />
                ))}
              </div>
            </div>
          )}

          {!loading && !erro && realizadas.length > 0 && (
            <div>
              <h3 className="mb-5 font-display text-2xl font-bold text-slate-900">
                Viagens que já rolaram
              </h3>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {realizadas.map((d) => (
                  <CardViagem key={d.id} d={d} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}


// ── Galeria ────────────────────────────────────────────────────────────────────
const FOTOS = [
  { src: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1000&q=80', label: 'Montanhas suíças', grande: true },
  { src: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=700&q=80', label: 'Tóquio' },
  { src: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?auto=format&fit=crop&w=700&q=80', label: 'Roma' },
  { src: 'https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?auto=format&fit=crop&w=700&q=80', label: 'Tailândia' },
  { src: 'https://images.unsplash.com/photo-1785094209983-5f4040c201bc?auto=format&fit=crop&w=700&q=80', label: 'Safári na África' },
  { src: 'https://plus.unsplash.com/premium_photo-1678240508014-d1ab7345bfe6?q=80&w=1074&auto=format&w=900*q=80', label: 'Resort 5 estrelas' },
  { src: 'https://plus.unsplash.com/premium_photo-1770210016839-131de07b2235?q=80&w=1074&auto=format&w=900*q=80', label: 'Maldivas' },
];

function Galeria() {
  return (
    <section id="galeria" className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <Titulo titulo="Destinos ao redor do mundo" texto="Cada foto é um convite para uma nova aventura." />
        <div className="mt-10 grid auto-rows-[170px] grid-cols-2 gap-3 sm:auto-rows-[220px] sm:gap-4 md:grid-cols-4">
          {FOTOS.map((f, i) => (
            <figure key={f.label}
              className={`group relative overflow-hidden rounded-2xl bg-slate-100 ${f.grande ? 'col-span-2 row-span-2' : ''} ${i >= 5 ? 'md:col-span-2' : ''}`}>
              <SafeImg src={f.src} alt={f.label} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 to-transparent p-4 pt-12 font-display text-base font-bold text-white sm:text-lg">
                {f.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Por que nós ────────────────────────────────────────────────────────────────
function PorQueNos() {
  const pilares = [
    { icon: '🏅', bg: 'rgba(255,107,53,.15)', title: 'Experiência', desc: 'Mais de 30 anos levando famílias e grupos para destinos incríveis com total segurança.' },
    { icon: '📞', bg: 'rgba(0,180,216,.15)', title: 'Suporte Completo', desc: 'Acompanhamos você antes, durante e após a viagem. Sempre disponíveis para ajudar.' },
    { icon: '💰', bg: 'rgba(45,198,83,.15)', title: 'Melhores Preços', desc: 'Parcerias com as melhores companhias para garantir o custo-benefício ideal.' },
    { icon: '✨', bg: 'rgba(123,47,190,.15)', title: 'Personalização', desc: 'Cada viagem é única. Pacotes sob medida para o seu perfil e orçamento.' },
  ];
  return (
    <section className="py-28" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #560f60 100%)' }}>
      <div className="text-center mb-16">
        <span className="block text-xs font-bold tracking-[3px] uppercase mb-3" style={{ color: '#FF6B35' }}>Por que escolher a MacFerr</span>
        <h2 className="font-display text-5xl text-white">Sua viagem, nossa missão</h2>
        <p className="text-white/50 text-lg mt-3">Motivos para confiar a nós a sua próxima aventura</p>
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-7">
  {pilares.map((p) => (
    <div key={p.title} className="text-center p-6 sm:p-8 lg:p-9 rounded-2xl border transition-all duration-300 hover:-translate-y-1 hover:border-orange/40 cursor-default" style={{background: 'rgba(255,255,255,.05)', borderColor: 'rgba(255,255,255,.08)',}}>
      <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center text-3xl" style={{ background: p.bg }}>
        {p.icon}
      </div>
      <h3 className="text-white font-bold text-lg mb-3">{p.title}</h3>
      <p className="text-white/55 text-sm leading-relaxed">{p.desc}</p>
    </div>
  ))}
</div>
    </section>
  );
}

// ── Horários ───────────────────────────────────────────────────────────────────
function Horarios() {
  const horarios: [string, string, boolean][] = [['Segunda a sexta', '10h às 19h', false], ['Sábado', '10h às 18h', false], ['Domingo', 'Fechado', true]];
  return (
    <section id="horarios" className="bg-white py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <div>
          <Titulo titulo="Horários e localização" texto="Venha nos visitar! Estamos prontos para planejar a sua próxima aventura." />
          <table className="mt-8 w-full">
            <caption className="sr-only">Horário de funcionamento</caption>
            <tbody>
              {horarios.map(([dia, hora, fechado]) => (
                <tr key={dia} className="border-b border-slate-200">
                  <th scope="row" className="py-4 text-left text-base font-semibold text-slate-900">{dia}</th>
                  <td className={`py-4 text-right text-base font-semibold ${fechado ? 'text-slate-400' : 'text-violet-700'}`}>{hora}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-2xl bg-slate-50 p-8 shadow-sm ring-1 ring-slate-200/70 sm:p-10">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600 text-white"><IconMapPin size={26} /></span>
          <h3 className="mt-6 font-display text-2xl font-bold text-slate-900">MacFerr Turismo</h3>
          <p className="mt-2 text-lg leading-relaxed text-slate-500">{ENDERECO}<br />{CIDADE}, Brasil</p>
          <a href={MAPS_URL} target="_blank" rel="noopener noreferrer" className={`${btnPrimario} mt-8`}>
            Abrir no Google Maps <IconArrowUpRight size={18} />
          </a>
        </div>
      </div>
    </section>
  );
}

// ── Contato ────────────────────────────────────────────────────────────────────
const FORM_INICIAL = { nome: '', telefone: '', email: '', interesse: 'Pacote nacional', mensagem: '' };

function Contato() {
  const [form, setForm] = useState(FORM_INICIAL);
  const [enviado, setEnviado] = useState(false);
  const set = (k: keyof typeof FORM_INICIAL, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`Interesse: ${form.interesse} — ${form.nome}`);
    const body = encodeURIComponent(`Nome: ${form.nome}\nTelefone: ${form.telefone}\nEmail: ${form.email}\nInteresse: ${form.interesse}\n\nMensagem:\n${form.mensagem}`);
    window.location.href = `mailto:${EMAIL}?subject=${subject}&body=${body}`;
    setEnviado(true);
  };

  const canais = [
    { Icone: IconMessage, label: 'WhatsApp', valor: WHATSAPP_TEXTO, href: WHATSAPP_URL, externo: true },
    { Icone: IconMail, label: 'E-mail', valor: EMAIL, href: `mailto:${EMAIL}`, externo: false },
    { Icone: IconInstagram, label: 'Instagram', valor: INSTAGRAM_USER, href: INSTAGRAM_URL, externo: true },
    { Icone: IconMapPin, label: 'Endereço', valor: `${ENDERECO}, ${CIDADE}`, href: MAPS_URL, externo: true },
  ];

  return (
    <section id="contato" className="bg-slate-50 py-16 sm:py-20 lg:py-28">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">

        {/* Texto primeiro no mobile */}
        <div className="order-1 min-w-0 lg:order-2">
          <Titulo
            titulo="Pronto para a próxima aventura?"
            texto="Entre em contato e vamos planejar juntos a viagem dos seus sonhos."
          />

          <ul className="mt-8 space-y-3">
            {canais.map(({ Icone, label, valor, href, externo }) => (
              <li key={label}>
                <a
                  href={href}
                  {...(externo
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  className="group flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 transition-all duration-200 hover:ring-violet-300"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 transition-all duration-200 group-hover:bg-violet-600 group-hover:text-white">
                    <Icone size={20} />
                  </span>

                  <span className="min-w-0">
                    <span className="block text-sm text-slate-500">
                      {label}
                    </span>
                    <span className="block break-words font-semibold text-slate-900">
                      {valor}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Imagem abaixo no mobile */}
        <div className="order-2 min-w-0 lg:order-1">
          <div className="overflow-hidden rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200/70 sm:p-4">
            <SafeImg
              src={agencia.src}
              alt="Agência de turismo"
              className="h-72 w-full rounded-xl object-cover object-center sm:h-72 lg:h-[520px]"
            />
          </div>
        </div>

      </div>
    </section>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────────
export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Sobre />
        <Destinos />
        {/* <Galeria /> */}
        <PorQueNos />
        <Horarios />
        <Contato />
      </main>
      <Footer />
      <WAFloat />
    </>
  );
}
