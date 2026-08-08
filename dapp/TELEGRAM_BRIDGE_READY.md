# 🎉 Telegram Bridge - LISTO PARA USAR

## ✅ Estado Actual
El bridge de Telegram está **completamente funcional** y configurado:

### 📋 Configuración Actual:
- **Sybil Slayer Chat** → Topic ID: `1532`
- **Hyppie Road Chat** → Topic ID: `4`  
- **Tower Builder Chat** → Topic ID: `1532`

### 🔧 Funcionalidades Implementadas:
- ✅ **Web → Telegram**: Los mensajes del chat web se envían automáticamente a Telegram
- ✅ **Telegram → Web**: Los mensajes de Telegram se sincronizan con el chat web
- ✅ **Topics del Forum**: Mapeo correcto de juegos a topics específicos
- ✅ **Tiempo real**: Polling cada 2-3 segundos para sincronización
- ✅ **Base de datos**: Persistencia de mensajes de ambas direcciones

## 🚀 Para Activar el Bridge Completo:

### 1. Iniciar el servidor de desarrollo:
```bash
cd dapp
pnpm dev
```

### 2. Activar sincronización automática (opcional):
```bash
curl -X POST http://localhost:3000/api/chat/auto-sync \
  -H "Content-Type: application/json" \
  -d '{"action": "start", "intervalSeconds": 15}'
```

### 3. Verificar estado:
```bash
curl http://localhost:3000/api/chat/auto-sync
```

### 4. Sincronización manual (si necesario):
```bash
curl -X POST http://localhost:3000/api/chat/sync-telegram
```

## 💬 Cómo Probar:

### Desde la Web:
1. Abre cualquier juego (sybil-slayer, hyppie-road, tower-builder)
2. Abre el chat del juego
3. Envía un mensaje
4. ✅ **Debería aparecer automáticamente en el topic correspondiente de Telegram**

### Desde Telegram:
1. Ve al grupo "Cukies World ☮️"
2. Envía un mensaje en el topic correspondiente:
   - Topic 1532 → Sybil Slayer / Tower Builder
   - Topic 4 → Hyppie Road
3. ✅ **Debería aparecer en el chat web en 2-3 segundos**

## 🔍 Debug y Monitoreo:

### Ver logs de sincronización:
Los logs aparecen en la consola del servidor Next.js con prefijos:
- `🔄` - Operaciones de sync
- `📨` - Mensajes procesados
- `📍` - Topic routing
- `✅` - Operaciones exitosas
- `❌` - Errores

### Endpoints de diagnóstico:
- `GET /api/chat/auto-sync` - Estado del auto-sync; requiere wallet admin firmada
- `POST /api/chat/sync-telegram` - Sync manual; requiere wallet admin firmada
- `GET /api/debug/chat-config` - Configuración de rooms; solo local y con wallet admin firmada

El ingreso normal debe usar `/api/telegram/webhook` con
`X-Telegram-Bot-Api-Secret-Token`. Polling, sync manual y debug son herramientas
operativas, no endpoints públicos. `TELEGRAM_WEBHOOK_SECRET` debe ser distinto por
entorno y configurarse también como `secret_token` en Telegram antes de activar el
webhook. Si la integración está desactivada puede permanecer vacío y la ruta falla
cerrada con `503`; cargarlo o llamar a `setWebhook` es un cambio operativo separado.
Debe ser base64url generado desde 32 bytes aleatorios (43 caracteres, sin `=`),
porque la Bot API solo acepta `A-Z`, `a-z`, `0-9`, `_` y `-` en este campo.

## 🎯 Próximos Pasos Opcionales:

1. **Webhook en lugar de polling**: Para mejor rendimiento
2. **Topics dedicados**: Crear topics específicos para cada juego
3. **Moderación**: Filtros de contenido automáticos
4. **Métricas**: Dashboard de actividad del chat

## ⚠️ Notas Importantes:

- El grupo de Telegram **DEBE ser un Forum** para que funcionen los topics
- Los mensajes se mapean por `telegramTopicId` en la base de datos
- El polling se puede ajustar entre 10-30 segundos según necesidad
- Los mensajes de ambas direcciones se guardan en la misma tabla `ChatMessage`

El bridge solo está listo cuando bot, chat, webhook secret y allowlist administrativa
están separados y validados en el entorno correspondiente.
