import { render, screen, waitFor, within } from '@testing-library/react'
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

  const mockAuthValue = (user: User | null, isLoading = false) => ({
    user,
    isLoading,
    isWaitingForApproval: false,
    walletType: null,
    fetchUser: jest.fn(),
  })

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
    mockUseAuth.mockReturnValue(mockAuthValue(mockUser))

    render(<StatsCards />)

    expect(screen.getByText('My XP')).toBeInTheDocument()
    expect(screen.getByText('My Rank')).toBeInTheDocument()
    expect(screen.getByText('Total Players')).toBeInTheDocument()
    expect(screen.getByText('Total XP')).toBeInTheDocument()
  })

  it('should display user XP when user is available', async () => {
    mockUseAuth.mockReturnValue(mockAuthValue(mockUser))

    render(<StatsCards />)

    await waitFor(() => {
      expect(screen.getByText('1,500')).toBeInTheDocument()
    })
  })

  it('should display placeholder when user is not available', () => {
    mockUseAuth.mockReturnValue(mockAuthValue(null))
    ;(global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}))

    render(<StatsCards />)

    expect(screen.getAllByText('--')).toHaveLength(4)
  })

  it('should display placeholders while platform stats are loading', () => {
    mockUseAuth.mockReturnValue(mockAuthValue(null, true))
    ;(global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}))

    render(<StatsCards />)

    expect(screen.getAllByText('--')).toHaveLength(4)
  })

  it('should render correct icons', () => {
    mockUseAuth.mockReturnValue(mockAuthValue(mockUser))

    render(<StatsCards />)

    expect(screen.getByTestId('star-icon')).toBeInTheDocument()
    expect(screen.getByTestId('trending-up-icon')).toBeInTheDocument()
    expect(screen.getByTestId('users-icon')).toBeInTheDocument()
    expect(screen.getByTestId('coins-icon')).toBeInTheDocument()
  })

  it('should format XP with commas', async () => {
    const userWithHighXP = {
      ...mockUser,
      xp: 1234567,
    }

    mockUseAuth.mockReturnValue(mockAuthValue(userWithHighXP))

    render(<StatsCards />)

    await waitFor(() => {
      const myXpCard = screen.getByRole('heading', { name: 'My XP' }).closest('.rounded-lg')
      expect(myXpCard).not.toBeNull()
      expect(within(myXpCard as HTMLElement).getByText('1,234,567')).toBeInTheDocument()
    })
  })

  it('should handle zero XP', async () => {
    const userWithZeroXP = {
      ...mockUser,
      xp: 0,
    }

    mockUseAuth.mockReturnValue(mockAuthValue(userWithZeroXP))

    render(<StatsCards />)

    await waitFor(() => {
      expect(screen.getByText('0')).toBeInTheDocument()
    })
  })

  it('should render dynamic values for rank, total players, and total XP', async () => {
    mockUseAuth.mockReturnValue(mockAuthValue(mockUser))

    render(<StatsCards />)

    await waitFor(() => {
      expect(screen.getByText('#1,234')).toBeInTheDocument()
      expect(screen.getByText('12,345')).toBeInTheDocument()
      expect(screen.getByText('1,234,567')).toBeInTheDocument()
    })
  })

  it('should have correct grid layout classes', () => {
    mockUseAuth.mockReturnValue(mockAuthValue(mockUser))

    const { container } = render(<StatsCards />)
    const gridContainer = container.firstChild

    expect(gridContainer).toHaveClass('grid', 'gap-6', 'md:grid-cols-2', 'lg:grid-cols-4')
  })

  it('should render card structure correctly', async () => {
    mockUseAuth.mockReturnValue(mockAuthValue(mockUser))

    render(<StatsCards />)

    // Check that each stat has both title and value
    await waitFor(() => {
      const myXpCard = screen.getByRole('heading', { name: 'My XP' }).closest('.rounded-lg')
      expect(myXpCard).toContainElement(screen.getByText('1,500'))

      const myRankCard = screen.getByRole('heading', { name: 'My Rank' }).closest('.rounded-lg')
      expect(myRankCard).toContainElement(screen.getByText('#1,234'))
    })
  })
})
