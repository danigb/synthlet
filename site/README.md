# site

This is a Next.js application generated with
[Create Fumadocs](https://github.com/fuma-nama/fumadocs).

## Two sections

The site serves two fumadocs collections, declared side by side in
`source.config.ts` and loaded separately:

| Section           | Content         | Loader                | Routes         |
| ----------------- | --------------- | --------------------- | -------------- |
| Documentation     | `content/docs`  | `app/source.ts`       | `app/docs/**`  |
| Learning Synthlet | `content/learn` | `app/learn-source.ts` | `app/learn/**` |

They share the root layout, the theme provider, the search and
`app/audio-context.ts`; nothing else is duplicated.

The tutorial's chapters are plain folders — `content/learn/sound/…` is served at
`/learn/sound/…`. They must not be route groups: `fumadocs-core` drops a
`(group)` segment from the slug, which is why thirty `/docs/…` links 404 today.

`npm run check:links` reads the export in `out/` and fails if any `/learn/` link
points at a page that was not built. Run it after `deploy:build`.

The site is installed with `npm ci` and `site/package-lock.json` is its
lockfile. It is deliberately outside the root npm workspace, which is why it has
one of its own; there is no pnpm lockfile, and re-creating one would give a tree
with no test runner in it (02b).

Run development server:

```bash
npm run dev
```

Open http://localhost:3000 with your browser to see the result.

## Learn More

To learn more about Next.js and Fumadocs, take a look at the following
resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js
  features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [Fumadocs](https://fumadocs.vercel.app) - learn about Fumadocs
