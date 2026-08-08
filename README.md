# GreenVest – Fresh groceries

A demo grocery storefront with customer shopping, seller tools, and admin user management. Data persists in the browser via `localStorage`.

## Run locally

```bash
npm install
npm run dev -- --port 3000 --host
```

Open [http://localhost:3000](http://localhost:3000).

## Demo logins

| Role     | Email              | Password |
|----------|--------------------|----------|
| Customer | `customer@demo.com`| `demo123`|
| Seller   | `seller@demo.com`  | `demo123`|
| Admin    | `admin@demo.com`   | `demo123`|

## Features

- Shop by grade (A / B / C) and category
- Cart, 50% advance checkout with UTR
- Customer order history
- Seller dashboard, product CRUD, order status
- Admin seller promote / revoke
- English / Bangla language toggle
