# Sprites de Animación para el Personaje Principal (Token)

Esta carpeta contiene los sprites para la animación del personaje principal del juego.

## Estructura de Nombres

Los archivos siguen esta convención de nombres:

- `token_[número].png`: Sprites para la animación del token, donde [número] es el índice del frame (1-6)

## Implementación

Para implementar estas animaciones en el juego:

1. Los sprites se cargan en el componente `game-canvas.tsx`
2. Se utiliza un contador de frames para determinar qué sprite mostrar
3. La animación se ejecuta ciclando a través de los 6 frames

## Notas de Diseño

- Los sprites deben mantener un tamaño y estilo consistentes
- El tamaño recomendado es 64x64 píxeles
- Fondo transparente (formato PNG)
- Debe ser compatible con el estilo visual del juego 