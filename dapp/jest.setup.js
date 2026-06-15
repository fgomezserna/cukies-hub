import '@testing-library/jest-dom'

const { TextDecoder, TextEncoder } = require('node:util')

if (!global.TextEncoder) {
  global.TextEncoder = TextEncoder
}

if (!global.TextDecoder) {
  global.TextDecoder = TextDecoder
}

const { Request, Response, Headers } = require('undici')

if (!global.Request) {
  global.Request = Request
}

if (!global.Response) {
  global.Response = Response
}

if (!global.Headers) {
  global.Headers = Headers
}

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(),
    getAll: jest.fn(),
    has: jest.fn(),
    keys: jest.fn(),
    values: jest.fn(),
    entries: jest.fn(),
    toString: jest.fn(),
  }),
  usePathname: () => '/',
}))

// Mock wagmi
jest.mock('wagmi', () => ({
  useAccount: jest.fn(() => ({
    address: undefined,
    isConnected: false,
  })),
  useDisconnect: jest.fn(() => ({
    disconnect: jest.fn(),
  })),
  useConnect: jest.fn(() => ({
    connect: jest.fn(),
    connectAsync: jest.fn(),
    connectors: [],
  })),
  useSignMessage: jest.fn(() => ({
    signMessage: jest.fn(),
    signMessageAsync: jest.fn(),
  })),
}))

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props) => {
    const { fill, priority, quality, placeholder, blurDataURL, loader, unoptimized, ...imgProps } = props
    // eslint-disable-next-line jsx-a11y/alt-text
    return <img {...imgProps} />
  },
}))

// Prisma is mocked individually in tests that need it

// Setup fetch mock
global.fetch = jest.fn()

// Mocking window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})
