import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('components/ui/Button', () => {
  it('should render button with text', () => {
    render(<Button>Click me</Button>)
    
    expect(screen.getByRole('button')).toHaveTextContent('Click me')
  })

  it('should handle click events', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Click me</Button>)
    
    fireEvent.click(screen.getByRole('button'))
    
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('should render with default variant', () => {
    render(<Button>Default</Button>)
    
    const button = screen.getByRole('button')
    expect(button).toHaveClass('bg-primary')
  })

  it('should render with destructive variant', () => {
    render(<Button variant="destructive">Delete</Button>)
    
    const button = screen.getByRole('button')
    expect(button).toHaveClass('bg-destructive')
  })

  it('should render with outline variant', () => {
    render(<Button variant="outline">Outline</Button>)
    
    const button = screen.getByRole('button')
    expect(button).toHaveClass('border-input')
  })

  it('should render with secondary variant', () => {
    render(<Button variant="secondary">Secondary</Button>)
    
    const button = screen.getByRole('button')
    expect(button).toHaveClass('bg-secondary')
  })

  it('should render with ghost variant', () => {
    render(<Button variant="ghost">Ghost</Button>)
    
    const button = screen.getByRole('button')
    expect(button).toHaveClass('hover:bg-accent')
  })

  it('should render with link variant', () => {
    render(<Button variant="link">Link</Button>)
    
    const button = screen.getByRole('button')
    expect(button).toHaveClass('text-primary')
  })

  it('should render with default size', () => {
    render(<Button>Default size</Button>)
    
    const button = screen.getByRole('button')
    expect(button).toHaveClass('h-10', 'px-4', 'py-2')
  })

  it('should render with sm size', () => {
    render(<Button size="sm">Small</Button>)
    
    const button = screen.getByRole('button')
    expect(button).toHaveClass('h-9', 'px-3')
  })

  it('should render with lg size', () => {
    render(<Button size="lg">Large</Button>)
    
    const button = screen.getByRole('button')
    expect(button).toHaveClass('h-11', 'px-8')
  })

  it('should render with icon size', () => {
    render(<Button size="icon">⭐</Button>)
    
    const button = screen.getByRole('button')
    expect(button).toHaveClass('h-10', 'w-10')
  })

  it('should be disabled when disabled prop is true', () => {
    render(<Button disabled>Disabled</Button>)
    
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveClass('disabled:pointer-events-none')
  })

  it('should not call onClick when disabled', () => {
    const handleClick = jest.fn()
    render(<Button disabled onClick={handleClick}>Disabled</Button>)
    
    fireEvent.click(screen.getByRole('button'))
    
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('should apply custom className', () => {
    render(<Button className="custom-class">Custom</Button>)
    
    const button = screen.getByRole('button')
    expect(button).toHaveClass('custom-class')
  })

  it('should render as child component when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/test">Link button</a>
      </Button>
    )
    
    expect(screen.getByRole('link')).toHaveTextContent('Link button')
    expect(screen.getByRole('link')).toHaveAttribute('href', '/test')
  })

  it('should forward ref correctly', () => {
    const ref = React.createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Button with ref</Button>)
    
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
    expect(ref.current).toHaveTextContent('Button with ref')
  })

  it('should handle all HTML button attributes', () => {
    render(
      <Button 
        type="submit" 
        form="test-form" 
        name="test-button"
        value="test-value"
        aria-label="Test button"
      >
        Submit
      </Button>
    )
    
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toHaveAttribute('form', 'test-form')
    expect(button).toHaveAttribute('name', 'test-button')
    expect(button).toHaveAttribute('value', 'test-value')
    expect(button).toHaveAttribute('aria-label', 'Test button')
  })

  it('should combine variant and size classes correctly', () => {
    render(<Button variant="outline" size="lg">Large Outline</Button>)
    
    const button = screen.getByRole('button')
    expect(button).toHaveClass('border-input', 'h-11', 'px-8')
  })

  it('should handle focus and blur events', () => {
    const handleFocus = jest.fn()
    const handleBlur = jest.fn()
    
    render(
      <Button onFocus={handleFocus} onBlur={handleBlur}>
        Focusable
      </Button>
    )
    
    const button = screen.getByRole('button')
    
    fireEvent.focus(button)
    expect(handleFocus).toHaveBeenCalledTimes(1)
    
    fireEvent.blur(button)
    expect(handleBlur).toHaveBeenCalledTimes(1)
  })
})