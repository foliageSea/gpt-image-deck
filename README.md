# Image Deck

Image Deck is an Electron desktop client for GPT Image 2, built with Vue 3, TypeScript, Tailwind CSS 4, and shadcn-vue.

## Features

- Generate images from text with `gpt-image-2`
- Edit images with up to 16 reference files
- Configure size, quality, format, compression, background, and input fidelity
- Connect to OpenAI or a compatible custom Base URL
- Encrypt the API key with Electron `safeStorage`
- Persist generated assets and history locally
- Preview, export, reuse, reveal, and delete generated assets

## Development

```bash
pnpm install
pnpm dev
```

The app asks for an API key on first launch. OpenAI credentials are handled by the Electron main process and are not exposed to the renderer.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Packaging

```bash
pnpm build:mac
pnpm build:win
pnpm build:linux
```
