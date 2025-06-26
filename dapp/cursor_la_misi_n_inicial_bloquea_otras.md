# La misión inicial bloquea otras misiones
_Exported on 18/6/2025 at 14:21:50 CEST from Cursor (1.1.3)_

---

**User**

quiero revisar las tareas de la quest starter

---

**Cursor**

Hola, claro. Para poder revisar las tareas de la quest "starter", primero necesito localizar dónde se definen. Voy a empezar por buscar en el fichero `seed.ts` que se encuentra en la carpeta `prisma`, ya que es muy probable que ahí se inicialicen los datos de las quests.

¡Excelente! Encontré la información en el fichero `prisma/seed.ts`.

Las tareas para la quest **STARTER** son las siguientes:

*   **Set a unique username**: Establecer un nombre de usuario único.
*   **Connect X account**: Conectar tu cuenta de X (anteriormente Twitter).
*   **Follow us on X**: Seguir a @hyppieliquid en X.
*   **Connect Discord account**: Conectar tu cuenta de Discord.
*   **Join our Discord server**: Unirte a nuestro servidor de Discord.
*   **Join our Telegram group**: Unirte a nuestro grupo de Telegram.

¿Hay algo más en lo que pueda ayudarte?

---

**User**

como validamos todas menos la de username que ya esta hecha? no hagas nada aun.. solo hablemos

---

**Cursor**

¡Claro! Analicemos la estrategia para validar esas tareas. Es una excelente idea planificarlo antes de escribir código.

Actualmente, el fichero `seed.ts` define las tareas y un `validationApiEndpoint` para cada una. Esto nos da una pista clara: cada tarea se validará a través de una llamada a nuestra propia API.

El proceso general para cada tipo de tarea (X, Discord, Telegram) sería una combinación de dos pasos principales:

1.  **Autenticación y Conexión (Frontend/NextAuth):** El usuario necesita conectar su cuenta de la red social con nuestra aplicación. La forma estándar de hacer esto en Next.js es usando **NextAuth.js**. Añadiríamos "Providers" para X y Discord. Esto nos permite, con el consentimiento del usuario, obtener tokens de acceso para realizar acciones en su nombre.
2.  **Validación de la Acción (Backend API):** Una vez que la cuenta está conectada, el usuario realiza la acción (seguirnos, unirse a un servidor). Luego, hace clic en un botón de "Verificar" en nuestra DApp. Este botón llama al `validationApiEndpoint` correspondiente. Nuestro backend usará el token de acceso (guardado por NextAuth) para llamar a la API de la red social (X, Discord) y confirmar si la acción se completó. Si es así, se marca la tarea como completada en nuestra base de datos.

Aquí te detallo cómo funcionaría para cada plataforma:

### 1. Conexión y Seguimiento en X (Twitter)

*   **Tarea "Connect X account":**
    *   **Estrategia:** Usaremos el **Provider de Twitter/X en NextAuth.js**. En el frontend, tendremos un botón "Conectar con X". Al hacer clic, se inicia el flujo de OAuth2 de NextAuth.
    *   **Validación:** Si el usuario completa el login con X exitosamente, NextAuth guardará la información de su cuenta. El endpoint `/api/tasks/validate/twitter-connect` simplemente necesitará comprobar si en la sesión del usuario (o en la tabla `Account` de la base de datos que usa NextAuth) existe una cuenta de X vinculada. Si existe, la tarea está completada.

*   **Tarea "Follow us on X":**
    *   **Estrategia:** Esta tarea depende de la anterior. Una vez que el usuario ha conectado su cuenta de X, tenemos un token de acceso para usar la API de X en su nombre.
    *   **Validación:** El endpoint `/api/tasks/validate/twitter-follow` hará lo siguiente:
        1.  Obtendrá el token de acceso del usuario de la sesión de NextAuth.
        2.  Usará la API de X para verificar si el usuario autenticado (`source_user_id`) sigue a nuestra cuenta `@hyppieliquid` (`target_user_id`).
        3.  Si la API de X confirma el seguimiento, marcamos la tarea como completada en la base de datos.

### 2. Conexión y Unión a Servidor de Discord

Este proceso es muy similar al de X.

*   **Tarea "Connect Discord account":**
    *   **Estrategia:** Usaremos el **Provider de Discord en NextAuth.js**. El flujo es idéntico: un botón "Conectar con Discord" que inicia el OAuth de Discord a través de NextAuth.
    *   **Validación:** El endpoint `/api/tasks/validate/discord-connect` verificará si hay una cuenta de Discord vinculada al perfil del usuario en nuestra DApp.

*   **Tarea "Join our Discord server":**
    *   **Estrategia:** Para esto, al configurar el Provider de Discord, necesitaremos solicitar el scope (permiso) `guilds.join`, que permite a nuestra app añadir al usuario a un servidor en su nombre. O, más comúnmente, el scope `guilds.members.read` para verificar si ya se unió.
    *   **Validación:** El endpoint `/api/tasks/validate/discord-join` hará lo siguiente:
        1.  Obtendrá el token de acceso de Discord del usuario.
        2.  Llamará a la API de Discord para obtener la lista de servidores (guilds) a los que pertenece el usuario.
        3.  Comprobará si el ID de nuestro servidor de Discord está en esa lista.
        4.  Si está, se completa la tarea.

### 3. Unión a Grupo de Telegram

Telegram es un poco diferente porque su API para bots y usuarios funciona de manera distinta y no tiene un flujo OAuth2 tan directo como los otros dos para este tipo de validación.

*   **Tarea "Join our Telegram group":**
    *   **Estrategia:** La forma más robusta es usar un **Bot de Telegram**.
    1.  **Crear un Bot:** Generamos un bot con BotFather en Telegram y obtenemos su token.
    2.  **Flujo de Usuario:**
        *   En nuestra DApp, el botón "Unirse al Telegram" no será un simple enlace. Será un enlace especial a nuestro bot, que incluya el ID único de nuestro usuario de la DApp, así: `https://t.me/NuestroHyppieBot?start=USER_ID_DE_NUESTRA_APP`.
        *   El usuario abre Telegram, inicia una conversación con nuestro bot y el bot recibe el `USER_ID_DE_NUESTRA_APP`.
        *   El bot le da al usuario el enlace de invitación real al grupo de Telegram.
    *   **Validación:** Aquí está la clave. El bot debe ser administrador en el grupo de Telegram.
        1.  Cuando un usuario se une al grupo, el bot recibe un evento.
        2.  El bot ya sabe a qué `USER_ID_DE_NUESTRA_APP` corresponde ese usuario de Telegram (del paso `?start=...`).
        3.  El bot entonces hace una llamada a nuestro backend (a un webhook, por ejemplo `POST /api/webhooks/telegram-validation`) para informarnos que el usuario con `USER_ID_DE_NUESTRA_APP` ha completado la tarea.
        4.  Nuestro backend recibe esta llamada segura desde nuestro bot y marca la tarea como completada.

### Resumen del Plan de Acción

Cuando decidas empezar, los pasos serían:

1.  **Configurar NextAuth.js:** Añadir los providers de X y Discord, incluyendo la obtención de las API keys (Client ID y Client Secret) de sus portales de desarrolladores.
2.  **Crear las Rutas de la API:** Desarrollar los endpoints (`/api/tasks/validate/...`) para cada tarea, implementando la lógica de validación que acabamos de discutir.
3.  **Implementar la Lógica de Telegram:** Crear el bot y el webhook necesario para la validación de Telegram.
4.  **Actualizar el Frontend:** Añadir los botones en la página de quests que inicien los flujos de conexión y llamen a los endpoints de verificación.

Este enfoque es robusto, seguro y utiliza las herramientas estándar del ecosistema de Next.js. ¿Qué te parece este plan?

---

**User**

vale, y de donde saco las apis de estos proveedores?

---

**Cursor**

¡Excelente pregunta! Es el paso fundamental. Para cada proveedor, necesitas registrar tu aplicación en su plataforma de desarrolladores. Desde allí obtendrás las credenciales (generalmente un "Client ID" y un "Client Secret") que tu aplicación usará para autenticar a los usuarios.

Aquí te explico cómo obtenerlas para cada uno:

### 1. X (antes Twitter)

Necesitarás crear una aplicación en el **X Developer Platform**.

1.  **Ve al Portal de Desarrolladores de X:** [https://developer.x.com/](https://developer.x.com/)
2.  **Inicia sesión** con tu cuenta de X.
3.  **Crea un Proyecto (Project):** Es un contenedor para tus aplicaciones. Dale un nombre relevante, como "Hyppie Gambling".
4.  **Crea una Aplicación (App):** Dentro de tu proyecto, crea una nueva aplicación.
5.  **Configura OAuth 2.0:** Esta es la parte más importante.
    *   Busca la sección de "User authentication settings" y haz clic en "Set up".
    *   Habilita **OAuth 2.0**.
    *   Tipo de App (Type of App): Elige **"Web App, Automated App or Bot"**.
    *   En la configuración de la App, necesitarás añadir las **"Callback URI / Redirect URLs"**. NextAuth.js usa una URL específica para cada proveedor. Para el desarrollo local, será:
        *   `http://localhost:3000/api/auth/callback/twitter`
    *   También deberás añadir la URL de tu web en producción cuando la tengas (ej. `https://tu-dominio.com/api/auth/callback/twitter`).
6.  **Obtén las credenciales:** Una vez guardada la configuración, la plataforma te proporcionará el **"Client ID"** y el **"Client Secret"**. ¡Cópialos y guárdalos en un lugar seguro!

### 2. Discord

El proceso es similar en el **Portal de Desarrolladores de Discord**.

1.  **Ve al Portal de Desarrolladores de Discord:** [https://discord.com/developers/applications](https://discord.com/developers/applications)
2.  **Inicia sesión** con tu cuenta de Discord.
3.  **Crea una Nueva Aplicación (New Application):** Dale un nombre, como "Hyppie Gambling DApp".
4.  **Ve a la pestaña "OAuth2":** En el menú de la izquierda.
5.  **Añade las Redirecciones (Redirects):** Al igual que con X, debes añadir la URL de callback que usará NextAuth.js. Para desarrollo, añade:
    *   `http://localhost:3000/api/auth/callback/discord`
6.  **Obtén las credenciales:** En esta misma página de "OAuth2", verás tu **"Client ID"**. Debajo, hay un botón para revelar y copiar tu **"Client Secret"**.

### 3. Telegram (Bot Token)

Telegram funciona de manera diferente. No usas OAuth de la misma forma. En su lugar, creas un Bot que te dará un **Token** de API.

1.  **Abre Telegram** (en tu ordenador o móvil).
2.  **Busca a `@BotFather`:** Es el bot oficial de Telegram para crear otros bots. Tiene una marca de verificación azul.
3.  **Inicia una conversación** con BotFather.
4.  **Escribe y envía el comando `/newbot`**.
5.  **Sigue las instrucciones:**
    *   Primero te pedirá un nombre para tu bot (ej. `Hyppie Gambling Bot`).
    *   Luego te pedirá un nombre de usuario, que debe ser único y terminar en `bot` (ej. `HyppieGamblingQuestBot`).
6.  **Obtén el Token:** Si el nombre de usuario está disponible, BotFather te felicitará y te enviará un mensaje que contiene el **token de acceso** a la API HTTP. Este token es tu "API Key". ¡Cópialo y guárdalo muy bien!

---

### Cómo Guardar las Credenciales de Forma Segura

**¡NUNCA guardes estas claves directamente en tu código!** La forma correcta y segura de manejarlas es a través de **variables de entorno**.

1.  Crea un fichero llamado `.env.local` en la raíz de tu proyecto (al mismo nivel que `package.json`).
2.  Añade las claves a este fichero. Te recomiendo usar una convención de nombres que NextAuth.js pueda entender:

    ```
    # Variables de entorno para Hyppie Gambling

    # Credenciales de X (Twitter)
    AUTH_TWITTER_ID="PEGA_AQUÍ_TU_CLIENT_ID_DE_X"
    AUTH_TWITTER_SECRET="PEGA_AQUÍ_TU_CLIENT_SECRET_DE_X"

    # Credenciales de Discord
    AUTH_DISCORD_ID="PEGA_AQUÍ_TU_CLIENT_ID_DE_DISCORD"
    AUTH_DISCORD_SECRET="PEGA_AQUÍ_TU_CLIENT_SECRET_DE_DISCORD"

    # Token del Bot de Telegram
    TELEGRAM_BOT_TOKEN="PEGA_AQUÍ_TU_TOKEN_DE_TELEGRAM"

    # Secreto de NextAuth (muy importante para seguridad)
    # Puedes generar uno con: openssl rand -hex 32
    NEXTAUTH_SECRET="PEGA_AQUÍ_UN_SECRETO_ALEATORIO"
    NEXTAUTH_URL="http://localhost:3000"
    ```

El fichero `.env.local` ya está incluido en el `.gitignore` de los proyectos de Next.js, por lo que no se subirá a tu repositorio de Git, manteniendo tus claves seguras.

Cuando tengas estas credenciales listas, avísame y podemos pasar a configurar NextAuth.js en el código para empezar a conectar las cuentas.

```plaintext
    # Variables de entorno para Hyppie Gambling

    # Credenciales de X (Twitter)
    AUTH_TWITTER_ID="PEGA_AQUÍ_TU_CLIENT_ID_DE_X"
    AUTH_TWITTER_SECRET="PEGA_AQUÍ_TU_CLIENT_SECRET_DE_X"

    # Credenciales de Discord
    AUTH_DISCORD_ID="PEGA_AQUÍ_TU_CLIENT_ID_DE_DISCORD"
    AUTH_DISCORD_SECRET="PEGA_AQUÍ_TU_CLIENT_SECRET_DE_DISCORD"

    # Token del Bot de Telegram
    TELEGRAM_BOT_TOKEN="PEGA_AQUÍ_TU_TOKEN_DE_TELEGRAM"

    # Secreto de NextAuth (muy importante para seguridad)
    # Puedes generar uno con: openssl rand -hex 32
    NEXTAUTH_SECRET="PEGA_AQUÍ_UN_SECRETO_ALEATORIO"
    NEXTAUTH_URL="http://localhost:3000"
```

---

**User**

y como verificamos cada tarea entonces?

---

**Cursor**

¡Claro! Vamos a detallar la lógica de verificación para cada tarea. El proceso se divide en dos partes: la **interacción del usuario en el frontend** y la **lógica de validación en el backend** (en nuestras rutas de API).

Asumiremos que ya has configurado NextAuth.js con los proveedores de X y Discord, y tienes tus claves en el fichero `.env.local`.

Aquí está el desglose, tarea por tarea:

---

### Tarea 1: Conectar Cuenta de X (Twitter)

*   **Endpoint:** `/api/tasks/validate/twitter-connect`
*   **Objetivo:** Confirmar que el usuario ha autorizado a nuestra DApp a acceder a su información de X.

**Lógica de Verificación (Backend):**

Esta es la validación más simple. Cuando un usuario se conecta con un proveedor a través de NextAuth, se crea un registro en la tabla `Account` de tu base de datos, vinculando su cuenta de nuestra DApp con su cuenta de la red social.

El código en el backend para validar sería así:

```typescript
// En /api/tasks/validate/twitter-connect/route.ts
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"; // Ajusta esta ruta
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 1. Buscamos en la BBDD si existe una cuenta de "twitter" para este usuario.
  const twitterAccount = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "twitter",
    },
  });

  if (twitterAccount) {
    // 2. Si existe, la tarea está completada.
    // Aquí marcarías la tarea como completada en tu tabla `UserCompletedTask`
    // ...lógica para guardar el progreso...
    return NextResponse.json({ success: true, message: "X account connected" });
  } else {
    // 3. Si no existe, no han conectado su cuenta.
    return NextResponse.json({ success: false, message: "X account not connected" });
  }
}
```

---

### Tarea 2: Seguirnos en X

*   **Endpoint:** `/api/tasks/validate/twitter-follow`
*   **Objetivo:** Verificar que el usuario sigue a la cuenta `@hyppieliquid`.

**Lógica de Verificación (Backend):**

Aquí necesitamos usar la API de X. Instalaremos una librería para facilitar esto: `pnpm add twitter-api-v2`.

```typescript
// En /api/tasks/validate/twitter-follow/route.ts
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { TwitterApi } from "twitter-api-v2";

const HYPPIE_TWITTER_ID = "ID_NUMÉRICO_DE_LA_CUENTA_HYPPIELIQUID"; // Debes obtener este ID

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 1. Obtenemos el token de acceso del usuario de la BBDD.
  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "twitter" },
  });

  if (!account?.access_token) {
    return NextResponse.json({ success: false, message: "X account not connected or token missing." });
  }

  // 2. Usamos la API de Twitter para verificar el seguimiento.
  try {
    const client = new TwitterApi(account.access_token);
    // account.providerAccountId es el ID de Twitter del usuario que se conectó.
    const following = await client.v2.following(account.providerAccountId);
    
    // 3. Comprobamos si nuestra cuenta está en la lista de seguidos.
    const isFollowing = following.data.some(user => user.id === HYPPIE_TWITTER_ID);

    if (isFollowing) {
      // Marcar tarea como completada...
      return NextResponse.json({ success: true, message: "Successfully verified follow." });
    } else {
      return NextResponse.json({ success: false, message: "User is not following @hyppieliquid." });
    }
  } catch (error) {
    console.error("Twitter API error:", error);
    return NextResponse.json({ success: false, message: "Could not verify follow status." }, { status: 500 });
  }
}
```

---

### Tarea 3: Conectar Cuenta de Discord

*   **Endpoint:** `/api/tasks/validate/discord-connect`
*   **Objetivo:** Confirmar que el usuario ha autorizado a nuestra DApp.

**Lógica de Verificación (Backend):**

Es **idéntica** a la de conectar la cuenta de X, solo que cambiamos el `provider`.

```typescript
// Código en /api/tasks/validate/discord-connect/route.ts
// ... (importaciones y sesión igual que antes)

// Buscamos en la BBDD si existe una cuenta de "discord" para este usuario.
const discordAccount = await prisma.account.findFirst({
  where: {
    userId: session.user.id,
    provider: "discord", // La única diferencia
  },
});

if (discordAccount) {
  // ... (marcar como completada)
  return NextResponse.json({ success: true, message: "Discord account connected" });
} else {
  return NextResponse.json({ success: false, message: "Discord account not connected" });
}
```

---

### Tarea 4: Unirse a nuestro Servidor de Discord

*   **Endpoint:** `/api/tasks/validate/discord-join`
*   **Objetivo:** Verificar que el usuario es miembro de nuestro servidor.

**Lógica de Verificación (Backend):**

Necesitamos el ID de nuestro servidor de Discord (Guild ID) y lo guardamos como variable de entorno `DISCORD_GUILD_ID`.

```typescript
// En /api/tasks/validate/discord-join/route.ts
// ... (importaciones y sesión igual que antes)

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  // ... (manejo de sesión)

  // 1. Obtenemos el token de acceso de Discord del usuario.
  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "discord" },
  });

  if (!account?.access_token) {
    return NextResponse.json({ success: false, message: "Discord account not connected." });
  }

  // 2. Llamamos a la API de Discord para obtener los servidores del usuario.
  try {
    const response = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: {
        Authorization: `Bearer ${account.access_token}`,
      },
    });

    if (!response.ok) throw new Error("Failed to fetch guilds");

    const guilds: { id: string, name: string }[] = await response.json();
    
    // 3. Comprobamos si el ID de nuestro servidor está en la lista.
    const hasJoined = guilds.some(guild => guild.id === process.env.DISCORD_GUILD_ID);

    if (hasJoined) {
      // Marcar tarea como completada...
      return NextResponse.json({ success: true, message: "Successfully verified server join." });
    } else {
      return NextResponse.json({ success: false, message: "User has not joined the Discord server." });
    }
  } catch (error) {
    console.error("Discord API error:", error);
    return NextResponse.json({ success: false, message: "Could not verify server membership." }, { status: 500 });
  }
}
```

---

### Tarea 5: Unirse a nuestro Grupo de Telegram

*   **Objetivo:** Verificar que el usuario está en el grupo.
*   **Esta es diferente.** No se valida con un botón en la DApp, sino que nuestro Bot de Telegram nos lo notifica.

**Flujo de Verificación (Asíncrono):**

1.  **En el Frontend:** El botón "Unirse a Telegram" no llama a una API. Es un enlace especial que abre Telegram:
    *   `https://t.me/TuHyppieBot?start=USER_ID`
    *   `USER_ID` es el ID del usuario de nuestra base de datos.

2.  **En tu Bot de Telegram (código del bot):**
    *   Cuando el usuario presiona "Start", el bot recibe el `USER_ID`.
    *   El bot guarda una relación temporal: `telegram_user_id` -> `dapp_user_id`.
    *   El bot le envía al usuario el enlace de invitación real al grupo.

3.  **Webhook en nuestro Backend (`/api/webhooks/telegram`):**
    *   Tu bot debe ser administrador del grupo para detectar cuándo alguien se une.
    *   Cuando un usuario se une, el bot recibe el evento y sabe su `telegram_user_id`.
    *   Con la relación guardada, el bot encuentra el `dapp_user_id` correspondiente.
    *   El bot hace una llamada `POST` a nuestro webhook (`https://tu-app.com/api/webhooks/telegram`) con el `dapp_user_id`.
    *   **¡MUY IMPORTANTE!** Esta llamada del bot a nuestro backend debe estar securizada. Lo más simple es que el bot envíe un `SECRET_TOKEN` que solo él y nuestro backend conocen.

```typescript
// En /api/webhooks/telegram/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { userId, secret } = await req.json();

  // 1. Verificamos el secreto para asegurar que la llamada viene de nuestro bot.
  if (secret !== process.env.TELEGRAM_BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  if (!userId) {
    return NextResponse.json({ error: "User ID is missing" }, { status: 400 });
  }

  // 2. Marcamos la tarea como completada para el usuario que nos indicó el bot.
  // ...lógica para guardar el progreso para `userId`...
  console.log(`Telegram task completed for user: ${userId}`);
  
  return NextResponse.json({ success: true });
}
```

Este es el plan de acción detallado para la implementación técnica de cada validación.

```typescript
// En /api/tasks/validate/twitter-connect/route.ts
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"; // Ajusta esta ruta
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 1. Buscamos en la BBDD si existe una cuenta de "twitter" para este usuario.
  const twitterAccount = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "twitter",
    },
  });

  if (twitterAccount) {
    // 2. Si existe, la tarea está completada.
    // Aquí marcarías la tarea como completada en tu tabla `UserCompletedTask`
    // ...lógica para guardar el progreso...
    return NextResponse.json({ success: true, message: "X account connected" });
  } else {
    // 3. Si no existe, no han conectado su cuenta.
    return NextResponse.json({ success: false, message: "X account not connected" });
  }
}
```

```typescript
// En /api/tasks/validate/twitter-follow/route.ts
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { TwitterApi } from "twitter-api-v2";

const HYPPIE_TWITTER_ID = "ID_NUMÉRICO_DE_LA_CUENTA_HYPPIELIQUID"; // Debes obtener este ID

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 1. Obtenemos el token de acceso del usuario de la BBDD.
  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "twitter" },
  });

  if (!account?.access_token) {
    return NextResponse.json({ success: false, message: "X account not connected or token missing." });
  }

  // 2. Usamos la API de Twitter para verificar el seguimiento.
  try {
    const client = new TwitterApi(account.access_token);
    // account.providerAccountId es el ID de Twitter del usuario que se conectó.
    const following = await client.v2.following(account.providerAccountId);
    
    // 3. Comprobamos si nuestra cuenta está en la lista de seguidos.
    const isFollowing = following.data.some(user => user.id === HYPPIE_TWITTER_ID);

    if (isFollowing) {
      // Marcar tarea como completada...
      return NextResponse.json({ success: true, message: "Successfully verified follow." });
    } else {
      return NextResponse.json({ success: false, message: "User is not following @hyppieliquid." });
    }
  } catch (error) {
    console.error("Twitter API error:", error);
    return NextResponse.json({ success: false, message: "Could not verify follow status." }, { status: 500 });
  }
}
```

```typescript
// Código en /api/tasks/validate/discord-connect/route.ts
// ... (importaciones y sesión igual que antes)

// Buscamos en la BBDD si existe una cuenta de "discord" para este usuario.
const discordAccount = await prisma.account.findFirst({
  where: {
    userId: session.user.id,
    provider: "discord", // La única diferencia
  },
});

if (discordAccount) {
  // ... (marcar como completada)
  return NextResponse.json({ success: true, message: "Discord account connected" });
} else {
  return NextResponse.json({ success: false, message: "Discord account not connected" });
}
```

```typescript
// En /api/tasks/validate/discord-join/route.ts
// ... (importaciones y sesión igual que antes)

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  // ... (manejo de sesión)

  // 1. Obtenemos el token de acceso de Discord del usuario.
  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "discord" },
  });

  if (!account?.access_token) {
    return NextResponse.json({ success: false, message: "Discord account not connected." });
  }

  // 2. Llamamos a la API de Discord para obtener los servidores del usuario.
  try {
    const response = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: {
        Authorization: `Bearer ${account.access_token}`,
      },
    });

    if (!response.ok) throw new Error("Failed to fetch guilds");

    const guilds: { id: string, name: string }[] = await response.json();
    
    // 3. Comprobamos si el ID de nuestro servidor está en la lista.
    const hasJoined = guilds.some(guild => guild.id === process.env.DISCORD_GUILD_ID);

    if (hasJoined) {
      // Marcar tarea como completada...
      return NextResponse.json({ success: true, message: "Successfully verified server join." });
    } else {
      return NextResponse.json({ success: false, message: "User has not joined the Discord server." });
    }
  } catch (error) {
    console.error("Discord API error:", error);
    return NextResponse.json({ success: false, message: "Could not verify server membership." }, { status: 500 });
  }
}
```

```typescript
// En /api/webhooks/telegram/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { userId, secret } = await req.json();

  // 1. Verificamos el secreto para asegurar que la llamada viene de nuestro bot.
  if (secret !== process.env.TELEGRAM_BOT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  if (!userId) {
    return NextResponse.json({ error: "User ID is missing" }, { status: 400 });
  }

  // 2. Marcamos la tarea como completada para el usuario que nos indicó el bot.
  // ...lógica para guardar el progreso para `userId`...
  console.log(`Telegram task completed for user: ${userId}`);
  
  return NextResponse.json({ success: true });
}
```

