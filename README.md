# Malewa-Fac Backend

Node.js + TypeScript + Express + Prisma + MySQL, aligné avec la documentation technique.

## Prérequis
- Node.js 18+
- Docker (pour MySQL via docker-compose) ou un MySQL 8 existant

## Démarrage rapide

1. Copier la config d'environnement et l'ajuster si besoin:
   ```bash
   cp .env.example .env
   ```
2. Lancer MySQL (Docker):
   ```bash
   docker compose up -d db
   ```
3. Installer les dépendances:
   ```bash
   npm install
   ```
4. Générer le client Prisma:
   ```bash
   npm run prisma:generate
   ```
5. Lancer les migrations (dev):
   ```bash
   npm run prisma:migrate
   ```
6. Seed de données (institutions, restaurants, plats, settings, utilisateurs démo):
   ```bash
   npm run seed
   ```
7. Démarrer le serveur en dev:
   ```bash
   npm run dev
   ```

Le backend écoute par défaut sur http://localhost:4000

## Endpoints inclus (MVP)
- `GET /health` → statut service
- `GET /api/v1/institutions` → liste
- `GET /api/v1/restaurants?institutionCode=unikin` → liste
- `GET /api/v1/restaurants/:id/dishes` → plats disponibles
- `GET /api/v1/pricing/delivery?method=campus|offcampus&km=5` → frais
- `POST /api/v1/orders` → créer une commande

### Exemple `POST /api/v1/orders`
```json
{
  "customerName": "Étudiant(e) Démo",
  "restaurantId": 1,
  "items": [ { "dishId": 1, "qty": 2 } ],
  "deliveryMethod": "campus",
  "paymentMethod": "mobile",
  "address": "UNIKIN - Auditoire 12"
}
```

Réponse (extrait):
```json
{
  "id": 1,
  "code": "MF-2025-1234",
  "subtotal": 6000,
  "serviceFee": 1000,
  "deliveryFee": 2000,
  "total": 9000,
  "status": "received",
  "createdAt": "...",
  "items": [ ... ]
}
```

## Prochaines étapes (selon doc)
- AuthN/AuthZ JWT, RBAC
- Flux commandes marchand (statuts), missions livreur, paiements, transactions, admin
- Swagger/OpenAPI, tests (Jest + Supertest), Socket.IO (optionnel)
