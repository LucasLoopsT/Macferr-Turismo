# MacFerr Turismo: backend

API REST em Node.js + TypeScript + Express para o site da MacFerr. Os destinos ficam em um arquivo JSON, as imagens em uma pasta do disco, e o painel admin é protegido por JWT.

Compatível com o `frontend/src/lib/api.ts` existente (mesmos caminhos, métodos, cabeçalhos e campos).

## Como rodar localmente

Requisitos: Node.js 20 ou superior.

```bash
cd backend
npm install
cp .env.example .env     # depois edite ADMIN_PASSWORD e JWT_SECRET
npm run dev              # http://localhost:3001 (reinicia ao salvar)
```

Gere um segredo JWT aleatório com:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

No frontend, em `frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Rode o frontend (`npm run dev`, porta 3000). O `.env.example` já libera essa origem no CORS.

Se algo obrigatório estiver faltando ou ainda com o valor de exemplo, o servidor não sobe e explica o que corrigir.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Desenvolvimento, com recarga automática |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Produção (`node dist/server.js`) |
| `npm run typecheck` | Verifica tipos sem gerar arquivos |
| `npm test` | Roda todos os testes |

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `ADMIN_PASSWORD` | sim | Senha do painel (mínimo 8 caracteres) |
| `JWT_SECRET` | sim | Segredo de assinatura do token (mínimo 32 caracteres, diferente da senha) |
| `JWT_EXPIRES_IN` | não | Validade do token: número + `s`, `m`, `h` ou `d`. Padrão `8h` |
| `PORT` | não | Padrão `3001` (o mesmo padrão do `api.ts`). O Render define sozinho |
| `CORS_ORIGINS` | em produção | Origens do frontend, separadas por vírgula, sem barra final |
| `PUBLIC_BASE_URL` | em produção | URL pública do backend, usada nos links das imagens |
| `DATA_DIR` | em produção | Pasta de `destinos.json` e `uploads/`. Em produção, o disco persistente |
| `UPLOAD_DIR` | não | Padrão `DATA_DIR/uploads` |
| `MAX_UPLOAD_MB` | não | Tamanho máximo por imagem, de 1 a 20. Padrão 5 |
| `SEED_FILE` | não | Dados iniciais usados só se `destinos.json` ainda não existir |
| `NODE_ENV` | não | `production` ativa as exigências acima |

## Persistência: leia antes de publicar

Tudo que a API grava (o `destinos.json`, o backup `destinos.json.bak` e as imagens) fica dentro de `DATA_DIR`. **Se o sistema de arquivos da hospedagem for efêmero, esses dados são apagados a cada deploy ou reinício.**

- **Render:** o plano gratuito é efêmero. Use uma instância paga (starter ou superior) com **Disk** montado em `/var/data` e defina `DATA_DIR=/var/data`. O `render.yaml` deste projeto já configura isso.
- **Alternativas:** Fly.io (Volume), Railway (Volume) ou uma VPS. O princípio é o mesmo: `DATA_DIR` precisa apontar para um volume que sobrevive a reinícios.
- Em produção o servidor se recusa a iniciar sem `DATA_DIR`, justamente para ninguém publicar sem decidir onde os dados vão ficar.
- Faça cópia periódica de `DATA_DIR` (principalmente de `destinos.json` e de `uploads/`).
- Use **uma única instância**. O controle de gravações simultâneas é feito em memória, então escalar para várias instâncias exigiria um banco de dados.

Como o arquivo é protegido: as gravações são serializadas, atômicas (escreve em temporário, `fsync` e renomeia) e guardam o estado anterior em `destinos.json.bak`. Se o arquivo for corrompido por fora, a API devolve 500 e **não sobrescreve nada**; restaure o `.bak`.

### Dados iniciais (opcional)

Com `SEED_FILE=./seed/destinos.json`, a primeira inicialização cria o `destinos.json` a partir do seed, só se ele ainda não existir. Em produção deixe vazio para começar com a lista vazia. A pasta `seed/` é versionada no Git; `data/` não (veja o `.gitignore`).

## Deploy no Render (resumo)

1. Suba o projeto para o GitHub (a pasta `backend/` pode ser a raiz do repositório ou um subdiretório; neste caso, informe `backend` em *Root Directory*).
2. Crie um **Web Service** (ou use o `render.yaml` como Blueprint) com:
   - Build: `npm install --include=dev && npm run build` (o `--include=dev` garante o TypeScript mesmo com `NODE_ENV=production`; depois do primeiro `npm install` local, versione o `package-lock.json` e, se quiser, troque por `npm ci --include=dev`)
   - Start: `npm start`
   - Health check: `/health`
3. Adicione um **Disk** em `/var/data`.
4. Configure as variáveis: `NODE_ENV=production`, `DATA_DIR=/var/data`, `ADMIN_PASSWORD`, `JWT_SECRET`, `PUBLIC_BASE_URL=https://SEU-SERVICO.onrender.com` e `CORS_ORIGINS=https://SEU-FRONTEND`.
5. No frontend, defina `NEXT_PUBLIC_API_URL=https://SEU-SERVICO.onrender.com` **antes do build** (o Next embute `NEXT_PUBLIC_*` na compilação) e publique de novo.

`CORS_ORIGINS` leva só a origem (esquema + domínio), sem caminho. Para um site no GitHub Pages em `https://usuario.github.io/macferr/`, a origem é `https://usuario.github.io`. Pode listar várias separadas por vírgula (por exemplo, o domínio próprio e o `www`).

## Endpoints

Erros sempre vêm como JSON `{ "erro": "mensagem" }`. Erros de validação trazem também `"detalhes": [{ "campo", "mensagem" }]`.

| Método e rota | Acesso | Sucesso | Erros |
| --- | --- | --- | --- |
| `GET /health` | público | 200 `{ "status": "ok" }` | |
| `GET /api/destinos` | público | 200 e **array** de destinos | 500 |
| `POST /api/admin/login` | público | 200 `{ "token": "..." }` | 400 senha ausente, 401 senha incorreta, 429 muitas falhas |
| `POST /api/admin/destinos` | JWT | 201 e o destino criado | 400, 401, 500 |
| `PUT /api/admin/destinos/:id` | JWT | 200 e o destino atualizado | 400 (dados ou id inválidos), 401, 404 |
| `DELETE /api/admin/destinos/:id` | JWT | 204 sem corpo | 400 (id inválido), 401, 404 |
| `POST /api/admin/upload` | JWT | 201 `{ "url", "path" }` | 401, 413 grande demais, 415 tipo inválido |
| `GET /uploads/<arquivo>` | público | a imagem | 404 |

Rotas inexistentes (fora de `/api/admin`, que sempre pede token) respondem 404. Erros inesperados respondem 500 com mensagem genérica; o detalhe vai só para o log do servidor.

### Destino

```json
{ "id": "uuid", "titulo": "", "descricao": "", "data": "", "viajantes": 0, "categoria": "", "imagem": "" }
```

Limites: `titulo` até 120 caracteres, `descricao` até 2000, `data` até 60, `categoria` até 40, `viajantes` inteiro de 0 a 100000, `imagem` até 2048 (pode ser vazia). No `PUT` basta enviar os campos que mudam. O `id` é gerado pelo backend e **nunca** muda: se vier no corpo, é ignorado.

### Login e rotas protegidas

```
POST /api/admin/login   { "password": "..." }   ->   { "token": "..." }
Authorization: Bearer <token>
```

Token ausente, malformado, adulterado, de outro segredo ou expirado resulta em 401. Depois de 10 senhas erradas seguidas vindas do mesmo IP, o login responde 429 por 15 minutos.

### Imagens

Duas formas de preencher `imagem`:

- **URL externa** `http(s)://...`, como já funcionava.
- **Upload:** `POST /api/admin/upload` com os bytes da imagem no corpo e `Content-Type: image/jpeg|png|webp|gif`. A resposta traz `url`, que vai no campo `imagem` do destino.

```bash
curl -X POST http://localhost:3001/api/admin/upload \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: image/png" \
  --data-binary @foto.png
```

O backend confere o tipo pelo **conteúdo** do arquivo (não só pelo cabeçalho), recusa SVG e qualquer coisa que não seja imagem, limita o tamanho e gera o nome do arquivo (UUID). Nada vindo do cliente entra no caminho gravado.

No JSON fica só o caminho relativo (`/uploads/<uuid>.png`); a API converte para URL absoluta (`PUBLIC_BASE_URL`) nas respostas, porque o frontend usa `imagem` direto no `<img src>` e está em outro domínio. Se o frontend devolver essa URL ao editar, o backend a normaliza de volta.

Limpeza de arquivos: ao trocar a imagem ou excluir um destino, o arquivo antigo é apagado **se nenhum outro destino o usa**. Ao iniciar, o servidor também remove uploads com mais de 24 h que nenhum destino referencia (envios abandonados).

## Segurança, em resumo

- Senha e segredo JWT só por variável de ambiente; nunca aparecem em respostas nem em logs. O log de requisições registra apenas método, caminho, status e duração.
- Senha comparada em tempo constante; JWT fixado em HS256 com expiração.
- O JWT é verificado **antes** de qualquer leitura de corpo nas rotas admin, inclusive o upload.
- Gravação de arquivos só com nome gerado pelo servidor; leitura e remoção só de nomes no formato UUID + extensão.
- CORS por lista de origens, `helmet` para cabeçalhos de segurança e limite de 100 KB para JSON.

## Testes

```bash
npm test
```

| Arquivo | Cobre |
| --- | --- |
| `config.test.ts` | Validação das variáveis na inicialização |
| `validate.test.ts` | Validação dos dados de destino |
| `destinoService.test.ts` | CRUD, persistência entre reinícios, gravações simultâneas, backup, arquivo corrompido, seed |
| `imageService.test.ts` | Tipo real do arquivo, tamanho, caminhos perigosos, remoção e limpeza |
| `authService.test.ts` | Senha, token válido, expirado, adulterado, outro segredo, `alg: none` |
| `middlewares.test.ts` | Acesso sem token e com token inválido (401), limitador de login, erros sem vazamento |
| `controllers.test.ts` | Login, CRUD, 400/404, troca e exclusão de imagem sem apagar arquivo compartilhado |
| `api.test.ts` | O mesmo por HTTP de verdade (login, 401, CRUD, upload, CORS, persistência após reinício) |

## Mudanças no frontend

O contrato existente não mudou. Só foi preciso acrescentar o envio de imagem, em `frontend-alteracoes/` (copie por cima dos arquivos de mesmo caminho):

- `src/lib/api.ts`: nova função `adminUploadImagem(token, file)`. As demais ficaram idênticas.
- `src/app/admin/page.tsx`: o modal de destino ganhou o botão **Enviar do computador** ao lado do campo de URL.

O frontend não tinha galeria de fotos por destino (a galeria da home é uma lista fixa), nem status ou vagas, então **o modelo não ganhou campos novos**.

## Limitações conhecidas

- Uma instância apenas (ver *Persistência*).
- O limitador de login fica em memória e zera quando o servidor reinicia.
- O token fica no `sessionStorage` do navegador (já era assim). Se expirar, o painel mostra erro de salvar e é preciso entrar de novo.
- Sem "sair em todos os dispositivos": para invalidar todos os tokens, troque o `JWT_SECRET`.
