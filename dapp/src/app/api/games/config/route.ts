import { NextRequest, NextResponse } from 'next/server';
import { GameConfig } from '@/types/game';

// Temporary mock data until we implement the database integration
const MOCK_GAME_CONFIGS: Record<string, GameConfig> = {
  'sybil-slayer': {
    id: 'mock-id-1',
    gameId: 'sybil-slayer',
    name: 'Treasure Hunt',
    description: "Collect as fast as you can and don't get caught!",
    emoji: '🎮',
    gameUrl: process.env.GAME_SYBILSLASH || 'http://localhost:9002/',
    port: 9002,
    ranks: [
      { xp: 50000, name: 'Hyppie Master', icon: 'Crown', color: 'text-yellow-400' },
      { xp: 20000, name: 'Hyperliquid Veteran', icon: 'Medal', color: 'text-purple-400' },
      { xp: 10000, name: 'Sybil Slayer', icon: 'Trophy', color: 'text-orange-400' },
      { xp: 5000, name: 'Experimented Hyppie', icon: 'Star', color: 'text-blue-400' },
      { xp: 2500, name: 'Explorer', icon: 'Star', color: 'text-pink-500' },
    ],
    leaderboardTitle: 'Top Slayers',
    playInstructions: [
      { icon: 'Gamepad2', text: 'PLAY' },
      { icon: 'Heart', text: 'HAVE FUN' },
      { icon: 'Trophy', text: 'EARN XP' }
    ],
    isActive: true,
    isInMaintenance: false,
    version: '1.0.0',
    category: 'arcade',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  'hyppie-road': {
    id: 'mock-id-2',
    gameId: 'hyppie-road',
    name: 'Hyppie Road',
    description: 'Navigate the crypto road, avoid traps, and multiply your rewards in this thrilling betting game.',
    emoji: '🛣️',
    gameUrl: process.env.GAME_HYPPIE_ROAD || 'http://localhost:9003/',
    port: 9003,
    ranks: [
      { xp: 50000, name: 'Road Legend', icon: 'Crown', color: 'text-yellow-400' },
      { xp: 20000, name: 'Highway Master', icon: 'Medal', color: 'text-purple-400' },
      { xp: 10000, name: 'Speed Demon', icon: 'Trophy', color: 'text-orange-400' },
      { xp: 5000, name: 'Experienced Driver', icon: 'Gamepad2', color: 'text-blue-400' },
      { xp: 2500, name: 'Road Explorer', icon: 'Star', color: 'text-pink-500' },
    ],
    leaderboardTitle: 'Top Riders',
    playInstructions: [
      { icon: 'Gamepad2', text: 'PLAY' },
      { icon: 'Heart', text: 'HAVE FUN' },
      { icon: 'Trophy', text: 'EARN XP' }
    ],
    isActive: true,
    isInMaintenance: false,
    version: '1.0.0',
    category: 'betting',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  'tower-builder': {
    id: 'mock-id-3',
    gameId: 'tower-builder',
    name: 'Hyppie Tower',
    description: 'Stack blocks as high as you can in this precision-based tower building game.',
    emoji: '🏗️',
    gameUrl: process.env.GAME_TOWER_BUILDER || 'http://localhost:9004/',
    port: 9004,
    ranks: [
      { xp: 50000, name: 'Master Architect', icon: 'Crown', color: 'text-yellow-400' },
      { xp: 20000, name: 'Building Expert', icon: 'Medal', color: 'text-purple-400' },
      { xp: 10000, name: 'Tower Master', icon: 'Trophy', color: 'text-orange-400' },
      { xp: 5000, name: 'Skilled Builder', icon: 'Star', color: 'text-blue-400' },
      { xp: 2500, name: 'Construction Worker', icon: 'Star', color: 'text-pink-500' },
    ],
    leaderboardTitle: 'Top Hyppie Builders',
    playInstructions: [
      { icon: 'Gamepad2', text: 'BUILD' },
      { icon: 'Heart', text: 'STACK HIGH' },
      { icon: 'Trophy', text: 'EARN XP' }
    ],
    isActive: true,
    isInMaintenance: false,
    version: '1.0.0',
    category: 'arcade',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('gameId');

    if (!gameId) {
      return NextResponse.json(
        { error: 'gameId parameter is required' },
        { status: 400 }
      );
    }

    const gameConfig = MOCK_GAME_CONFIGS[gameId];

    if (!gameConfig) {
      return NextResponse.json(
        { error: 'Game configuration not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(gameConfig);

  } catch (error) {
    console.error('Error fetching game config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}