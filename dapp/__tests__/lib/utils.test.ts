import { cn } from '@/lib/utils'

describe('lib/utils', () => {
  describe('cn function', () => {
    it('should merge class names correctly', () => {
      const result = cn('text-center', 'bg-blue-500')
      expect(result).toBe('text-center bg-blue-500')
    })

    it('should handle conditional classes', () => {
      const result = cn('text-center', false && 'hidden', 'bg-blue-500')
      expect(result).toBe('text-center bg-blue-500')
    })

    it('should handle undefined and null values', () => {
      const result = cn('text-center', undefined, null, 'bg-blue-500')
      expect(result).toBe('text-center bg-blue-500')
    })

    it('should handle empty string', () => {
      const result = cn('text-center', '', 'bg-blue-500')
      expect(result).toBe('text-center bg-blue-500')
    })

    it('should resolve conflicts with tailwind-merge', () => {
      const result = cn('text-sm', 'text-lg')
      expect(result).toBe('text-lg')
    })

    it('should handle arrays', () => {
      const result = cn(['text-center', 'bg-blue-500'])
      expect(result).toBe('text-center bg-blue-500')
    })

    it('should handle objects', () => {
      const result = cn({
        'text-center': true,
        'bg-blue-500': true,
        'hidden': false,
      })
      expect(result).toBe('text-center bg-blue-500')
    })
  })
})