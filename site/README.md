# Fabrika Okulu

Kariyer gelişimi programları için online eğitim platformu — site + öğrenci paneli + eğitmen paneli + yönetim paneli.

- Kurulum ve kurallar: `CLAUDE.md`
- Yayına alma (Easypanel): `DEPLOY.md`

```
docker compose -p fabrikaokulu up -d
cp .env.example .env
npm install
npm run db:migrate && npm run db:seed
npm run dev
```
