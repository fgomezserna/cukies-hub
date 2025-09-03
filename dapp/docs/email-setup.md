# Email Verification Setup with Resend

## 1. Crear cuenta en Resend

1. Ve a [resend.com](https://resend.com)
2. Crea una cuenta gratuita
3. Verifica tu email

## 2. Configurar dominio (Recomendado)

### Opción A: Usar tu propio dominio
1. En el dashboard de Resend, ve a "Domains"
2. Agrega tu dominio (ej: `hyppie.com`)
3. Configura los registros DNS que te proporcionen
4. Espera la verificación (puede tomar hasta 24h)

### Opción B: Usar el dominio sandbox (Solo para testing)
- Puedes usar `onboarding@resend.dev` para testing
- Limitado a 100 emails/mes
- Solo puedes enviar a tu email registrado

## 3. Obtener API Key

1. Ve a "API Keys" en el dashboard
2. Crea una nueva API key
3. Cópiala (solo se muestra una vez)

## 4. Variables de entorno necesarias

Agrega estas variables a tu archivo `.env.local`:

```env
# Resend Email Configuration
RESEND_API_KEY="re_your_api_key_here"
RESEND_FROM_EMAIL="noreply@hyppie.com"  # o "onboarding@resend.dev" para testing
RESEND_DOMAIN="hyppie.com"              # o "resend.dev" para testing
```

## 5. Testing

### En desarrollo:
- El código de verificación se muestra en el toast para facilitar testing
- También se envía por email

### En producción:
- Solo se envía por email
- El código NO se muestra en la respuesta

## 6. Límites y precios

### Plan gratuito:
- 3,000 emails/mes
- Perfecto para empezar

### Plan Pro ($20/mes):
- 50,000 emails/mes
- Analytics avanzados
- Soporte prioritario

## 7. Troubleshooting

### Error: "RESEND_API_KEY environment variable is required"
- Asegúrate de que la variable esté en tu `.env.local`
- Reinicia el servidor de desarrollo

### Error: "Failed to send verification email"
- Verifica que tu API key sea válida
- Asegúrate de que el dominio esté verificado
- Revisa los logs de Resend en su dashboard

### Emails no llegan:
- Revisa la carpeta de spam
- Verifica que el dominio esté correctamente configurado
- Usa `onboarding@resend.dev` para testing inicial
