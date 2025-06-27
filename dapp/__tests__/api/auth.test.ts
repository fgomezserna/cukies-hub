import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/login/route'

// Mock Prisma module
const mockFindUnique = jest.fn()
const mockCreate = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      create: mockCreate,
    },
  },
}))

describe('API /auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  const mockUser = {
    id: '1',
    walletAddress: '0x123456789abcdef',
    username: 'user_0x1234',
    email: null,
    profilePictureUrl: null,
    xp: 0,
    twitterHandle: null,
    discordUsername: null,
    telegramUsername: null,
    referralCode: null,
    referredById: null,
    referralRewards: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastCheckIn: null,
    completedQuests: [],
  }

  it('should return existing user when wallet address exists', async () => {
    const walletAddress = '0x123456789ABCDEF'
    
    mockFindUnique.mockResolvedValue(mockUser)

    const request = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual(mockUser)
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        walletAddress: walletAddress.toLowerCase(),
      },
      include: {
        lastCheckIn: true,
        completedQuests: {
          include: {
            quest: true,
          },
        },
      },
    })
  })

  it('should create new user when wallet address does not exist', async () => {
    const walletAddress = '0x123456789ABCDEF'
    const newUser = {
      id: '2',
      walletAddress: walletAddress.toLowerCase(),
      username: `user_${walletAddress.toLowerCase().slice(0, 6)}`,
    }

    // First call returns null (user doesn't exist)
    // Second call returns the created user with includes
    mockFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockUser)
    
    mockCreate.mockResolvedValue(newUser as any)

    const request = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toEqual(mockUser)
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        walletAddress: walletAddress.toLowerCase(),
        username: `user_${walletAddress.toLowerCase().slice(0, 6)}`,
      },
    })
  })

  it('should convert wallet address to lowercase', async () => {
    const walletAddress = '0X123456789ABCDEF'
    
    mockFindUnique.mockResolvedValue(mockUser)

    const request = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    })

    await POST(request)

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        walletAddress: walletAddress.toLowerCase(),
      },
      include: {
        lastCheckIn: true,
        completedQuests: {
          include: {
            quest: true,
          },
        },
      },
    })
  })

  it('should return 400 when wallet address is missing', async () => {
    const request = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({}),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Wallet address is required')
  })

  it('should return 400 when wallet address is not a string', async () => {
    const request = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: 123 }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Wallet address is required')
  })

  it('should return 400 when wallet address is empty string', async () => {
    const request = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: '' }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Wallet address is required')
  })

  it('should return 500 when database error occurs', async () => {
    const walletAddress = '0x123456789ABCDEF'
    
    mockFindUnique.mockRejectedValue(new Error('Database error'))

    const request = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Internal Server Error')
  })

  it('should handle JSON parsing errors', async () => {
    const request = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: 'invalid json',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Internal Server Error')
  })

  it('should include correct relations when fetching existing user', async () => {
    const walletAddress = '0x123456789ABCDEF'
    
    mockFindUnique.mockResolvedValue(mockUser)

    const request = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    })

    await POST(request)

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        walletAddress: walletAddress.toLowerCase(),
      },
      include: {
        lastCheckIn: true,
        completedQuests: {
          include: {
            quest: true,
          },
        },
      },
    })
  })

  it('should include correct relations when fetching newly created user', async () => {
    const walletAddress = '0x123456789ABCDEF'
    const newUser = {
      id: '2',
      walletAddress: walletAddress.toLowerCase(),
      username: `user_${walletAddress.toLowerCase().slice(0, 6)}`,
    }

    mockFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockUser)
    
    mockCreate.mockResolvedValue(newUser as any)

    const request = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    })

    await POST(request)

    // Should call findUnique twice: once to check if user exists, once to fetch with includes
    expect(mockFindUnique).toHaveBeenCalledTimes(2)
    
    // Second call should include relations
    expect(mockFindUnique).toHaveBeenLastCalledWith({
      where: {
        id: newUser.id,
      },
      include: {
        lastCheckIn: true,
        completedQuests: {
          include: {
            quest: true,
          },
        },
      },
    })
  })
})