import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const checkIsMobile = () => {
      // Check if device has touch capability
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      
      // Check screen dimensions (considering both portrait and landscape)
      const screenWidth = window.innerWidth
      const screenHeight = window.innerHeight
      const minDimension = Math.min(screenWidth, screenHeight)
      const maxDimension = Math.max(screenWidth, screenHeight)
      
      // Consider mobile if device has touch capability
      // This works for both portrait and landscape modes
      // For landscape: even if width > 768px, if it has touch it's mobile
      const isSmallScreen = minDimension < MOBILE_BREAKPOINT
      const isTabletLike = hasTouch && maxDimension < 1400 && minDimension < 1024
      
      // Simplified: If it has touch, it's mobile (works for landscape too)
      // Only exclude if it's clearly a desktop (no touch AND large screen)
      const isMobileDevice = hasTouch || (isSmallScreen && !hasTouch)
      
      setIsMobile(isMobileDevice)
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[useIsMobile] Check:', {
          hasTouch,
          screenWidth,
          screenHeight,
          minDimension,
          maxDimension,
          isSmallScreen,
          isMobileDevice,
        })
      }
    }
    
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      checkIsMobile()
    }
    
    mql.addEventListener("change", onChange)
    window.addEventListener('resize', checkIsMobile)
    window.addEventListener('orientationchange', checkIsMobile)
    
    // Initial check
    checkIsMobile()
    
    return () => {
      mql.removeEventListener("change", onChange)
      window.removeEventListener('resize', checkIsMobile)
      window.removeEventListener('orientationchange', checkIsMobile)
    }
  }, [])

  return !!isMobile
}
