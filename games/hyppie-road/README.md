# Hyppie Road

Un emocionante juego de apuesta y estrategia donde los jugadores navegan por un camino lleno de desafíos, multiplicando sus recompensas mientras evitan las trampas.

## 🎯 Cómo Jugar

1. **Realiza tu apuesta**: Ingresa la cantidad que quieres apostar (entre $1 y $1000)
2. **Navega por el camino**: Avanza casilla por casilla, cada una incrementa tu multiplicador
3. **Toma decisiones**: En cada paso puedes elegir continuar o retirar tus ganancias
4. **Evita las trampas**: Si pisas una trampa, pierdes toda tu apuesta
5. **Cobra tus ganancias**: Retírate en cualquier momento para asegurar tus ganancias

## 🎮 Características

- **Multiplicadores Progresivos**: Desde 1.0x hasta 30.0x
- **16 Casillas**: Cada una con diferentes niveles de riesgo y recompensa
- **Decisiones Estratégicas**: Balance entre riesgo y recompensa
- **Interfaz Intuitiva**: Diseño claro y fácil de usar
- **Animaciones Fluidas**: Efectos visuales atractivos

## 🏗️ Arquitectura

Este juego está construido con:

- **Next.js 15**: Framework de React para la aplicación
- **TypeScript**: Tipado estático para mayor seguridad
- **Tailwind CSS**: Estilos utilitarios para el diseño
- **Zustand**: Gestión de estado ligera y eficiente
- **Shadcn/ui**: Componentes de UI modernos y accesibles

## 🚀 Desarrollo

```bash
# Instalar dependencias
pnpm install

# Ejecutar en modo desarrollo
pnpm dev

# Construir para producción
pnpm build

# Iniciar en producción
pnpm start
```

## 🔧 Configuración

El juego se ejecuta por defecto en el puerto 9003 para evitar conflictos con otros juegos del monorepo.

## 🎨 Integración

Este juego está diseñado para integrarse con la DApp principal de Hyppie a través de:

- **Game Bridge**: Comunicación entre la DApp y el juego
- **iframe**: Embedido en la página principal de juegos
- **Variables de entorno**: Configuración de URLs de despliegue