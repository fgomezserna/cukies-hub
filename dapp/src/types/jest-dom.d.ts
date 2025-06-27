import '@testing-library/jest-dom'

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R
      toHaveClass(...classNames: string[]): R
      toContainElement(element: HTMLElement | null): R
      toHaveTextContent(text: string | RegExp): R
      toBeVisible(): R
      toBeDisabled(): R
      toBeEnabled(): R
      toHaveValue(value: string | number): R
      toHaveDisplayValue(value: string | RegExp | (string | RegExp)[]): R
      toBeChecked(): R
      toHaveFocus(): R
      toHaveAttribute(attr: string, value?: string): R
      toHaveStyle(css: Record<string, any> | string): R
    }
  }
}