# AGENT.md - Reglas para Agentes de Código

Este archivo define las reglas y convenciones que los agentes de código deben seguir al trabajar en el proyecto **Cukies Hub**.

## 🚨 Reglas Críticas

### Gestor de Paquetes
- **SIEMPRE usar `pnpm`**, nunca `npm` ni `yarn`
- Comandos de instalación: `pnpm install`, `pnpm add <package>`
- Los juegos y paquetes se manejan con `pnpm --filter <workspace>`

### Estructura del Monorepo
```
cukies-hub/
├── dapp/              # App principal Next.js (puerto 3000)
├── games/
│   ├── sybil-slayer/  # Juego Token Runner (puerto 9002)
│   ├── hyppie-road/   # Juego Hyppie Road (puerto 9003)
│   └── tower-builder/ # Juego Tower Builder
├── packages/
│   └── game-bridge/   # Paquete compartido @hyppie/game-bridge
└── pnpm-workspace.yaml
```

---

## 🛠️ Comandos de Desarrollo

### Antes de hacer cambios
```bash
# Verificar tipos en el workspace afectado
pnpm dapp typecheck         # Para dapp
pnpm sybil-slayer typecheck # Para sybil-slayer
pnpm --filter hyppie-road typecheck
pnpm --filter tower-builder typecheck
```

### Después de hacer cambios
```bash
# Siempre ejecutar lint y typecheck antes de finalizar
pnpm dapp lint && pnpm dapp typecheck
pnpm sybil-slayer lint && pnpm sybil-slayer typecheck
```

### Base de Datos (solo dapp)
```bash
# Después de modificar prisma/schema.prisma
cd dapp
pnpm prisma generate  # Regenerar cliente
pnpm prisma db push   # Aplicar cambios a MongoDB
```

---

## 🎮 Comunicación Dapp ↔ Juegos

### Pusher (WebSockets)
- La comunicación en tiempo real usa **Pusher**
- Canal: `private-game-session-{sessionId}`
- Eventos clave:
  - `client-game-ready`: Juego listo
  - `client-checkpoint`: Checkpoint del juego
  - `client-game-end`: Fin de partida
  - `client-dapp-ready`: Dapp listo

### Variables de Entorno Críticas
```env
# Dapp (.env.local)
NEXT_PUBLIC_PUSHER_KEY=xxx
NEXT_PUBLIC_PUSHER_CLUSTER=us2
PUSHER_APP_ID=xxx
PUSHER_SECRET=xxx

# Juegos (.env.local)
NEXT_PUBLIC_PUSHER_KEY=xxx
NEXT_PUBLIC_PUSHER_CLUSTER=us2
NEXT_PUBLIC_PARENT_URL=http://localhost:3000
```

### Fallback HTTP
- Si Pusher falla, hay endpoints HTTP de respaldo:
  - `POST /api/games/checkpoint` - Guardar checkpoint
  - `POST /api/games/end-session` - Terminar sesión

---

## 📁 Convenciones de Archivos

### Dapp (Next.js 15 App Router)
- **Páginas**: `src/app/[page]/page.tsx`
- **APIs**: `src/app/api/[resource]/route.ts`
- **Componentes**: `src/components/[category]/[component].tsx`
- **Hooks**: `src/hooks/use[Name].ts`
- **Tipos**: `src/types/[resource].ts`
- **Utilidades**: `src/lib/[util].ts`

### Juegos
- **Lógica principal**: `src/hooks/useGameState.ts`
- **Conexión**: `src/hooks/useGameConnection.ts`
- **Pusher**: `src/hooks/usePusherConnection.ts`
- **Componentes de juego**: `src/components/`

---

## 🔒 Seguridad

### Autenticación
- NextAuth v5 con Discord/Twitter OAuth
- Las sesiones de juego requieren `sessionToken` validado
- Nunca exponer `PUSHER_SECRET` en el cliente (solo `NEXT_PUBLIC_PUSHER_KEY`)

### API Endpoints
- Validar siempre `sessionToken` en endpoints de juego
- Usar `auth()` de NextAuth para endpoints que requieren usuario
- Los webhooks externos van en `/api/webhooks/`

---

## 🧪 Testing

### Dapp
```bash
pnpm dapp test              # Ejecutar todos los tests
pnpm dapp test:watch        # Modo watch
pnpm dapp test:coverage     # Con cobertura
```

### Estructura de Tests
```
dapp/__tests__/
├── api/           # Tests de API routes
├── components/    # Tests de componentes
├── hooks/         # Tests de hooks
└── lib/           # Tests de utilidades
```

---

## 🗃️ Base de Datos (MongoDB + Prisma)

### Modelos Principales
- `User`: Usuarios con wallet, XP, referrals
- `GameSession`: Sesiones de juego activas
- `GameCheckpoint`: Puntos de control durante el juego
- `GameResult`: Resultados finales
- `Quest`/`Task`: Sistema de quests
- `ChatRoom`/`ChatMessage`: Sistema de chat

### Convenciones
- IDs son `@id @default(auto()) @map("_id") @db.ObjectId`
- Relaciones usan `@db.ObjectId`
- Siempre incluir `createdAt` y `updatedAt`

---

## 🎨 Diseño

### Paleta de Colores
- **Primary**: Teal (#008080)
- **Background**: Dark gray (#253533)
- **Accent**: Neon green (#44edd6)
- Referencia: https://cukiesworld.com/

### Tipografía
- **Headlines**: 'Space Grotesk'
- **Body**: 'Inter'

### Componentes UI
- Radix UI primitives con estilos custom
- Tailwind CSS para estilos

---

## ⚠️ Errores Comunes a Evitar

1. **No usar `npm`** - Solo `pnpm`
2. **No olvidar `pnpm prisma generate`** después de cambiar schema
3. **No exponer secretos** en variables `NEXT_PUBLIC_*`
4. **Siempre ejecutar typecheck** antes de terminar
5. **No modificar un juego** sin probar que la comunicación con dapp funciona
6. **Verificar CORS** en Pusher si hay errores de conexión

---

## 📚 Documentación Adicional

- `CLAUDE.md` - Guía completa del proyecto
- `PUSHER_SETUP.md` - Configuración de Pusher
- `PUSHER_MIGRATION.md` - Migración a Pusher
- `dapp/TESTING.md` - Documentación de tests
- `dapp/docs/` - Documentación adicional de la dapp

---

## 🔄 Workflow con Issues de GitHub

1. Crear branch: `fix/issue-123` o `feature/issue-456`
2. Hacer cambios y commits
3. Ejecutar lint y typecheck
4. Push del branch
5. Comentar en el issue con:
   - Que está resuelto
   - Nombre del branch
   - Resumen de cambios
