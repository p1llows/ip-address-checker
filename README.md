# IP Address Checker

A small standalone web app that shows your current public IP address with one click. Built with React, Vite and TypeScript. There is no backend and no database. The browser calls [ipify](https://www.ipify.org/) directly, and nothing is stored (no localStorage, cookies or analytics).

## Requirements

- Node.js 18 or later

## Setup and development

```bash
npm install
npm run dev      # http://localhost:5173
```

## Test and build

```bash
npm test         # unit tests for the IP lookup service
npm run build    # type-checks, then outputs static files to dist/
npm run preview  # serve the production build locally
```

## Project structure

```text
src/
├── components/
│   ├── IpAddressDisplay.tsx   # shows the IP or a placeholder
│   └── CopyButton.tsx         # clipboard copy with confirmation
├── services/
│   ├── ipService.ts           # ipify call, timeout, error handling, validation
│   └── ipService.test.ts
├── App.tsx                    # state and layout
├── main.tsx
└── index.css
```

## Deployment

The build output (`dist/`) is plain static files, so any static host works.

### Vercel

1. Push this folder to a Git repository, then import it at <https://vercel.com/new>.
2. Vercel detects Vite automatically (build command `npm run build`, output directory `dist`).
3. Deploy, then open the generated `*.vercel.app` URL.

Or use the CLI:

```bash
npx vercel          # first run: log in and link the project
npx vercel --prod
```

### Cloudflare Pages

1. Create a Pages project from your Git repository.
2. Build command: `npm run build`. Output directory: `dist`.

Or use the CLI:

```bash
npm run build
npx wrangler pages deploy dist
```

### Verify after deploying

Open the public URL, click **Check My IP Address**, and confirm that the IP shown matches what you get from another source. Ask a colleague to do the same from their own network.

## Notes

- `package.json` has an `overrides` entry that replaces Rollup's native binary with its WebAssembly build (`@rollup/wasm-node`). It was added because Windows App Control blocked the native `.node` file on the development machine. You can remove the override on machines where the native binary loads. It works either way.
- Ad blockers or restrictive corporate networks may block `api.ipify.org`. The app then shows an error with a Retry button.
