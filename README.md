# Velo — Seu dinheiro em movimento

Desenvolvido por **Gabriel Gonçalves**.

App web responsivo (mobile-first) e instalável (PWA) para casais organizarem
rotina e finanças em conjunto. Feito em **HTML + CSS (Tailwind) + JavaScript
puro**, com dados salvos e sincronizados em tempo real no **Supabase**.

## O que já está pronto

- ✅ **Login real** com nome + senha (hash `bcrypt`, coluna bloqueada até para o app)
- ✅ **Rotina semanal** — navegação por semana, tarefas com horário exato,
  gráfico de concluídas x falhas por dia
- ✅ **Finanças**: saldo, "Podemos gastar?" (calculado com renda, contas
  fixas, despesas e metas reais), gráfico de rosca por categoria, busca e
  filtro nas despesas, tendência real vs mês passado
- ✅ **Metas financeiras** com sugestão automática de quanto guardar por mês
- ✅ **Despesas Fixas** — financiamentos parcelados e contas recorrentes,
  com status Atrasada / Vence hoje / Em Aberto / Paga
- ✅ **Nosso Espaço** — visão do casal, recados carinhosos, sequência
  (streak) de dias com a rotina 100% em dia
- ✅ **Resumo do Mês** (aba Perfil) — quebra semana a semana, com exportação
  em **CSV**
- ✅ **Instalável como app** (PWA) — ícone na tela inicial, abre sem barra
  do navegador
- ✅ Identidade visual em preto + dourado, com animações e brilho nos botões

## Passo a passo para publicar no GitHub Pages

1. **Crie um repositório no GitHub** (ou use um que já tenha)
2. **Suba os arquivos — de uma vez só**: apague tudo que já está lá,
   extraia o zip, selecione **tudo dentro da pasta** (Ctrl+A / Cmd+A —
   incluindo as pastas `css/`, `js/` e `icons/` inteiras) e arraste junto em
   "Add file" → "Upload files" → "Commit changes"

   ⚠️ **Nunca suba arquivo por arquivo separadamente** — isso já quebrou a
   página antes.

3. **Ative o GitHub Pages**: Settings → Pages → Source: "Deploy from a
   branch" → Branch `main`, pasta `/ (root)` → Save
4. Confirme que a raiz do repositório tem: `index.html`, `manifest.json`,
   `service-worker.js`, `README.md`, e as pastas `css/`, `js/`, `icons/`

## Como instalar como app no celular

- **Android (Chrome)**: abra o link, toque nos 3 pontinhos → "Instalar app"
  (ou "Adicionar à tela inicial")
- **iPhone (Safari)**: abra o link, toque no ícone de compartilhar →
  "Adicionar à Tela de Início"

Depois disso, o Velo abre como um app de verdade, com ícone próprio e sem a
barra do navegador.

## Como entrar pela primeira vez

Toque em **"Criar novo perfil"**, escolha nome, papel, cor e uma senha
(a renda mensal é opcional — só é usada para o "Podemos gastar?"). Depois é
só entrar com nome + senha.

## Sobre o Supabase (já configurado)

- Projeto: `financas` (região us-west-2) —
  `https://tncnjtjbbvjrzleqsucf.supabase.co`
- A chave em `js/config.js` é a **anon/public key** — normal e seguro
  aparecer no front-end; a segurança fica com **RLS** e funções
  `security definer` para login e senhas.
- Senhas com hash `bcrypt`, coluna bloqueada até para leitura pelo app.

⚠️ Continua sendo um app privado (RLS aberto entre os dois perfis) —
pensado para uso entre vocês dois, não para publicar numa loja de apps.

## O que ficou para uma próxima rodada (por pedir mais infraestrutura)

- Sincronia offline de verdade (criar tarefa sem internet e sincronizar
  depois) — o Service Worker atual só acelera a abertura do app, não guarda
  ações pendentes ainda
- Notificações push reais (alerta no celular com o app fechado) — precisa
  de um servidor por trás
- Divisão automática de cada despesa proporcional à renda de cada um
- Editar tarefas/despesas já criadas (hoje só dá pra criar ou apagar)

## Estrutura de arquivos

```
shared-calm/
├── index.html
├── manifest.json         → configuração do PWA
├── service-worker.js     → cache do "esqueleto" do app
├── icons/                → ícones do app (192, 512, apple-touch)
├── css/style.css
├── js/config.js
├── js/app.js
└── README.md
```
