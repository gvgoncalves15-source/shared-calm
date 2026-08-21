# Shared Calm — Nossa Rotina e Finanças

App web responsivo (mobile-first) para casais organizarem rotina e finanças em conjunto.
Feito em **HTML + CSS (Tailwind) + JavaScript puro**, com dados salvos no **Supabase**.

## O que já está pronto

- ✅ Banco de dados criado no Supabase (projeto `financas`), com tabelas:
  `profiles`, `routine_tasks`, `finance_goals`, `finance_transactions`, `nudges`
- ✅ Perfis do Lucas e da Mariana já cadastrados
- ✅ Tela de login (escolher perfil), Rotina (com abas **Lucas / Casal / Mariana**),
  Finanças (mesmas 3 abas — cada um vê as próprias finanças, e "Casal" mostra o
  saldo conjunto), Nosso Espaço (visão do casal) e Perfil
- ✅ Front-end já conectado ao Supabase (chave pública em `js/config.js`)

## Passo a passo para publicar no GitHub Pages

1. **Crie um repositório no GitHub**
   - Acesse https://github.com/new
   - Nome sugerido: `shared-calm`
   - Deixe como **Público** (necessário para o GitHub Pages gratuito) e clique em "Create repository"

2. **Suba os arquivos**
   - Baixe os arquivos que te enviei (pasta `shared-calm/`)
   - Na página do repositório recém-criado, clique em "uploading an existing file"
   - Arraste todos os arquivos e pastas (`index.html`, `css/`, `js/`, `README.md`) mantendo a estrutura
   - Clique em "Commit changes"

   *Alternativa via terminal (se preferir git):*
   ```bash
   cd shared-calm
   git init
   git add .
   git commit -m "primeira versão do app"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/shared-calm.git
   git push -u origin main
   ```

3. **Ative o GitHub Pages**
   - No repositório, vá em **Settings → Pages**
   - Em "Source", selecione **Deploy from a branch**
   - Branch: `main`, pasta: `/ (root)` → clique em **Save**
   - Em 1-2 minutos seu app estará no ar em:
     `https://SEU-USUARIO.github.io/shared-calm/`

4. **Pronto** — acesse o link no celular do Lucas e da Mariana. Como os dados
   ficam no Supabase, os dois vão ver a mesma informação em tempo real (é só
   atualizar a página).

## Sobre o Supabase (já configurado)

- Projeto: `financas` (região us-west-2)
- URL: `https://tncnjtjbbvjrzleqsucf.supabase.co`
- A chave usada no front-end (`js/config.js`) é a **anon/public key** — ela é
  feita para ficar exposta no navegador; a segurança fica por conta das
  políticas de **Row Level Security (RLS)**, que já estão ativas nas 5 tabelas.

⚠️ **Importante sobre segurança:** hoje o app não tem senha — é só escolher
"Lucas" ou "Mariana" na tela inicial, e as políticas de RLS liberam leitura/escrita
para qualquer pessoa com o link (pensado para uso privado entre vocês dois,
sem app store). Se quiser adicionar um PIN ou um login real (e-mail/senha) mais
pra frente, é só pedir — dá para evoluir com o Supabase Auth sem redesenhar o app.

## O que eu precisaria de acesso pra ir além

Eu já tenho acesso direto ao seu projeto Supabase (por isso consegui criar as
tabelas para você). Para o GitHub, eu **não tenho** um jeito de criar o
repositório ou publicar por você automaticamente — por isso o passo a passo
acima é manual. Se quiser automatizar isso no futuro, existem duas opções:
- Conectar uma integração de GitHub aqui no chat (se/quando disponível na sua conta)
- Usar o **Claude Code** (app de terminal) rodando na sua máquina, que tem
  acesso ao `git`/GitHub diretamente

## Estrutura de arquivos

```
shared-calm/
├── index.html          → app inteiro (todas as telas)
├── css/style.css        → estilos complementares ao Tailwind
├── js/config.js         → URL e chave do Supabase
├── js/app.js            → toda a lógica (login, rotina, finanças, casal)
└── README.md
```

## Próximos passos possíveis (é só pedir)

- Login com senha/PIN por perfil (Supabase Auth)
- Notificações reais (hoje o sininho é só visual)
- Editar/excluir tarefas e despesas
- Upload de fotos em "Momentos"
- Gráficos de gastos por categoria
