import { render, screen, waitFor } from '@testing-library/react'
import StatsCards from '@/components/home/stats-cards'
import { useAuth } from '@/providers/auth-provider'
import { User } from '@/types'

// Mock the auth provider
jest.mock('@/providers/auth-provider')
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

// Mock fetch globally
global.fetch = jest.fn()

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  Star: ({ className }: { className?: string }) => <div data-testid="star-icon" className={className} />,
  TrendingUp: ({ className }: { className?: string }) => <div data-testid="trending-up-icon" className={className} />,
  Users: ({ className }: { className?: string }) => <div data-testid="users-icon" className={className} />,
  Coins: ({ className }: { className?: string }) => <div data-testid="coins-icon" className={className} />,
}))

describe('components/home/StatsCards', () => {
  const mockUser: User = {
    id: '1',
    walletAddress: '0x123456789',
    username: 'testuser',
    email: 'test@example.com',
    profilePictureUrl: null,
    xp: 1500,
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
    // Mock successful API response
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        totalUsers: 12345,
        totalSessions: 5678,
        totalXpDistributed: 1234567,
        userStats: {
          totalXp: 1500,
          referralRewards: 0,
          rank: 1234,
          totalSessions: 10,
        },
      }),
    })
  })

  it('should render all stat cards', () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      isLoading: false,
      isWaitingForApproval: false,
      fetchUser: jest.fn(),
      isWaitingForApproval: false,
    })

    render(<StatsCards />)

    expect(screen.getByText('My XP')).toBeInTheDocument()
    expect(screen.getByText('My Rank')).toBeInTheDocument()
    expect(screen.getByText('Total Players')).toBeInTheDocument()
    expect(screen.getByText('Total XP')).toBeInTheDocument()
  })

  it('should display user XP when user is available', async () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      isLoading: false,
      isWaitingForApproval: false,
      fetchUser: jest.fn(),
      isWaitingForApproval: false,
    })

    render(<StatsCards />)

    await waitFor(() => {
      expect(screen.getByText('1,500')).toBeInTheDocument()
    })
  })

  it('should display placeholder when user is not available', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      isWaitingForApproval: false,
      fetchUser: jest.fn(),
      isWaitingForApproval: false,
    })

    render(<StatsCards />)

    expect(screen.getByText('--')).toBeInTheDocument()
  })

  it('should display placeholder when user is loading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: true,
      isWaitingForApproval: false,
      fetchUser: jest.fn(),
      isWaitingForApproval: false,
    })

    render(<StatsCards />)

    expect(screen.getByText('--')).toBeInTheDocument()
  })

  it('should render correct icons', () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      isLoading: false,
      isWaitingForApproval: false,
      fetchUser: jest.fn(),
      isWaitingForApproval: false,
    })

    render(<StatsCards />)

    expect(screen.getByTestId('star-icon')).toBeInTheDocument()
    expect(screen.getByTestId('trending-up-icon')).toBeInTheDocument()
    expect(screen.getByTestId('users-icon')).toBeInTheDocument()
    expect(screen.getByTestId('coins-icon')).toBeInTheDocument()
  })

  it('should format XP with commas', () => {
    const userWithHighXP = {
      ...mockUser,
      xp: 1234567,
    }

    mockUseAuth.mockReturnValue({
      user: userWithHighXP,
      isLoading: false,
      isWaitingForApproval: false,
      fetchUser: jest.fn(),
      isWaitingForApproval: false,
    })

    render(<StatsCards />)

    expect(screen.getByText('1,234,567')).toBeInTheDocument()
  })

  it('should handle zero XP', () => {
    const userWithZeroXP = {
      ...mockUser,
      xp: 0,
    }

    mockUseAuth.mockReturnValue({
      user: userWithZeroXP,
      isLoading: false,
      isWaitingForApproval: false,
      fetchUser: jest.fn(),
      isWaitingForApproval: false,
    })

    render(<StatsCards />)

    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('should render dynamic values for rank, total players, and total XP', async () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      isLoading: false,
      isWaitingForApproval: false,
      fetchUser: jest.fn(),
      isWaitingForApproval: false,
    })

    render(<StatsCards />)

    await waitFor(() => {
      expect(screen.getByText('#1,234')).toBeInTheDocument()
      expect(screen.getByText('12,345')).toBeInTheDocument()
      expect(screen.getByText('1,234,567')).toBeInTheDocument()
    })
  })

  it('should have correct grid layout classes', () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      isLoading: false,
      isWaitingForApproval: false,
      fetchUser: jest.fn(),
      isWaitingForApproval: false,
    })

    const { container } = render(<StatsCards />)
    const gridContainer = container.firstChild

    expect(gridContainer).toHaveClass('grid', 'gap-4', 'md:grid-cols-2', 'lg:grid-cols-4')
  })

  it('should render card structure correctly', async () => {
    mockUseAuth.mockReturnValue({
      user: mockUser,
      isLoading: false,
      isWaitingForApproval: false,
      fetchUser: jest.fn(),
      isWaitingForApproval: false,
    })

    render(<StatsCards />)

    // Check that each stat has both title and value
    await waitFor(() => {
      const myXpCard = screen.getByText('My XP').closest('div')
      expect(myXpCard).toContainElement(screen.getByText('1,500'))

      const myRankCard = screen.getByText('My Rank').closest('div')
      expect(myRankCard).toContainElement(screen.getByText('#1,234'))
    })
  })
})