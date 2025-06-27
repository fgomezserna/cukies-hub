Hyppie Road - Especificación de Juego

🎯 Objetivo del Juego

El jugador realiza una apuesta inicial y debe avanzar por una serie de casillas (o "pasos en la carretera"). Cada casilla incrementa el multiplicador de su apuesta. Puede elegir seguir avanzando o retirarse en cualquier momento. Si pisa una trampa, pierde la apuesta.

🧩 Componentes Principales

1. Lógica del Juego

Apuesta Inicial (betAmount): Número ingresado por el jugador.

Multiplicador (multiplier): Aumenta con cada paso. Ej: 1.0 → 1.2 → 1.5 → 2.0...

Posición del Jugador (position): Índice de la casilla actual.

Estado del Juego (gameState): "waiting", "playing", "won", "lost"

Casillas (tiles): Array con casillas, algunas tienen trampas (aleatorias).

Trampas (traps): Posiciones generadas aleatoriamente.

2. Acciones del Jugador

Iniciar Juego: Define la apuesta y genera el camino con trampas.

Avanzar: Aumenta el position, evalúa si pisó trampa.

Retirarse: Finaliza el juego y multiplica la apuesta por el multiplier.

3. Fórmula de Multiplicador

Una forma escalonada o progresiva:

const multipliers = [1.0, 1.2, 1.5, 2.0, 2.5, 3.2, 4.0, 5.0, 6.5, 8.0];

4. Estructura de Datos

type GameState = "waiting" | "playing" | "won" | "lost";

interface Tile {
  index: number;
  hasTrap: boolean;
  revealed: boolean;
}

interface Game {
  betAmount: number;
  multiplier: number;
  position: number;
  tiles: Tile[];
  gameState: GameState;
}

🎮 Flujo del Juego

Jugador ingresa una apuesta → Se inicia el juego

Se generan casillas con trampas ocultas

Jugador presiona "Avanzar"

Si pisa una trampa → pierde todo

Si no, gana multiplicador y elige avanzar o retirarse

Si se retira → se calcula ganancia: betAmount * multiplier

🖱️ UI/UX Propuesta

Pantalla Principal

Campo para ingresar apuesta

Botón "Jugar"

Zona de Camino

Representación gráfica de las casillas

Casilla actual resaltada

Controles de Juego

Botón "Avanzar"

Botón "Retirarse"

Indicadores

Monto apostado

Multiplicador actual

Ganancia potencial

---

### Arquitectura y Integración

Siguiendo la estructura del proyecto, el juego **Hyppie Road** se desarrollará como una aplicación Next.js independiente dentro del monorepo, ubicada en el directorio `games/hyppie-road`. Esta arquitectura es similar a la del juego existente `sybil-slayer`.

La integración con la `dapp` principal se realizará de la siguiente manera:

1.  **Página del Juego en la DApp**: Se creará una nueva página en `dapp/src/app/games/hyppie-road/page.tsx`. Esta página contendrá un `<iframe>` que cargará la aplicación del juego `Hyppie Road`.
2.  **URL del Juego**: La URL del juego se gestionará a través de variables de entorno, similar a `process.env.GAME_SYBILSLASH` para Sybil Slayer. Deberemos definir una nueva variable, por ejemplo `GAME_HYPPIEROAD`.
3.  **Comunicación DApp-Juego**: Se utilizará el paquete `@hyppie/game-bridge` para facilitar la comunicación entre la `dapp` (parent) y el juego en el `<iframe>` (child). Esto permitirá, por ejemplo, pasar la información de autenticación del usuario al juego de forma segura.
4.  **Listado de Juegos**: El juego se añadirá a la lista de juegos en `dapp/src/app/games/page.tsx` para que aparezca en la interfaz de usuario de la `dapp`.

---

🛠️ Tecnologías Sugeridas

Frontend: React + TailwindCSS

Estado: Zustand / Redux / useState

Backend (opcional): Node.js para lógica de apuesta real o persistencia

Animaciones: Framer Motion para transiciones suaves

🚧 Tareas Iniciales para Cursor

**Parte 1: Creación del Proyecto del Juego (`games/hyppie-road`)**

1.  **Inicializar Proyecto**: Crear un nuevo proyecto Next.js en `games/hyppie-road` basado en la plantilla de `sybil-slayer`.
2.  **Modelos de Datos**: Crear el fichero `src/types/game.ts` con los modelos de datos (`GameState`, `Tile`, `Game`).
3.  **Lógica del Juego**:
    *   Implementar `startGame(betAmount: number)` para generar las casillas con trampas aleatorias.
    *   Implementar `advance()` para gestionar el avance del jugador, evaluando si pisa una trampa o si el multiplicador aumenta.
    *   Implementar `cashOut()` para calcular y retornar la ganancia del jugador.
4.  **Estado del Juego**: Utilizar un hook de React (p. ej. `useGameState`) para gestionar el estado completo del juego (`betAmount`, `multiplier`, `position`, `tiles`, `gameState`).
5.  **UI Básica**: Desarrollar una UI inicial para mostrar el tablero, los controles ("Avanzar", "Retirarse") y los indicadores de estado (apuesta, multiplicador, ganancia potencial).

**Parte 2: Integración en la DApp (`dapp`)**

1.  **Añadir a la Lista**: Modificar `dapp/src/app/games/page.tsx` para añadir "Hyppie Road" a la lista de juegos, marcándolo como `playable`.
2.  **Crear Página Contenedora**: Crear el fichero `dapp/src/app/games/hyppie-road/page.tsx`. Este componente debe ser similar a `SybilSlayerPage`, incluyendo el `<iframe>` y la lógica de comunicación con `game-bridge`.
3.  **Configurar Entorno**: Añadir la variable de entorno para la URL de despliegue del juego `Hyppie Road`.