# Velo — Seu dinheiro em movimento

Desenvolvido por **Gabriel Gonçalves**.

App web responsivo (mobile-first) para casais organizarem rotina e finanças em conjunto.
Feito em **HTML + CSS (Tailwind) + JavaScript puro**, com dados salvos no **Supabase**.

## O que já está pronto

- ✅ **Login real** com nome + senha (senha criptografada no banco via `pgcrypto`,
  nunca fica acessível pelo navegador — só um resultado sim/não volta pro app)
- ✅ **Rotina** com abas por perfil / Casal, tarefas por período do dia
- ✅ **Finanças** pessoais e do casal, com metas financeiras
- ✅ **Despesas Fixas** — financiamentos parcelados (ex: carro, com número de
  parcelas) e contas recorrentes (ex: internet, luz), separadas em **Atrasadas /
  Em Aberto / Pagas**
- ✅ **Nosso Espaço** — visão combinada do casal, com recados carinhosos
- ✅ **Sincronia em tempo real** — o que um mexe aparece na hora no celular do outro
- ✅ Identidade visual em cinza-grafite + dourado
- ✅ Banco de dados Supabase todo configurado (projeto `financas`)

## Passo a passo para publicar no GitHub Pages

1. **Crie um repositório no GitHub** (ou use um que já tenha)
   - Acesse https://github.com/new, deixe **Público**, clique em "Create repository"

2. **Suba os arquivos — de uma vez só**
   - Baixe e extraia o zip que te enviei
   - No repositório, clique em "Add file" → "Upload files"
   - Selecione **tudo dentro da pasta** (Ctrl+A / Cmd+A) — `index.html`, `README.md`
     e as pastas **`css/` e `js/` inteiras** — e arraste tudo junto
   - Clique em "Commit changes"

   ⚠️ **Não suba arquivo por arquivo separadamente** — isso já causou problemas
   antes (arquivos fora da pasta certa = página quebrada). Sempre apague tudo e
   suba a pasta inteira de uma vez ao atualizar.

3. **Ative o GitHub Pages**
   - **Settings → Pages** → Source: "Deploy from a branch" → Branch: `main`, pasta `/ (root)` → **Save**
   - Em 1-2 minutos o app estará no ar

4. **Conferir a estrutura** — na raiz do repositório deve aparecer: `index.html`,
   `README.md`, e duas **pastas** `css` e `js` (com `app.js` e `config.js` dentro
   da `js`, não soltos na raiz)

## Como entrar pela primeira vez

Na tela inicial, toque em **"Criar novo perfil"**, escolha nome, papel, cor e uma
senha. Depois disso é só entrar com nome + senha na tela de login.

## Sobre o Supabase (já configurado)

- Projeto: `financas` (região us-west-2) — URL: `https://tncnjtjbbvjrzleqsucf.supabase.co`
- A chave em `js/config.js` é a **anon/public key** — é normal e seguro ela
  aparecer no código do front-end; a segurança fica por conta do **Row Level
  Security (RLS)** e de funções do banco com `security definer` para login.
- As senhas ficam com hash (`bcrypt`, via `pgcrypto`) e a coluna com o hash está
  bloqueada até para leitura pelo app — só duas funções do banco
  (`check_login`, `set_password`) conseguem tocar nela.

⚠️ Continua sendo um app privado (RLS aberto entre os dois perfis) — pensado
para uso entre vocês dois, não para publicar numa loja de apps.

## Estrutura de arquivos

```
shared-calm/
├── index.html          → app inteiro (todas as telas)
├── css/style.css        → estilos complementares ao Tailwind
├── js/config.js         → URL e chave do Supabase
├── js/app.js            → toda a lógica do app
└── README.md
```

## Próximos passos possíveis (é só pedir)

- Editar tarefas/despesas já criadas (hoje só dá pra criar ou apagar)
- Recuperação de senha esquecida
- Upload de fotos em "Momentos"
- Gráficos de gastos por categoria
- Vincular pagamento de despesa fixa às Despesas Recentes automaticamente
