# Maringa: Core App Server & Event Gateway (NestJS Backend)

This is the core command-processing and ledger orchestration service for Maringa. It exposes REST APIs for organizational onboarding, programmable wallets, invoicing, and escrow management, and propagates real-time financial updates to the dashboard via WebSockets.

---

## 🏗️ System Architecture & Data Flow

The backend employs a database-backed double-entry ledger that guarantees accounting invariants, paired with a command idempotency lock system.

```mermaid
sequenceDiagram
    participant User as Merchant / Customer
    participant Frontend as Next.js Dashboard
    participant Backend as NestJS App Server
    participant Database as PostgreSQL (TypeORM)
    participant Redis as Redis Cache
    participant EventBus as RabbitMQ Event Bus
    participant Stellar as Stellar Network (Soroban RPC)

    User->>Frontend: Trigger action (e.g. Settle Invoice / Fund Escrow)
    Frontend->>Backend: POST /v1/... with X-Idempotency-Key
    Backend->>Database: Check & acquire idempotency lock
    alt Idempotency Key is Cached
        Database-->>Backend: Return cached response
        Backend-->>Frontend: Return cached response
    else Key is New
        Backend->>Database: Query state
        alt Blockchain Settlement Required (USDC)
            Backend->>Stellar: Submit Soroban Transaction (distribute / lock)
            Stellar-->>Backend: Return Tx Hash & Ledger sequence
        end
        Backend->>Database: Start Transaction: post journal entries & update wallet balances
        Database-->>Backend: Commit successful
        Backend->>EventBus: Publish event (e.g., payments.intent.settled)
        Backend->>Database: Save response & mark Completed
        Backend-->>Frontend: Return HTTP 201 Success
        EventBus-->>Frontend: Real-time broadcast via Websockets (events.gateway)
    end
```

---

## 🗄️ Relational Database Schema (TypeORM + PostgreSQL)

We use **TypeORM** as the ORM to manage connections and run transactions in PostgreSQL:

*   **Organizations (`organizations`):** Core merchant/legal entities.
*   **Members (`members`):** Authorized users mapped to organizations.
*   **Wallets (`wallets`):** Accounts holding multi-currency balances (USDC, NGN, KES) stored dynamically in `jsonb` columns.
*   **Accounts (`accounts`):** Ledger accounts (Assets, Liabilities, Equity).
*   **Journal Entries & Transaction Lines (`journal_entries`, `transaction_lines`):** Balanced, immutable double-entry records.
*   **Payment Intents (`payment_intents`):** Inbound merchant payments tracking.
*   **Invoices (`invoices`):** Stateful billing objects carrying split routing commands.
*   **Escrows (`escrows`):** Off-chain mirrors of deployed Stellar/Soroban contracts.
*   **Idempotency Keys (`idempotency_keys`):** Anti-replay database cache.

---

## 🚀 Running Locally

### 1. Prerequisites
Ensure the root infrastructure is active (Postgres, Redis, RabbitMQ, Stellar RPC):
```bash
npm run docker:up --prefix ../
```

### 2. Configure Environment
Create a `.env` file from the example:
```bash
cp .env.example .env
```

### 3. Start Development Server
```bash
npm install
npm run start:dev
```
The server will bind to port `3001` with CORS enabled.

---

## 🧪 CI/CD Workflow

The project's GitHub Actions workflow is located at [.github/workflows/ci.yml](file:///home/samuel/works/waves/maringa/backend/.github/workflows/ci.yml). On every push or pull request to the `main` branch, it runs:
1.  **Code Checkout**
2.  **Node.js Environment Setup**
3.  **Dependencies Installation** (`npm ci`)
4.  **Lint checks**
5.  **NestJS Compilation Check** (`npm run build`)
