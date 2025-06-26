# Assets para Token Runner

Este directorio contiene todos los assets gráficos para el juego Token Runner.

## Estructura de carpetas

```
/assets
├── ui/                    # Elementos de interfaz de usuario
│   ├── game-container/    # Contenedor principal y elementos de fondo
│   │   ├── main-box.png   # Caja principal que contiene todo el juego (tamaño recomendado: 1000x800px)
│   │   └── grid-background.png # Fondo de rejilla para el canvas (misma proporción que el canvas)
│   ├── buttons/           # Botones de la interfaz
│   │   ├── play-button.png   # Botón de play (120x50px)
│   │   ├── pause-button.png  # Botón de pausa (120x50px)
│   │   └── reset-button.png  # Botón de reset (120x50px)
│   └── effects/           # Efectos visuales y overlays
│       └── pause-overlay.png # Overlay para el estado de pausa (misma proporción que el canvas)
├── characters/            # Personajes del juego
│   └── token.png          # Personaje principal (64x64px)
├── obstacles/             # Obstáculos del juego
│   ├── fee.png            # Obstáculo de tipo fee (64x64px)
│   ├── bug.png            # Obstáculo de tipo bug (64x64px)
│   └── hacker.png         # Obstáculo de tipo hacker (64x64px)
└── collectibles/          # Ítems coleccionables
    ├── energy.png         # Coleccionable de energía (32x32px)
    └── mega-node.png      # Coleccionable de mega nodo (48x48px)
```

## Diseño recomendado

* **Estilo**: Mantener un estilo visual con temática de "Tron" o cyberpunk con colores neón.
* **Formato**: Usar PNG con transparencia para todos los elementos.
* **Resolución**: Crear las imágenes al menos al doble de la resolución final para preservar calidad en pantallas de alta densidad.

## Dimensiones de elementos principales

1. **Contenedor principal (main-box.png)**:
   - Ancho: 1000px
   - Alto: 800px 
   - Debe incluir bordes con efectos neón y transparencia donde sea necesario

2. **Canvas de juego**:
   - Se adapta dinámicamente, pero mantiene proporción 4:3
   - El grid-background.png debe poder repetirse o escalarse

3. **Elementos de juego**:
   - Token (jugador): 64x64px
   - Obstáculos: 64x64px
   - Coleccionables: 32-48px

## Paleta de colores

Mantener la misma paleta de colores definida en globals.css:

- **Primario**: Cyan/Azul Eléctrico (hsl(180, 100%, 50%))
- **Acento**: Cyan más claro (hsl(180, 100%, 60%))
- **Destructivo**: Rojo neón (hsl(0, 70%, 50%))
- **Fondo**: Negro (hsl(0, 0%, 0%))
- **Texto**: Cyan muy claro (hsl(180, 100%, 95%))

## Formato y Tamaños Recomendados

- Formato: PNG con transparencia
- Resolución: Mínimo 256x256 pixels para todos los elementos
- Personajes y Obstáculos: Tamaño proporcional a su radio en el juego
  - Token: ~30px de radio
  - Obstáculos: Entre 16px y 36px de radio
- Coleccionables: 
  - Energy Points: ~16px de radio
  - Mega Node: ~40px de radio

## Implementación

Para implementar estos assets en el juego, se modificará el código para cargar las imágenes en lugar de dibujar formas geométricas en el canvas. 