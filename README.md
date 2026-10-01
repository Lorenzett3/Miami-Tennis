<h1 align="center">🎾 Miami Tennis</h1>

<p align="center">
  <strong>v0.1.0 · Protótipo funcional</strong><br />
  Reserva de quadras de tênis de forma simples.
</p>

<p align="center">
  React · Vite · Node.js · Express · SQLite
</p>

---

## Objetivo

Desenvolver uma aplicação em que o cliente possa criar sua conta, consultar os horários disponíveis e reservar uma quadra de tênis. O projeto utiliza uma arquitetura com frontend, API e banco de dados, com foco na simplicidade de uso e de configuração do ambiente.

O Miami Tennis é um projeto acadêmico para a disciplina de **Arquiteturas de Renderização & Setup Ambientes**. Esta primeira versão concentra o desenvolvimento no fluxo do cliente: cadastro, login, consulta da agenda e reserva.

> **Estágio atual:** o fluxo básico do cliente está implementado. A aplicação está na fase de protótipo, com o módulo administrativo planejado para uma próxima etapa.

## Andamento do desenvolvimento

### Implementado no protótipo

- [x] Cadastro orgânico: o próprio cliente cria sua conta com nome, e-mail e senha.
- [x] Login com autorização por Bearer Token e encerramento de sessão.
- [x] Quadras e horários cadastrados automaticamente no banco.
- [x] Consulta de horários disponíveis por quadra e semana.
- [x] Confirmação de reserva vinculada ao cliente autenticado.
- [x] Bloqueio de horários passados e de reservas duplicadas.
- [x] Dashboard semanal do cliente, com horários livres e ocupados.
- [x] Lista das próximas reservas do cliente.
- [x] Testes básicos de integração da API.

### Próxima etapa: módulo administrativo

- [ ] Criar uma conta de administrador.
- [ ] Diferenciar as permissões de cliente e administrador no backend.
- [ ] Desenvolver um dashboard administrativo para acompanhar as reservas de todos os clientes e a ocupação das quadras.

Atualmente, todas as contas possuem o perfil de cliente. **O dashboard disponível é a agenda do cliente; a conta e o dashboard de administrador ainda não foram implementados.**

## Dificuldades e pontos de atenção

| Ponto | Situação no desenvolvimento |
| --- | --- |
| Evitar reservas duplicadas | O banco possui uma restrição que impede duas reservas para a mesma quadra, data e horário, inclusive em pedidos simultâneos. |
| Validar datas e horários | A API recusa datas inválidas e períodos que já começaram. A agenda utiliza o horário de Brasília. |
| Integrar frontend, API e banco | O React envia as requisições para o Express, que valida e grava os dados no SQLite. A integração básica está funcionando. |
| Separar permissões de acesso | Pendente: a autenticação atual identifica o cliente, mas ainda não existe um perfil de administrador. |
| Criar a visão administrativa | Pendente: falta uma tela de administração para acompanhar as reservas de todos os clientes. |

A próxima etapa será definir as permissões do administrador e implementar o painel correspondente. Por enquanto, as quadras e os horários são inseridos diretamente no banco, conforme permitido no enunciado.

## Tecnologias e arquitetura

| Tecnologia | Papel no projeto |
| --- | --- |
| React | Interface de cadastro, login e reserva |
| Vite | Ambiente de desenvolvimento e compilação do frontend |
| Node.js + Express | API, autenticação e regras de negócio |
| SQLite | Banco relacional armazenado em um arquivo local |

O frontend utiliza **renderização no cliente (CSR)**: o navegador carrega o React, consulta a API e renderiza a interface com os dados recebidos.

```text
React (navegador) → API Express → SQLite (arquivo local)
```

## Como executar

Instale o **Node.js 24 ou superior**. Não precisa configurar um servidor de banco de dados.

```sh
npm install
npm run dev
```

Abra **http://localhost:5173**. A API roda na porta 3001; o Vite encaminha as chamadas `/api` para ela.

Se o PowerShell bloquear `npm.ps1`, use `npm.cmd install` e `npm.cmd run dev`.

1. Clique em **Criar conta** e cadastre nome, e-mail e senha de pelo menos 6 caracteres.
2. Selecione a quadra e a semana na agenda.
3. Clique em um horário **Disponível** e confirme.
4. O horário aparece como **Sua reserva** e na lista de próximas reservas. Outros clientes veem **Reservado**.

Não há contas nem reservas de demonstração: o cadastro é feito pelo próprio cliente.

## Regras do protótipo

| Regra | Definição |
| --- | --- |
| Quadras | Quadra 1 (saibro) e Quadra 2 (piso rápido) |
| Funcionamento | Todos os dias, das 08h às 22h |
| Duração da reserva | Períodos fixos de 1 hora |
| Agenda semanal | De segunda-feira a domingo, com navegação entre semanas |
| Fuso horário | Brasília (`America/Sao_Paulo`) |
| Sessão | Token válido por 7 dias; o logout invalida a sessão atual |

Horários que já começaram não aceitam novas reservas. Cada reserva ocupa um período completo; início e fim vêm do horário escolhido. Pagamentos não fazem parte do escopo atual.

## Banco de dados

O arquivo **`data/miami-tennis.db`** é criado na primeira inicialização e preserva os dados entre execuções. Não é versionado e dispensa a instalação de um servidor de banco de dados.

| Tabela | Responsabilidade |
| --- | --- |
| `clients` | Clientes cadastrados e hash das senhas |
| `sessions` | Sessões de acesso e validade dos tokens |
| `courts` | Quadras disponíveis |
| `time_slots` | Períodos com horário de início e fim |
| `reservations` | Reservas vinculadas a cliente, quadra, período e data |

As senhas usam hash **scrypt** com salt aleatório. Os tokens são aleatórios e apenas seu hash fica no banco; o navegador guarda o token no `localStorage`. A restrição `UNIQUE (court_id, date, slot_id)` impede reservas simultâneas para o mesmo período.

## Estrutura do projeto

```text
Miami-Tennis/
├── src/
│   ├── main.jsx         # Inicialização do React
│   ├── App.jsx          # Cadastro, login, agenda e reserva
│   └── styles.css       # Estilos e adaptação para celular
├── server/
│   ├── index.js         # Inicialização do servidor
│   ├── app.js           # API, autenticação e regras de reserva
│   ├── db.js            # Tabelas e dados iniciais
│   └── app.test.js      # Testes de integração
├── public/              # Arquivos estáticos
├── data/                # Banco criado automaticamente, ignorado pelo Git
├── package.json         # Dependências e comandos
└── vite.config.js       # Configuração do frontend
```

## Caso de uso: criar reserva

| Elemento | Descrição |
| --- | --- |
| Ator | Cliente autenticado |
| Objetivo | Reservar uma quadra em determinado período |
| Pré-condições | Cliente cadastrado e autenticado; quadra e horário existentes |
| Entrada | Cliente identificado pelo token, quadra, data e horário com início/fim |
| Fluxo principal | Validar → verificar disponibilidade → criar e registrar → atualizar a agenda |
| Cliente inexistente/não autenticado | Recusa o token e solicita login (401) |
| Quadra inexistente | Recusa a reserva (404) |
| Período inválido | Data inválida, horário inexistente ou já iniciado são recusados (400) |
| Quadra indisponível | Recusa um período já reservado (409) |
| Pós-condição | Nova reserva registrada e mostrada na agenda |

## API

| Método | Rota | Uso |
| --- | --- | --- |
| POST | `/api/register` | Cadastro: `{ name, email, password }`; retorna cliente e token |
| POST | `/api/login` | Login: `{ email, password }`; retorna cliente e token |
| GET | `/api/me` | Cliente autenticado |
| POST | `/api/logout` | Encerra a sessão atual |
| GET | `/api/week?date=2026-10-01` | Agenda da semana que contém a data |
| POST | `/api/reservations` | Reserva: `{ courtId, slotId, date }` |
| GET | `/api/reservations` | Próximas reservas do cliente |

Todas as rotas, exceto cadastro e login, exigem `Authorization: Bearer <token>`.

## Verificação e versão compilada

```sh
npm test
npm run build
npm start
```

Após o build, abra **http://localhost:3001**: frontend e API são servidos juntos. Os testes usam bancos separados e verificam cadastro, login, autorização, expiração, logout, agenda, períodos inválidos, concorrência e persistência.

## Referências

- [Documentação do Vite](https://vite.dev/guide/)
- [SQLite no Node.js](https://nodejs.org/api/sqlite.html)
