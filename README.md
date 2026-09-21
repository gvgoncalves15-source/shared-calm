# Velo — Seu dinheiro em movimento

Desenvolvido por **Gabriel Gonçalves**.

App web responsivo (mobile-first) e instalável (PWA), para qualquer casal ou
dupla organizar rotina e finanças em conjunto — feito para múltiplos usuários
de verdade, não só para um casal fixo. Feito em **HTML + CSS (Tailwind) +
JavaScript puro**, com dados salvos no **Supabase**.

## ⚠️ Se aparecer "Erro ao conectar ao Supabase" / "Failed to fetch"

O projeto Supabase do plano gratuito pausa sozinho depois de um tempo sem uso.
Acesse https://supabase.com/dashboard, abra o projeto **financas** e clique em
"Restore project" (ou "Unpause"). Leva 1-2 minutos para voltar.

## Arquitetura (a partir desta versão)

- ✅ **Login real por e-mail**, com o sistema de autenticação do próprio
  Supabase (Supabase Auth) — sem gambiarra caseira
- ✅ **Cada conta pertence a um "lar"** isolado — os dados de um casal nunca
  ficam visíveis para outro, garantido por Row Level Security no banco (não
  só pela interface)
- ✅ **Vínculo por link de convite**: em Perfil → Vincular Conta, a aba
  "Meu Link" mostra seu link para compartilhar; a aba "Vincular com um Link"
  recebe o link/código de quem te convidou
- ✅ **Recuperação de senha de verdade**, por e-mail
- ✅ Todas as funcionalidades anteriores continuam: Rotina semanal com
  horários e gráfico de concluídas/falhas, Finanças com entrada/saída reais,
  "Podemos gastar?", Despesas Fixas, Metas, Nosso Espaço, Resumo do Mês,
  identidade visual dourado + grafite

## Como criar sua conta

1. Na tela inicial, toque em **"Criar nova conta"**
2. Preencha nome, e-mail e senha
3. Se o seu par já te mandou um link de convite, é só abrir esse link antes
   de se cadastrar — o app já detecta e vincula automaticamente depois que
   você criar a conta
4. Se não, depois de entrar vá em **Perfil → Vincular Conta → Meu Link** e
   mande o link para a outra pessoa

## Passo a passo para publicar no GitHub Pages

1. Apague **tudo** que está no repositório
2. Extraia o zip, selecione tudo com Ctrl+A (incluindo as pastas `css/`,
   `js/` e `icons/` inteiras) e arraste junto em "Add file" → "Upload files"
3. Settings → Pages → Source: "Deploy from a branch" → `main` / `/ (root)`

⚠️ **Nunca suba arquivo por arquivo separadamente.**

## Sobre o Supabase

- Projeto: `financas` — `https://tncnjtjbbvjrzleqsucf.supabase.co`
- A chave em `js/config.js` é a **anon/public key** — normal ficar exposta;
  a segurança real está no RLS por lar e no Supabase Auth
- Tabelas: `households`, `profiles` (1:1 com `auth.users`), `routine_tasks`,
  `finance_transactions`, `finance_goals`, `fixed_expenses`,
  `fixed_expense_installments`, `nudges` — todas isoladas por `household_id`

## O que ficou para uma próxima rodada

- Sincronia offline de verdade (criar algo sem internet e sincronizar depois)
- Notificações push reais (precisa de servidor por trás)
- Divisão automática de cada despesa proporcional à renda de cada um

## Estrutura de arquivos

```
shared-calm/
├── index.html
├── manifest.json
├── service-worker.js
├── icons/
├── css/style.css
├── js/config.js
├── js/app.js
└── README.md
```
