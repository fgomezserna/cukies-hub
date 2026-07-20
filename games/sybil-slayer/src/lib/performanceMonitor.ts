// PerformanceMonitor: Sistema de monitoreo de rendimiento para el juego

export interface PerformanceMetrics {
  assetLoadTime: number;
  spriteLoadTime: number;
  criticalAssetsLoadTime: number;
  totalAssetsLoaded: number;
  failedAssets: number;
  memoryUsage?: number;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics = {
    assetLoadTime: 0,
    spriteLoadTime: 0,
    criticalAssetsLoadTime: 0,
    totalAssetsLoaded: 0,
    failedAssets: 0
  };
  private timers: Map<string, number> = new Map();

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  // Iniciar medición de tiempo
  public startTimer(label: string): void {
    this.timers.set(label, performance.now());
  }

  // Finalizar medición de tiempo
  public endTimer(label: string): number {
    const startTime = this.timers.get(label);
    if (!startTime) return 0;
    
    const duration = performance.now() - startTime;
    this.timers.delete(label);
    
    // Actualizar métricas específicas
    switch (label) {
      case 'criticalAssets':
        this.metrics.criticalAssetsLoadTime = duration;
        break;
      case 'sprites':
        this.metrics.spriteLoadTime = duration;
        break;
      case 'totalAssets':
        this.metrics.assetLoadTime = duration;
        break;
    }
    
    return duration;
  }

  // Registrar asset cargado exitosamente
  public recordAssetLoaded(): void {
    this.metrics.totalAssetsLoaded++;
  }

  // Registrar asset que falló al cargar
  public recordAssetFailed(): void {
    this.metrics.failedAssets++;
  }

  // Obtener métricas actuales
  public getMetrics(): PerformanceMetrics {
    // Agregar uso de memoria si está disponible
    if ('memory' in performance) {
      this.metrics.memoryUsage = (performance as any).memory?.usedJSHeapSize;
    }
    
    return { ...this.metrics };
  }

  // Imprimir reporte de rendimiento
  public printReport(): void {
    const metrics = this.getMetrics();
    
    console.group('📊 Reporte de Rendimiento - Treasure Hunt');
    console.log(`⏱️  Tiempo de carga de assets críticos: ${metrics.criticalAssetsLoadTime.toFixed(2)}ms`);
    console.log(`🎨 Tiempo de carga de sprites: ${metrics.spriteLoadTime.toFixed(2)}ms`);
    console.log(`📦 Tiempo total de carga: ${metrics.assetLoadTime.toFixed(2)}ms`);
    console.log(`✅ Assets cargados exitosamente: ${metrics.totalAssetsLoaded}`);
    
    if (metrics.failedAssets > 0) {
      console.warn(`⚠️  Assets que fallaron: ${metrics.failedAssets}`);
    }
    
    if (metrics.memoryUsage) {
      console.log(`💾 Uso de memoria: ${(metrics.memoryUsage / 1024 / 1024).toFixed(2)} MB`);
    }
    
    // Dar recomendaciones basadas en métricas
    this.giveRecommendations(metrics);
    
    console.groupEnd();
  }

  // Dar recomendaciones de optimización
  private giveRecommendations(metrics: PerformanceMetrics): void {
    const recommendations: string[] = [];
    
    if (metrics.criticalAssetsLoadTime > 2000) {
      recommendations.push('🚀 Considera reducir el tamaño de los assets críticos');
    }
    
    if (metrics.spriteLoadTime > 3000) {
      recommendations.push('🎨 Considera crear sprite sheets consolidados');
    }
    
    if (metrics.failedAssets > 5) {
      recommendations.push('📁 Verifica que todos los archivos de assets existan');
    }
    
    if (metrics.assetLoadTime > 5000) {
      recommendations.push('⚡ Implementa lazy loading para assets no críticos');
    }
    
    if (recommendations.length > 0) {
      console.group('💡 Recomendaciones de Optimización:');
      recommendations.forEach(rec => console.log(rec));
      console.groupEnd();
    } else {
      console.log('✨ Rendimiento óptimo - ¡Excelente trabajo!');
    }
  }

  // Limpiar datos de monitoreo
  public reset(): void {
    this.metrics = {
      assetLoadTime: 0,
      spriteLoadTime: 0,
      criticalAssetsLoadTime: 0,
      totalAssetsLoaded: 0,
      failedAssets: 0
    };
    this.timers.clear();
  }
}

// Exportar instancia singleton
export const performanceMonitor = PerformanceMonitor.getInstance();
