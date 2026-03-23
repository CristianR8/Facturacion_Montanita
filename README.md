# La Montanita Invoicer

Dummy desktop invoicing app scaffold built with Electron, Vite, React, Tailwind, and PostgreSQL hooks.

## What is included

- Windows-oriented Electron desktop shell
- Vite + React renderer with a polished invoice dashboard
- Tailwind-based styling
- PostgreSQL schema bootstrap for company profile, invoices, and invoice items
- Demo thermal receipt formatter
- Electron Builder config for Windows packaging

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configura PostgreSQL copiando `.env.example` a `.env` y editando `DATABASE_URL`.

3. Inicia la app:

   ```bash
   npm run dev
   ```

4. Compila el renderer:

   ```bash
   npm run build
   ```

5. Empaqueta para Windows:

   ```bash
   npm run dist
   ```

## PostgreSQL notes

- La app ahora requiere `DATABASE_URL`.
- Si falta la variable o PostgreSQL no responde, la app mostrara el error y no guardara nada.
- Al iniciar, la app crea automaticamente las tablas necesarias si no existen.
- La implementacion actual de impresion termica es un stub en `electron/printer.js`; reemplazala con tu integracion real ESC/POS o con el driver de Windows.
