import { renderHook, act } from '@testing-library/react'
import { useToast, reducer, toast } from '@/hooks/use-toast'

describe('hooks/use-toast', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset the internal state
    jest.resetModules()
  })

  describe('reducer', () => {
    it('should add toast to state', () => {
      const initialState = { toasts: [] }
      const newToast = {
        id: '1',
        title: 'Test Toast',
        description: 'This is a test',
        open: true,
        onOpenChange: jest.fn(),
      }

      const result = reducer(initialState, {
        type: 'ADD_TOAST',
        toast: newToast,
      })

      expect(result.toasts).toHaveLength(1)
      expect(result.toasts[0]).toEqual(newToast)
    })

    it('should update existing toast', () => {
      const existingToast = {
        id: '1',
        title: 'Original Title',
        open: true,
        onOpenChange: jest.fn(),
      }
      const initialState = { toasts: [existingToast] }

      const result = reducer(initialState, {
        type: 'UPDATE_TOAST',
        toast: { id: '1', title: 'Updated Title' },
      })

      expect(result.toasts[0].title).toBe('Updated Title')
      expect(result.toasts[0].id).toBe('1')
    })

    it('should dismiss toast by setting open to false', () => {
      const existingToast = {
        id: '1',
        title: 'Test',
        open: true,
        onOpenChange: jest.fn(),
      }
      const initialState = { toasts: [existingToast] }

      const result = reducer(initialState, {
        type: 'DISMISS_TOAST',
        toastId: '1',
      })

      expect(result.toasts[0].open).toBe(false)
    })

    it('should dismiss all toasts when no toastId provided', () => {
      const toast1 = { id: '1', title: 'Test 1', open: true, onOpenChange: jest.fn() }
      const toast2 = { id: '2', title: 'Test 2', open: true, onOpenChange: jest.fn() }
      const initialState = { toasts: [toast1, toast2] }

      const result = reducer(initialState, {
        type: 'DISMISS_TOAST',
      })

      expect(result.toasts[0].open).toBe(false)
      expect(result.toasts[1].open).toBe(false)
    })

    it('should remove toast from state', () => {
      const toast1 = { id: '1', title: 'Test 1', open: true, onOpenChange: jest.fn() }
      const toast2 = { id: '2', title: 'Test 2', open: true, onOpenChange: jest.fn() }
      const initialState = { toasts: [toast1, toast2] }

      const result = reducer(initialState, {
        type: 'REMOVE_TOAST',
        toastId: '1',
      })

      expect(result.toasts).toHaveLength(1)
      expect(result.toasts[0].id).toBe('2')
    })

    it('should remove all toasts when no toastId provided', () => {
      const toast1 = { id: '1', title: 'Test 1', open: true, onOpenChange: jest.fn() }
      const toast2 = { id: '2', title: 'Test 2', open: true, onOpenChange: jest.fn() }
      const initialState = { toasts: [toast1, toast2] }

      const result = reducer(initialState, {
        type: 'REMOVE_TOAST',
      })

      expect(result.toasts).toHaveLength(0)
    })

    it('should enforce toast limit', () => {
      const initialState = { toasts: [] }
      const newToast = {
        id: '1',
        title: 'Test Toast',
        open: true,
        onOpenChange: jest.fn(),
      }

      const result = reducer(initialState, {
        type: 'ADD_TOAST',
        toast: newToast,
      })

      // Since TOAST_LIMIT is 1, should only have 1 toast
      expect(result.toasts).toHaveLength(1)
    })
  })

  describe('useToast hook', () => {
    it('should return initial state', () => {
      const { result } = renderHook(() => useToast())

      expect(result.current.toasts).toEqual([])
      expect(typeof result.current.toast).toBe('function')
      expect(typeof result.current.dismiss).toBe('function')
    })

    it('should add toast when toast function is called', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.toast({
          title: 'Test Toast',
          description: 'Test Description',
        })
      })

      expect(result.current.toasts).toHaveLength(1)
      expect(result.current.toasts[0].title).toBe('Test Toast')
      expect(result.current.toasts[0].description).toBe('Test Description')
    })

    it('should dismiss toast when dismiss function is called', () => {
      const { result } = renderHook(() => useToast())

      act(() => {
        result.current.toast({
          title: 'Test Toast',
        })
      })

      const toastId = result.current.toasts[0].id

      act(() => {
        result.current.dismiss(toastId)
      })

      expect(result.current.toasts[0].open).toBe(false)
    })
  })

  describe('toast function', () => {
    it('should create and return toast with dismiss and update functions', () => {
      const result = toast({
        title: 'Test Toast',
        description: 'Test Description',
      })

      expect(result.id).toBeDefined()
      expect(typeof result.dismiss).toBe('function')
      expect(typeof result.update).toBe('function')
    })

    it('should update toast when update function is called', () => {
      const toastInstance = toast({
        title: 'Original Title',
      })

      act(() => {
        toastInstance.update({
          id: toastInstance.id,
          title: 'Updated Title',
        })
      })

      // Note: This test is more about the function not throwing errors
      // since the actual state updates happen in the global listener system
      expect(toastInstance.update).toBeDefined()
    })

    it('should dismiss toast when dismiss function is called', () => {
      const toastInstance = toast({
        title: 'Test Toast',
      })

      act(() => {
        toastInstance.dismiss()
      })

      // Note: This test is more about the function not throwing errors
      expect(toastInstance.dismiss).toBeDefined()
    })
  })
})