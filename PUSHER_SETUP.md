# 🚀 Pusher WebSocket Setup Guide

Esta guía te ayudará a configurar Pusher para la comunicación en tiempo real entre la Dapp y los juegos.

## 📋 Prerrequisitos

1. **Cuenta de Pusher**: Crea una cuenta gratuita en [pusher.com](https://pusher.com)
2. **App de Pusher**: Crea una nueva app en el [Dashboard de Pusher](https://dashboard.pusher.com)

## 🔧 Configuración de Pusher

### 1. Crear App en Pusher Dashboard

1. Ve a [dashboard.pusher.com](https://dashboard.pusher.com)
2. Click "Create app"
3. Configura:
   - **App name**: `hyppie-gaming`
   - **Cluster**: `us2` (o el más cercano a tus usuarios)
   - **Front-end tech**: `React`
   - **Back-end tech**: `Node.js`

### 2. Configurar App Settings

En el Dashboard de Pusher:

1. Ve a **App Settings**
2. Habilita **"Enable client events"** ✅
3. En **"Allowed origins"** agrega:
   ```
   http://localhost:3000
   http://localhost:9002
   http://localhost:9003
   https://cukiesworld.com
   https://*.vercel.app
   ```

### 3. Obtener Credenciales

En **App Keys** encontrarás:
- `app_id`
- `key` 
- `secret`
- `cluster`

## 🔐 Variables de Entorno

### Dapp (.env.local)

```env
# Pusher Configuration
NEXT_PUBLIC_PUSHER_KEY=your_pusher_app_key
NEXT_PUBLIC_PUSHER_CLUSTER=us2
PUSHER_APP_ID=your_pusher_app_id
PUSHER_KEY=your_pusher_app_key
PUSHER_SECRET=your_pusher_app_secret  
PUSHER_CLUSTER=us2
```

### Sybil Slayer (.env.local)

```env
# Pusher Configuration
NEXT_PUBLIC_PUSHER_KEY=your_pusher_app_key
NEXT_PUBLIC_PUSHER_CLUSTER=us2
NEXT_PUBLIC_PARENT_URL=http://localhost:3000
```

## 🧪 Testing

### 1. Test Server Connection

```bash
cd dapp
node -r ts-node/register scripts/test-pusher-connection.ts
```

### 2. Test Client Connection

1. Abre la dapp: `http://localhost:3000`
2. Navega a Sybil Slayer
3. Abre DevTools Console
4. Busca logs de Pusher: `🔗 [PUSHER]`

### 3. Test Live Communication

1. Abre 2 pestañas: Dapp y Dashboard de Pusher
2. En el Dashboard, ve a **Debug Console**  
3. Juega Sybil Slayer y observa eventos en tiempo real

## 📊 Arquitectura

```
[Dapp Client] <--WebSockets--> [Pusher Cloud] <--WebSockets--> [Game Client]
     |                                                              |
     v                                                              v
[Dapp API]                                                    [Game Logic]
```

### Canales Pusher:

- **`private-game-session-{sessionId}`**: Canal privado por cada sesión
- **Eventos**:
  - `client-game-ready`: Juego listo
  - `client-checkpoint`: Checkpoint del juego  
  - `client-game-end`: Fin de partida
  - `client-dapp-ready`: Dapp listo

## 🔍 Debugging

### Logs Útiles:

```javascript
// En Dapp
console.log('🔗 [PUSHER] Connected to Pusher');
console.log('📤 [PUSHER] Event sent: checkpoint');

// En Game  
console.log('🎮 [GAME-PUSHER] Connected to Pusher');
console.log('📤 [GAME-PUSHER] Checkpoint sent');
```

### Pusher Dashboard:

1. **Debug Console**: Ver eventos en tiempo real
2. **Event Creator**: Enviar eventos de prueba
3. **Connection Inspector**: Ver conexiones activas

## 🚨 Troubleshooting

### "Subscription failed"
- ✅ Verificar que `/api/pusher/auth` existe
- ✅ Verificar que el usuario está autenticado
- ✅ Verificar permisos del canal

### "Connection error"  
- ✅ Verificar variables de entorno
- ✅ Verificar CORS settings en Pusher
- ✅ Verificar que el cluster es correcto

### "Events not received"
- ✅ Verificar que ambos clientes están suscritos al mismo canal
- ✅ Verificar logs en ambos extremos
- ✅ Usar Debug Console para verificar eventos

## 📚 Recursos

- [Pusher Docs](https://pusher.com/docs)
- [React Integration](https://pusher.com/docs/channels/using_channels/react-hooks)
- [Troubleshooting Guide](https://pusher.com/docs/channels/using_channels/troubleshooting)

## 🎯 Free Tier Limits

- **200k mensajes/día**
- **100 conexiones concurrentes**
- **Unlimited canales**

¡Suficiente para desarrollo y testing! 🚀