'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import {
  fetchDestinos, adminLogin, adminVerificarCodigo, adminCreateDestino, adminUpdateDestino, adminDeleteDestino, adminUploadImagem, ApiError, wakeBackend,
  MAX_FOTOS, type LoginResposta, type Destino,
} from '@/lib/api';
import { Logo } from '@/components/Logo';
import SafeImg from '@/components/SafeImg';
import { campo, rotulo, btnPrimario, btnSecundario } from '@/components/styles';
import {
  IconPlus, IconPencil, IconTrash, IconExternal, IconLogOut, IconArrowLeft, IconCalendar, IconUsers,
  IconGlobe, IconTag, IconLoader, IconX, IconCheck, IconAlert, IconMapTrifold, IconSearch,
} from '@/components/Icons';

const CATEGORIAS = ['Nacional', 'Internacional', 'Caribe', 'Europa', 'Ásia', 'Cruzeiro', 'Outro'];

const EMPTY_FORM: Omit<Destino, 'id'> = {
  titulo: '', descricao: '', data: '', viajantes: 0, categoria: 'Nacional', imagem: '',
  status: 'Rascunho', preco: '', tags: [], fotos: [],
};

const MAX_TAGS = 6;
const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BYTES = 5 * 1024 * 1024;

const parseTags = (txt: string): string[] => Array.from(new Set(txt.split(',').map((t) => t.trim()).filter(Boolean)));

// ── Login ──────────────────────────────────────────────────────────────────────
type EtapaLogin =
  | { tipo: 'senha' }
  | { tipo: 'codigo'; desafio: string; email: string; expiraEmTs: number; reenviarEmTs: number };

const mmss = (seg: number) => `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
const mensagemDe = (err: unknown, padrao: string) => (err instanceof ApiError ? err.message : padrao);

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [pw, setPw] = useState('');
  const [codigo, setCodigo] = useState('');
  const [etapa, setEtapa] = useState<EtapaLogin>({ tipo: 'senha' });
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [loading, setLoading] = useState(false);
  const [waking, setWaking] = useState(true);
  const [codigoMorto, setCodigoMorto] = useState(false); // desafio esgotado ou inválido: é preciso pedir outro
  const [agora, setAgora] = useState(() => Date.now());
  const codigoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Acordar o Render assim que o admin abre
    wakeBackend().finally(() => setWaking(false));
  }, []);

  // Relógio de 1 s, só enquanto espera o código (contagem de validade e do botão de reenvio)
  useEffect(() => {
    if (etapa.tipo !== 'codigo') return;
    setAgora(Date.now());
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [etapa]);

  useEffect(() => {
    if (etapa.tipo === 'codigo') codigoRef.current?.focus();
  }, [etapa]);
  
  const concluir = (token: string) => {
    setPw('');
    setCodigo('');
    onLogin(token);
  };
  const aplicarResposta = (r: LoginResposta) => {
    if (r.etapa === 'token') return concluir(r.token);
    const t = Date.now();
    setEtapa({ tipo: 'codigo', desafio: r.desafio, email: r.email, expiraEmTs: t + r.expiraEm * 1000, reenviarEmTs: t + r.reenviarEm * 1000 });
    setCodigo('');
    setCodigoMorto(false);
  };

  const handleSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErro('');
    setAviso('');
    try {
      aplicarResposta(await adminLogin(pw));
    } catch (err) {
      setErro(mensagemDe(err, 'Não foi possível conectar ao servidor. Tente de novo.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (etapa.tipo !== 'codigo') return;
    setLoading(true);
    setErro('');
    setAviso('');
    try {
      concluir(await adminVerificarCodigo(etapa.desafio, codigo));
    } catch (err) {
      setErro(mensagemDe(err, 'Não foi possível conectar ao servidor. Tente de novo.'));
      if (err instanceof ApiError) {
        const aindaValido = err.status === 401 && (err.detalhes as { tentativasRestantes?: number } | undefined)?.tentativasRestantes !== undefined;
        if (!aindaValido && (err.status === 401 || err.status === 429)) setCodigoMorto(true);
        if (aindaValido) setCodigo('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReenviar = async () => {
    setLoading(true);
    setErro('');
    setAviso('');
    try {
      aplicarResposta(await adminLogin(pw));
      setAviso('Enviamos um novo código. O anterior não vale mais.');
    } catch (err) {
      setErro(mensagemDe(err, 'Não foi possível conectar ao servidor. Tente de novo.'));
    } finally {
      setLoading(false);
    }
  };

  const voltar = () => {
    setEtapa({ tipo: 'senha' });
    setCodigo('');
    setPw('');
    setErro('');
    setAviso('');
  };

  const naCodigo = etapa.tipo === 'codigo';
  const restante = naCodigo ? Math.max(0, Math.ceil((etapa.expiraEmTs - agora) / 1000)) : 0;
  const espera = naCodigo ? Math.max(0, Math.ceil((etapa.reenviarEmTs - agora) / 1000)) : 0;
  const expirou = naCodigo && restante === 0;

  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-violet-950 lg:block">
        <img src="https://images.unsplash.com/photo-1606768666853-403c90a981ad?auto=format&fit=crop&w=1400&q=80" alt=""
          className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-violet-950/90 via-violet-950/40 to-violet-950/30" />
        <div className="relative flex h-full flex-col justify-end p-12">
          <p className="max-w-md font-display text-4xl font-extrabold leading-tight text-white">Cada viagem começa com um cadastro bem feito.</p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <Logo size={44} />
          <h1 className="mt-10 font-display text-3xl font-extrabold tracking-tight text-slate-900">
            {naCodigo ? 'Confirme o código' : 'Entrar no painel'}
          </h1>
          <p className="mt-2 text-slate-500">
            {naCodigo
              ? <>Enviamos um código de 6 dígitos para <strong className="font-semibold text-slate-700">{etapa.email || 'o seu e-mail'}</strong>. Olhe também a caixa de spam.</>
              : 'Acesso restrito à equipe da MacFerr.'}
          </p>

          {!naCodigo ? (
            <form onSubmit={handleSenha} className="mt-8 space-y-5">
              <div>
                <label htmlFor="senha" className={rotulo}>Senha</label>
                <input id="senha" type="password" required autoComplete="current-password" placeholder="Digite a senha"
                  value={pw} onChange={(e) => setPw(e.target.value)} className={campo} />
              </div>
              {waking && (
                <p className="flex items-center gap-2 text-sm text-slate-500"><IconLoader size={16} className="animate-spin" />Conectando ao servidor...</p>
              )}
              {erro && (
                <p role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200"><IconAlert size={18} />{erro}</p>
              )}
              <button type="submit" disabled={loading} className={`${btnPrimario} w-full py-3.5 text-base`}>
                {loading ? <><IconLoader size={18} className="animate-spin" />Enviando código...</> : 'Continuar'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCodigo} className="mt-8 space-y-5">
              <div>
                <label htmlFor="codigo" className={rotulo}>Código de verificação</label>
                <input id="codigo" ref={codigoRef} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*"
                  maxLength={6} required placeholder="000000" aria-describedby="codigo-ajuda"
                  value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className={`${campo} text-center font-display text-3xl font-bold tracking-[0.5em]`} />
                <p id="codigo-ajuda" className={`mt-2 text-sm ${expirou ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>
                  {expirou ? 'O código expirou. Peça um novo.' : `Vale por mais ${mmss(restante)}.`}
                </p>
              </div>
              {aviso && (
                <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200"><IconCheck size={18} />{aviso}</p>
              )}
              {erro && (
                <p role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 ring-1 ring-rose-200"><IconAlert size={18} />{erro}</p>
              )}
              <button type="submit" disabled={loading || codigo.length !== 6 || expirou || codigoMorto} className={`${btnPrimario} w-full py-3.5 text-base`}>
                {loading ? <><IconLoader size={18} className="animate-spin" />Verificando...</> : 'Entrar'}
              </button>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <button type="button" onClick={handleReenviar} disabled={loading || espera > 0}
                  className="font-semibold text-violet-700 transition-all duration-200 hover:text-violet-800 disabled:cursor-not-allowed disabled:text-slate-400">
                  {espera > 0 ? `Reenviar código em ${espera}s` : 'Reenviar código'}
                </button>
                <button type="button" onClick={voltar} className="inline-flex items-center gap-1.5 font-semibold text-slate-500 transition-all duration-200 hover:text-violet-700">
                  <IconArrowLeft size={16} />Voltar
                </button>
              </div>
            </form>
          )}

          {!naCodigo && (
            <a href="/" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-all duration-200 hover:text-violet-700">
              <IconArrowLeft size={16} />Voltar ao site
            </a>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Modal do formulário ────────────────────────────────────────────────────────
function DestinoModal({
  token, initial, editando, onSave, onClose, loading,
}: {
  token: string;
  initial: Omit<Destino, 'id'>;
  editando: boolean;
  onSave: (d: Omit<Destino, 'id'>) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof Omit<Destino, 'id'>, v: string | number) => setForm((prev) => ({ ...prev, [k]: v }));
  const [tagsTxt, setTagsTxt] = useState(initial.tags.join(', '));
  const tags = parseTags(tagsTxt);
  const tagsDemais = tags.length > MAX_TAGS;
  const [enviando, setEnviando] = useState(false);
  const [erroImg, setErroImg] = useState('');
  const [urlFoto, setUrlFoto] = useState('');
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [erroFotos, setErroFotos] = useState('');
  const restantes = MAX_FOTOS - form.fotos.length;
  const incompleto = !form.titulo.trim() || !form.descricao.trim() || !form.data.trim() || tagsDemais;

  const adicionarUrlFoto = () => {
    const url = urlFoto.trim();
    setErroFotos('');
    if (!url) return;
    if (restantes <= 0) return setErroFotos(`Limite de ${MAX_FOTOS} fotos adicionais atingido.`);
    if (!/^https?:\/\//i.test(url)) return setErroFotos('Use uma URL que comece com http:// ou https://.');
    if (form.fotos.includes(url)) return setErroFotos('Essa foto já foi adicionada.');
    setForm((prev) => ({ ...prev, fotos: [...prev.fotos, url] }));
    setUrlFoto('');
  };

  const removerFoto = (i: number) => {
    setErroFotos('');
    setForm((prev) => ({ ...prev, fotos: prev.fotos.filter((_, idx) => idx !== i) }));
  };

  const aoEscolherFotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!arquivos.length) return;
    setErroFotos('');
    const aceitos = arquivos.slice(0, Math.max(restantes, 0));
    const avisos: string[] = [];
    if (arquivos.length > aceitos.length) avisos.push(`Limite de ${MAX_FOTOS} fotos: ${arquivos.length - aceitos.length} arquivo(s) ignorado(s).`);
    setEnviandoFotos(true);
    const enviadas: string[] = [];
    for (const f of aceitos) {
      if (!TIPOS_IMAGEM.includes(f.type)) { avisos.push(`${f.name}: use JPEG, PNG, WebP ou GIF.`); continue; }
      if (f.size > MAX_BYTES) { avisos.push(`${f.name}: máximo de 5 MB.`); continue; }
      try { enviadas.push(await adminUploadImagem(token, f)); }
      catch (err) { avisos.push(`${f.name}: ${err instanceof Error ? err.message : 'erro ao enviar.'}`); }
    }
    if (enviadas.length) setForm((prev) => ({ ...prev, fotos: [...prev.fotos, ...enviadas].slice(0, MAX_FOTOS) }));
    if (avisos.length) setErroFotos(avisos.join(' '));
    setEnviandoFotos(false);
  };

  const aoEscolherArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErroImg('');
    if (!TIPOS_IMAGEM.includes(file.type)) {
      setErroImg('Use uma imagem JPEG, PNG, WebP ou GIF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setErroImg('A imagem deve ter no máximo 5 MB.');
      return;
    }
    setEnviando(true);
    try {
      set('imagem', await adminUploadImagem(token, file));
    } catch (err) {
      setErroImg(err instanceof Error ? err.message : 'Erro ao enviar imagem.');
    } finally {
      setEnviando(false);
    }
  };

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
      <div className="absolute inset-0 bg-slate-950/50" onClick={onClose} />
      <form
        onSubmit={(e) => { e.preventDefault(); if (!incompleto && !enviandoFotos) onSave({ ...form, tags }); }}
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 id="modal-titulo" className="font-display text-xl font-extrabold text-slate-900">{editando ? 'Editar destino' : 'Novo destino'}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><IconX size={18} /></button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-6">
          <div>
            <label htmlFor="f-titulo" className={rotulo}>Título</label>
            <input id="f-titulo" value={form.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ex: Europa Clássica" className={campo} autoFocus />
          </div>
          <div>
            <label htmlFor="f-desc" className={rotulo}>Descrição</label>
            <textarea id="f-desc" value={form.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Breve descrição da viagem..." rows={3} className={`${campo} resize-none`} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="f-data" className={rotulo}>Data</label>
              <input id="f-data" value={form.data} onChange={(e) => set('data', e.target.value)} placeholder="Março 2024" className={campo} />
            </div>
            <div>
              <label htmlFor="f-viaj" className={rotulo}>Viajantes</label>
              <input id="f-viaj" type="number" min={0} value={form.viajantes} onChange={(e) => set('viajantes', Number(e.target.value))} className={campo} />
            </div>
            <div>
              <label htmlFor="f-cat" className={rotulo}>Categoria</label>
              <select id="f-cat" value={form.categoria} onChange={(e) => set('categoria', e.target.value)} className={campo}>
                {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="f-status" className={rotulo}>Status</label>
              <select id="f-status" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Destino['status'] }))} className={campo}>
                <option value="Rascunho">Rascunho</option>
                <option value="Disponivel">Disponivel</option>
                <option value="Esgotada">Esgotada</option>
                <option value="Finalizada">Finalizada</option>
              </select>
            </div>
            <div>
              <label htmlFor="f-preco" className={rotulo}>Preço</label>
              <input id="f-preco" value={form.preco} onChange={(e) => set('preco', e.target.value)} placeholder="Ex: A partir de R$ 4.990" className={campo} maxLength={60} />
            </div>
          </div>
          <div>
            <label htmlFor="f-tags" className={rotulo}>Tags <span className="font-normal text-slate-400">(separadas por vírgula, até {MAX_TAGS})</span></label>
            <input id="f-tags" value={tagsTxt} onChange={(e) => setTagsTxt(e.target.value)} placeholder="Ex: Praia, Mergulho, Em grupo" className={campo} />
            {tagsDemais && <p role="alert" className="mt-2 text-sm font-semibold text-rose-600">Use no máximo {MAX_TAGS} tags.</p>}
          </div>
          <div>
            <label htmlFor="f-img" className={rotulo}>URL da imagem de capa</label>
            <input id="f-img" value={form.imagem} onChange={(e) => set('imagem', e.target.value)} placeholder="https://images.unsplash.com/..." className={campo} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className={`${btnSecundario} cursor-pointer px-4 py-2.5 ${enviando ? 'pointer-events-none opacity-60' : ''}`}>
                {enviando ? <><IconLoader size={16} className="animate-spin" />Enviando...</> : 'Enviar do computador'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={aoEscolherArquivo} disabled={enviando} />
              </label>
              <span className="text-xs text-slate-500">ou cole uma URL acima. Máx. 5 MB.</span>
            </div>
            {erroImg && <p role="alert" className="mt-2 text-sm font-semibold text-rose-600">{erroImg}</p>}
            {form.imagem && <SafeImg src={form.imagem} alt="Pré-visualização" className="mt-3 h-32 w-full rounded-xl object-cover" />}
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className={`${rotulo} mb-0`}>Fotos adicionais (carrossel)</span>
              <span className={`text-xs font-bold ${restantes === 0 ? 'text-violet-700' : 'text-slate-500'}`} aria-live="polite">{form.fotos.length}/{MAX_FOTOS}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Aparecem na página da viagem apenas quando o status é &ldquo;Viagem realizada&rdquo;.</p>

            {form.fotos.length > 0 && (
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {form.fotos.map((f, i) => (
                  <li key={`${f}-${i}`} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
                    <SafeImg src={f} alt={`Foto adicional ${i + 1}`} className="h-full w-full object-cover" />
                    <button type="button" onClick={() => removerFoto(i)} aria-label={`Remover foto ${i + 1}`}
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/75 text-white transition-all duration-200 hover:bg-rose-600">
                      <IconX size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className={`${btnSecundario} cursor-pointer px-4 py-2.5 ${enviandoFotos || restantes <= 0 ? 'pointer-events-none opacity-60' : ''}`}>
                {enviandoFotos ? <><IconLoader size={16} className="animate-spin" />Enviando...</> : <><IconPlus size={16} />Enviar fotos</>}
                <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={aoEscolherFotos} disabled={enviandoFotos || restantes <= 0} />
              </label>
              <span className="text-xs text-slate-500">{restantes > 0 ? `Mais ${restantes} ${restantes === 1 ? 'foto' : 'fotos'}. Máx. 5 MB cada.` : 'Limite atingido. Remova uma foto para adicionar outra.'}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <input aria-label="URL da foto adicional" value={urlFoto} onChange={(e) => setUrlFoto(e.target.value)} disabled={restantes <= 0}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarUrlFoto(); } }}
                placeholder="ou cole uma URL https://..." className={campo} />
              <button type="button" onClick={adicionarUrlFoto} disabled={restantes <= 0 || !urlFoto.trim()} className={`${btnSecundario} shrink-0 px-4`}>Adicionar</button>
            </div>
            {erroFotos && <p role="alert" className="mt-2 text-sm font-semibold text-rose-600">{erroFotos}</p>}
          </div>
          {incompleto && <p className="text-sm text-slate-500">Preencha título, descrição e data para salvar.</p>}
        </div>

        <div className="flex gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <button type="button" onClick={onClose} className={`${btnSecundario} flex-1`}>Cancelar</button>
          <button type="submit" disabled={loading || incompleto || enviando || enviandoFotos} className={`${btnPrimario} flex-1`}>
            {loading ? <><IconLoader size={16} className="animate-spin" />Salvando...</> : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
type ToastState = { msg: string; tipo: 'ok' | 'erro' } | null;

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [destinos, setDestinos] = useState<Destino[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; destino?: Destino }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [busca, setBusca] = useState('');

  const showToast = useCallback((msg: string, tipo: 'ok' | 'erro' = 'ok') => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try { setDestinos(await fetchDestinos()); }
    catch { showToast('Erro ao carregar destinos.', 'erro'); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form: Omit<Destino, 'id'>) => {
    setSaving(true);
    try {
      if (modal.destino) {
        const updated = await adminUpdateDestino(token, modal.destino.id, form);
        setDestinos((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        showToast('Destino atualizado.');
      } else {
        const novo = await adminCreateDestino(token, form);
        setDestinos((prev) => [...prev, novo]);
        showToast('Destino adicionado.');
      }
      setModal({ open: false });
    } catch (err) {
      showToast(err instanceof Error && err.message && !err.message.startsWith('Erro ao') ? err.message : 'Erro ao salvar. Verifique o servidor.', 'erro');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminDeleteDestino(token, id);
      setDestinos((prev) => prev.filter((d) => d.id !== id));
      showToast('Destino removido.');
    } catch {
      showToast('Erro ao deletar.', 'erro');
    } finally {
      setConfirmDelete(null);
    }
  };

  const alvoExclusao = destinos.find((d) => d.id === confirmDelete);
  const q = busca.trim().toLowerCase();
  const lista = q ? destinos.filter((d) => d.titulo.toLowerCase().includes(q)) : destinos;

  const stats = [
    { label: 'Destinos cadastrados', value: destinos.length, Icone: IconGlobe },
    { label: 'Viajantes no total', value: destinos.reduce((s, d) => s + (d.viajantes || 0), 0), Icone: IconUsers },
    { label: 'Categorias em uso', value: new Set(destinos.map((d) => d.categoria)).size, Icone: IconTag },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo size={34} />
            <span className="hidden rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700 sm:inline">Painel</span>
          </div>
          <div className="flex items-center gap-1">
            <a href="/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-100">
              <IconExternal size={16} /><span className="hidden sm:inline">Ver site</span>
            </a>
            <button type="button" onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-100">
              <IconLogOut size={16} /><span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">Destinos</h1>

        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          {stats.map(({ label, value, Icone }) => (
            <div key={label} className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Icone size={20} /></span>
              <div>
                <dd className="font-display text-3xl font-extrabold leading-none text-slate-900">{value}</dd>
                <dt className="mt-1 text-sm text-slate-500">{label}</dt>
              </div>
            </div>
          ))}
        </dl>

        <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70" aria-label="Destinos cadastrados">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <label className="relative block sm:w-72">
              <span className="sr-only">Buscar destino</span>
              <IconSearch size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título" className={`${campo} pl-11`} />
            </label>
            <button type="button" onClick={() => setModal({ open: true })} className={btnPrimario}>
              <IconPlus size={18} />Novo destino
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center py-16 text-slate-500">
              <IconLoader size={28} className="animate-spin text-violet-600" />
              <p className="mt-3 text-sm">Carregando destinos...</p>
            </div>
          ) : destinos.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-700"><IconMapTrifold size={26} /></span>
              <p className="mt-4 font-display text-lg font-bold text-slate-900">Nenhum destino cadastrado</p>
              <p className="mt-1 text-sm text-slate-500">Adicione o primeiro para ele aparecer no site.</p>
              <button type="button" onClick={() => setModal({ open: true })} className={`${btnPrimario} mt-6`}><IconPlus size={18} />Adicionar destino</button>
            </div>
          ) : lista.length === 0 ? (
            <p className="px-6 py-14 text-center text-slate-500">Nenhum destino com esse título.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lista.map((d) => (
                <li key={d.id} className="flex flex-col gap-4 p-4 transition-all duration-200 hover:bg-slate-50 sm:flex-row sm:items-center sm:p-5">
                  <SafeImg src={d.imagem} alt={d.titulo} className="h-36 w-full shrink-0 rounded-xl bg-slate-100 object-cover sm:h-16 sm:w-24" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-bold leading-snug text-slate-900">{d.titulo}</h2>
                      <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">{d.categoria}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${d.status === 'Disponivel' ? 'bg-emerald-50 text-emerald-700' : d.status === 'Esgotada' ? 'bg-rose-50 text-rose-700' : d.status === 'Rascunho' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                        {d.status === 'Disponivel' ? 'Disponivel' : d.status === 'Esgotada' ? 'Esgotada' : d.status === 'Rascunho' ? 'Rascunho' : 'Realizada'}
                      </span>
                    </div>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1.5"><IconCalendar size={14} />{d.data}</span>
                      <span className="inline-flex items-center gap-1.5"><IconUsers size={14} />{d.viajantes} viajantes</span>
                      <span className="inline-flex items-center gap-1.5"><IconPlus size={14} />{d.fotos.length}/{MAX_FOTOS} fotos</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => setModal({ open: true, destino: d })} aria-label={`Editar ${d.titulo}`}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-50 px-4 text-sm font-bold text-violet-700 transition-all duration-200 hover:bg-violet-100">
                      <IconPencil size={16} />Editar
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(d.id)} aria-label={`Excluir ${d.titulo}`}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-50 px-4 text-sm font-bold text-rose-600 transition-all duration-200 hover:bg-rose-100">
                      <IconTrash size={16} />Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {modal.open && (
        <DestinoModal
          token={token}
          initial={modal.destino
            ? { titulo: modal.destino.titulo, descricao: modal.destino.descricao, data: modal.destino.data, viajantes: modal.destino.viajantes, categoria: modal.destino.categoria, imagem: modal.destino.imagem, status: modal.destino.status, preco: modal.destino.preco, tags: modal.destino.tags, fotos: modal.destino.fotos }
            : EMPTY_FORM}
          editando={!!modal.destino}
          onSave={handleSave}
          onClose={() => setModal({ open: false })}
          loading={saving}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="del-titulo">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="del-titulo" className="font-display text-xl font-extrabold text-slate-900">Excluir {alvoExclusao ? `"${alvoExclusao.titulo}"` : 'destino'}?</h2>
            <p className="mt-2 text-slate-500">O destino some do site e esta ação não pode ser desfeita.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setConfirmDelete(null)} className={btnSecundario}>Cancelar</button>
              <button type="button" onClick={() => handleDelete(confirmDelete)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-6 py-3 text-sm font-bold text-white transition-all duration-200 hover:bg-rose-700">Excluir destino</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
          <div className={`pointer-events-auto inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${toast.tipo === 'erro' ? 'bg-rose-600' : 'bg-slate-900'}`}>
            {toast.tipo === 'erro' ? <IconAlert size={18} /> : <IconCheck size={18} />}{toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('macferr_token');
    if (saved) setToken(saved);
  }, []);

  const handleLogin = (t: string) => {
    sessionStorage.setItem('macferr_token', t);
    setToken(t);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('macferr_token');
    setToken(null);
  };

  if (!token) return <LoginScreen onLogin={handleLogin} />;
  return <Dashboard token={token} onLogout={handleLogout} />;
}
