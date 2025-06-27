import { renderHook } from '@testing-library/react'
import { useIsMobile } from '@/hooks/use-mobile'

describe('hooks/use-mobile', () => {
  // Mock window properties
  const mockInnerWidth = (width: number) => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    })
  }

  const mockMatchMedia = () => {
    const listeners: Array<() => void> = []
    
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: window.innerWidth < 768,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn((event, listener) => {
          if (event === 'change') {
            listeners.push(listener)
          }
        }),
        removeEventListener: jest.fn((event, listener) => {
          const index = listeners.indexOf(listener)
          if (index > -1) {
            listeners.splice(index, 1)
          }
        }),
        dispatchEvent: jest.fn(),
      })),
    })

    return listeners
  }

  beforeEach(() => {
    mockMatchMedia()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should return true when screen width is mobile (< 768px)', () => {
    mockInnerWidth(767)

    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(true)
  })

  it('should return false when screen width is desktop (>= 768px)', () => {
    mockInnerWidth(768)

    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(false)
  })

  it('should return false when screen width is larger than mobile', () => {
    mockInnerWidth(1024)

    const { result } = renderHook(() => useIsMobile())

    expect(result.current).toBe(false)
  })

  it('should use correct breakpoint (768px)', () => {
    const matchMediaSpy = jest.fn().mockReturnValue({
      matches: false,
      media: '',
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaSpy,
    })

    renderHook(() => useIsMobile())

    expect(matchMediaSpy).toHaveBeenCalledWith('(max-width: 767px)')
  })

  it('should handle undefined initial state', () => {
    // Test the initial undefined state handling
    const { result } = renderHook(() => useIsMobile())

    // Since we return !!isMobile, undefined should become false
    expect(typeof result.current).toBe('boolean')
  })

  it('should update when window is resized', () => {
    mockInnerWidth(1024) // Start with desktop

    const { result, rerender } = renderHook(() => useIsMobile())

    expect(result.current).toBe(false)

    // Simulate window resize to mobile
    mockInnerWidth(400)
    
    // Trigger a rerender to simulate the effect
    rerender()

    expect(result.current).toBe(true)
  })
})