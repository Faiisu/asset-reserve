import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL;

export default {
  schema: "prisma",
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
  migrations: {
    path: "prisma/migrations",
  },
};
