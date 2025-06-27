import React from 'react'
import { render, screen } from '@testing-library/react'
import { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from '@/components/ui/card'

describe('components/ui/Card', () => {
  describe('Card', () => {
    it('should render with children', () => {
      render(
        <Card>
          <div>Card content</div>
        </Card>
      )
      
      expect(screen.getByText('Card content')).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      render(
        <Card className="custom-card">
          <div>Content</div>
        </Card>
      )
      
      const card = screen.getByText('Content').parentElement
      expect(card).toHaveClass('custom-card')
    })

    it('should have default card styles', () => {
      render(
        <Card data-testid="card">
          <div>Content</div>
        </Card>
      )
      
      const card = screen.getByTestId('card')
      expect(card).toHaveClass('rounded-lg', 'border', 'bg-card', 'text-card-foreground', 'shadow-sm')
    })
  })

  describe('CardHeader', () => {
    it('should render with children', () => {
      render(
        <Card>
          <CardHeader>
            <div>Header content</div>
          </CardHeader>
        </Card>
      )
      
      expect(screen.getByText('Header content')).toBeInTheDocument()
    })

    it('should apply header styles', () => {
      render(
        <Card>
          <CardHeader data-testid="card-header">
            <div>Header</div>
          </CardHeader>
        </Card>
      )
      
      const header = screen.getByTestId('card-header')
      expect(header).toHaveClass('flex', 'flex-col', 'space-y-1.5', 'p-6')
    })

    it('should apply custom className', () => {
      render(
        <Card>
          <CardHeader className="custom-header">
            <div>Header</div>
          </CardHeader>
        </Card>
      )
      
      const header = screen.getByText('Header').parentElement
      expect(header).toHaveClass('custom-header')
    })
  })

  describe('CardContent', () => {
    it('should render with children', () => {
      render(
        <Card>
          <CardContent>
            <div>Content text</div>
          </CardContent>
        </Card>
      )
      
      expect(screen.getByText('Content text')).toBeInTheDocument()
    })

    it('should apply content styles', () => {
      render(
        <Card>
          <CardContent data-testid="card-content">
            <div>Content</div>
          </CardContent>
        </Card>
      )
      
      const content = screen.getByTestId('card-content')
      expect(content).toHaveClass('p-6', 'pt-0')
    })

    it('should apply custom className', () => {
      render(
        <Card>
          <CardContent className="custom-content">
            <div>Content</div>
          </CardContent>
        </Card>
      )
      
      const content = screen.getByText('Content').parentElement
      expect(content).toHaveClass('custom-content')
    })
  })

  describe('CardFooter', () => {
    it('should render with children', () => {
      render(
        <Card>
          <CardFooter>
            <div>Footer content</div>
          </CardFooter>
        </Card>
      )
      
      expect(screen.getByText('Footer content')).toBeInTheDocument()
    })

    it('should apply footer styles', () => {
      render(
        <Card>
          <CardFooter data-testid="card-footer">
            <div>Footer</div>
          </CardFooter>
        </Card>
      )
      
      const footer = screen.getByTestId('card-footer')
      expect(footer).toHaveClass('flex', 'items-center', 'p-6', 'pt-0')
    })

    it('should apply custom className', () => {
      render(
        <Card>
          <CardFooter className="custom-footer">
            <div>Footer</div>
          </CardFooter>
        </Card>
      )
      
      const footer = screen.getByText('Footer').parentElement
      expect(footer).toHaveClass('custom-footer')
    })
  })

  describe('CardTitle', () => {
    it('should render with children', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
          </CardHeader>
        </Card>
      )
      
      expect(screen.getByText('Card Title')).toBeInTheDocument()
    })

    it('should apply title styles', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle data-testid="card-title">Title</CardTitle>
          </CardHeader>
        </Card>
      )
      
      const title = screen.getByTestId('card-title')
      expect(title).toHaveClass('text-2xl', 'font-semibold', 'leading-none', 'tracking-tight')
    })

    it('should apply custom className', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle className="custom-title">Title</CardTitle>
          </CardHeader>
        </Card>
      )
      
      const title = screen.getByText('Title')
      expect(title).toHaveClass('custom-title')
    })
  })

  describe('CardDescription', () => {
    it('should render with children', () => {
      render(
        <Card>
          <CardHeader>
            <CardDescription>Card description text</CardDescription>
          </CardHeader>
        </Card>
      )
      
      expect(screen.getByText('Card description text')).toBeInTheDocument()
    })

    it('should apply description styles', () => {
      render(
        <Card>
          <CardHeader>
            <CardDescription data-testid="card-description">Description</CardDescription>
          </CardHeader>
        </Card>
      )
      
      const description = screen.getByTestId('card-description')
      expect(description).toHaveClass('text-sm', 'text-muted-foreground')
    })

    it('should apply custom className', () => {
      render(
        <Card>
          <CardHeader>
            <CardDescription className="custom-description">Description</CardDescription>
          </CardHeader>
        </Card>
      )
      
      const description = screen.getByText('Description')
      expect(description).toHaveClass('custom-description')
    })
  })

  describe('Complete Card', () => {
    it('should render complete card structure', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Test Card</CardTitle>
            <CardDescription>This is a test card</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Card content goes here</p>
          </CardContent>
          <CardFooter>
            <button>Action</button>
          </CardFooter>
        </Card>
      )
      
      expect(screen.getByText('Test Card')).toBeInTheDocument()
      expect(screen.getByText('This is a test card')).toBeInTheDocument()
      expect(screen.getByText('Card content goes here')).toBeInTheDocument()
      expect(screen.getByText('Action')).toBeInTheDocument()
    })

    it('should handle refs correctly', () => {
      const cardRef = React.createRef<HTMLDivElement>()
      const headerRef = React.createRef<HTMLDivElement>()
      const contentRef = React.createRef<HTMLDivElement>()
      
      render(
        <Card ref={cardRef}>
          <CardHeader ref={headerRef}>
            <CardTitle>Title</CardTitle>
          </CardHeader>
          <CardContent ref={contentRef}>
            <p>Content</p>
          </CardContent>
        </Card>
      )
      
      expect(cardRef.current).toBeInstanceOf(HTMLDivElement)
      expect(headerRef.current).toBeInstanceOf(HTMLDivElement)
      expect(contentRef.current).toBeInstanceOf(HTMLDivElement)
    })

    it('should handle semantic HTML correctly', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Accessible Card</CardTitle>
            <CardDescription>With proper semantics</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Content with proper structure</p>
          </CardContent>
        </Card>
      )
      
      // Check that the structure is properly nested
      const title = screen.getByText('Accessible Card')
      const description = screen.getByText('With proper semantics')
      const content = screen.getByText('Content with proper structure')
      
      expect(title.tagName).toBe('H3')
      expect(description.tagName).toBe('P')
      expect(content.tagName).toBe('P')
    })
  })
})