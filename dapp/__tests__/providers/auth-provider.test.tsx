import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '@/providers/auth-provider'
import { useAccount, useDisconnect } from 'wagmi'

// Mock wagmi hooks
jest.mock('wagmi')
const mockUseAccount = useAccount as jest.MockedFunction<typeof useAccount>
const mockUseDisconnect = useDisconnect as jest.MockedFunction<typeof useDisconnect>

// Mock fetch
const mockFetch = global.fetch as jest.MockedFunction<typeof global.fetch>

// Test component that uses the auth context
const TestComponent = () => {
  const { user, isLoading, fetchUser } = useAuth()

  return (
    <div>
      <div data-testid="loading">{isLoading ? 'loading' : 'not-loading'}</div>
      <div data-testid="user">{user ? user.username : 'no-user'}</div>
      <button onClick={fetchUser} data-testid="fetch-user">
        Fetch User
      </button>
    </div>
  )
}

describe('providers/AuthProvider', () => {
  const mockDisconnect = jest.fn()
  const mockUser = {
    id: '1',
    walletAddress: '0x123456789',
    username: 'testuser',
    email: null,
    profilePictureUrl: null,
    xp: 100,
    twitterHandle: null,
    discordUsername: null,
    telegramUsername: null,
    referralCode: null,
    referredById: null,
    referralRewards: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastCheckIn: null,
    completedQuests: [],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockUseDisconnect.mockReturnValue({
      disconnect: mockDisconnect,
    } as any)

    // Mock successful fetch response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockUser,
    } as Response)
  })

  it('should provide initial auth context values', () => {
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
    expect(screen.getByTestId('user')).toHaveTextContent('no-user')
  })

  it('should fetch user when wallet is connected', async () => {
    const walletAddress = '0x123456789'
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      isConnected: true,
    } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('testuser')
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    })
  })

  it('should not fetch user when wallet is not connected', () => {
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(mockFetch).not.toHaveBeenCalled()
    expect(screen.getByTestId('user')).toHaveTextContent('no-user')
  })

  it('should handle fetch errors and disconnect wallet', async () => {
    const walletAddress = '0x123456789'
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      isConnected: true,
    } as any)

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    } as Response)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(mockDisconnect).toHaveBeenCalled()
    })

    expect(screen.getByTestId('user')).toHaveTextContent('no-user')
  })

  it('should handle network errors and disconnect wallet', async () => {
    const walletAddress = '0x123456789'
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      isConnected: true,
    } as any)

    mockFetch.mockRejectedValue(new Error('Network error'))

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(mockDisconnect).toHaveBeenCalled()
    })

    expect(screen.getByTestId('user')).toHaveTextContent('no-user')
  })

  it('should set loading state correctly during fetch', async () => {
    const walletAddress = '0x123456789'
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      isConnected: true,
    } as any)

    // Mock a delayed response
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => mockUser,
              } as Response),
            100
          )
        })
    )

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    // Should start with loading
    expect(screen.getByTestId('loading')).toHaveTextContent('loading')

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('not-loading')
    })

    expect(screen.getByTestId('user')).toHaveTextContent('testuser')
  })

  it('should allow manual user refetch', async () => {
    const walletAddress = '0x123456789'
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      isConnected: true,
    } as any)

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    // Wait for initial fetch
    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('testuser')
    })

    // Clear mock calls
    mockFetch.mockClear()

    // Trigger manual refetch
    const fetchButton = screen.getByTestId('fetch-user')
    fetchButton.click()

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  it('should update user when wallet address changes', async () => {
    const { rerender } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    // Initially no wallet connected
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    } as any)

    rerender(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(screen.getByTestId('user')).toHaveTextContent('no-user')

    // Connect wallet
    const walletAddress = '0x123456789'
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      isConnected: true,
    } as any)

    rerender(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('testuser')
    })
  })

  it('should clear user when wallet disconnects', async () => {
    const walletAddress = '0x123456789'
    
    // Start with connected wallet
    mockUseAccount.mockReturnValue({
      address: walletAddress,
      isConnected: true,
    } as any)

    const { rerender } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('testuser')
    })

    // Disconnect wallet
    mockUseAccount.mockReturnValue({
      address: undefined,
      isConnected: false,
    } as any)

    rerender(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(screen.getByTestId('user')).toHaveTextContent('no-user')
  })

  it('should throw error when useAuth is used outside AuthProvider', () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      render(<TestComponent />)
    }).toThrow('useAuth must be used within an AuthProvider')

    consoleSpy.mockRestore()
  })
})