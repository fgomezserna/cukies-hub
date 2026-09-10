import { gameEnv } from '@cukies/world-shared';
import { Output } from '@cukies/world-shared';
import { UserMap, UserMapDocument } from '@cukies/world-shared';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as jwt from 'jsonwebtoken';
import { Model, Types } from 'mongoose';
import { CukiService } from '../cuki/cuki.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  IslandEconomyInventoryDeltaDto,
  IslandEconomyMutationDto,
  IslandEconomyXpDeltaDto,
} from './dto/islandEconomyMutation.dto';

interface IslandJoinTokenPayload extends jwt.JwtPayload {
  type?: string;
  islandId?: string;
  sessionId?: string;
  userId?: string;
  env?: string;
  namespace?: string;
}

interface IslandEconomyItemMutation {
  id: string;
  amount: number;
  slot: number;
  durability: number;
}

interface IslandEconomyInventorySnapshot {
  content?: Array<{
    id?: string;
    amount?: number;
    slot?: number;
  }>;
  slots?: number;
}

@Injectable()
export class IslandEconomyService {
  private readonly maxIslandEconomyMutations = 500;

  constructor(
    private readonly inventoryService: InventoryService,
    private readonly cukiService: CukiService,
    @InjectModel(UserMap.name, 'gameDB')
    private readonly userMapModel: Model<UserMapDocument>
  ) {}

  async applyIslandEconomyMutation(params: {
    islandId: string;
    mutationDto: IslandEconomyMutationDto;
    serverToken?: string;
  }): Promise<Output> {
    this.assertServerToken(params.serverToken);
    const islandId = this.requireString(params.islandId, 'islandId');
    const mutationDto = params.mutationDto ?? ({} as IslandEconomyMutationDto);
    const sessionId = this.requireString(mutationDto.sessionId, 'sessionId');
    const cukiId = this.requireString(mutationDto.cukiId, 'cukiId');
    const joinToken = this.requireString(mutationDto.joinToken, 'joinToken');
    const mutationId = this.requireString(mutationDto.mutationId, 'mutationId');
    const payload = this.verifyJoinToken(joinToken);

    if (payload.islandId !== islandId || payload.sessionId !== sessionId) {
      throw new HttpException(
        'Island join token does not match mutation scope',
        HttpStatus.FORBIDDEN
      );
    }

    const inventoryDeltas = this.normalizeInventoryDeltas(
      mutationDto.inventoryDeltas
    );
    const xpDeltas = this.normalizeXpDeltas(mutationDto.xpDeltas);
    if (inventoryDeltas.length === 0 && xpDeltas.length === 0) {
      throw new HttpException(
        'At least one inventory or XP delta is required',
        HttpStatus.BAD_REQUEST
      );
    }

    await this.cukiService.checkCukiOwner({
      userId: payload.userId,
      cukiId,
    });

    const reservedMutation = await this.reserveEconomyMutation({
      islandId,
      sessionId,
      userId: payload.userId,
      cukiId,
      mutationId,
      inventoryDeltas,
      xpDeltas,
    });

    if (reservedMutation.bAlreadyApplied) {
      return this.buildAppliedEconomyMutationOutput({
        islandId,
        sessionId,
        userId: payload.userId,
        cukiId,
        mutationId,
        inventoryMutationsApplied:
          reservedMutation.inventoryMutationsApplied ?? 0,
        xpMutationsApplied: reservedMutation.xpMutationsApplied ?? 0,
        idempotentReplay: true,
      });
    }

    const addItemMutations = await this.buildAddInventoryMutations({
      userId: payload.userId,
      cukiId,
      deltas: inventoryDeltas.filter((delta) => delta.amount > 0),
    });
    const removeItemMutations = this.buildInventoryMutations(
      inventoryDeltas.filter((delta) => delta.amount < 0)
    );
    const appliedAddItemMutations: IslandEconomyItemMutation[] = [];
    const appliedRemoveItemMutations: IslandEconomyItemMutation[] = [];
    let bSideEffectsCompleted = false;

    for (const xpDelta of xpDeltas) {
      this.assertValidXpSkill(xpDelta.skill);
    }

    try {
      if (removeItemMutations.length > 0) {
        await this.inventoryService.removeItemsFromInventory({
          userId: payload.userId,
          itemContentDto: removeItemMutations,
          cukiId,
        });
        appliedRemoveItemMutations.push(...removeItemMutations);
      }

      if (addItemMutations.length > 0) {
        await this.inventoryService.addItemsToInventory({
          userId: payload.userId,
          itemContentDto: addItemMutations,
          cukiId,
        });
        appliedAddItemMutations.push(...addItemMutations);
      }

      if (xpDeltas.length > 0) {
        await this.cukiService.addExpDeltasToCuki({
          userId: payload.userId,
          cukiId,
          expDtos: xpDeltas,
        });
      }

      bSideEffectsCompleted = true;
      await this.markEconomyMutationApplied({
        userMapId: reservedMutation.userMapId,
        mutationId,
        inventoryMutationsApplied: inventoryDeltas.length,
        xpMutationsApplied: xpDeltas.length,
      });
    } catch (error) {
      if (bSideEffectsCompleted) {
        throw error;
      }
      const bCompensated = await this.compensateAppliedInventoryMutations({
        userId: payload.userId,
        cukiId,
        appliedAddItemMutations,
        appliedRemoveItemMutations,
      });
      if (!bCompensated) {
        await this.markEconomyMutationFailed({
          userMapId: reservedMutation.userMapId,
          mutationId,
          reason: this.normalizeErrorMessage(error),
        });
        throw error;
      }
      await this.releaseReservedEconomyMutation(
        reservedMutation.userMapId,
        mutationId
      );
      throw error;
    }

    return this.buildAppliedEconomyMutationOutput({
      islandId,
      sessionId,
      userId: payload.userId,
      cukiId,
      mutationId,
      inventoryMutationsApplied: inventoryDeltas.length,
      xpMutationsApplied: xpDeltas.length,
    });
  }

  async getIslandEconomyMutationStatus(params: {
    islandId: string;
    mutationId: string;
    serverToken?: string;
  }): Promise<Output> {
    this.assertServerToken(params.serverToken);
    const islandId = this.requireString(params.islandId, 'islandId');
    const mutationId = this.requireString(params.mutationId, 'mutationId');
    const mutation = await this.findEconomyMutation({ islandId, mutationId });

    if (!mutation) {
      throw new HttpException(
        'Island economy mutation not found',
        HttpStatus.NOT_FOUND
      );
    }

    return {
      totalCount: 1,
      results: [this.buildEconomyMutationStatusOutput(mutation)],
    };
  }

  private async reserveEconomyMutation(params: {
    islandId: string;
    sessionId: string;
    userId: string;
    cukiId: string;
    mutationId: string;
    inventoryDeltas: IslandEconomyInventoryDeltaDto[];
    xpDeltas: IslandEconomyXpDeltaDto[];
  }): Promise<{
    userMapId: string;
    bAlreadyApplied: boolean;
    inventoryMutationsApplied?: number;
    xpMutationsApplied?: number;
  }> {
    const now = new Date().toISOString();
    const reservation = {
      mutationId: params.mutationId,
      status: 'pending',
      islandId: params.islandId,
      sessionId: params.sessionId,
      userId: params.userId,
      cukiId: params.cukiId,
      inventoryDeltas: params.inventoryDeltas,
      xpDeltas: params.xpDeltas,
      createdAt: now,
    };

    const reservedMap = await this.userMapModel.findOneAndUpdate(
      {
        $and: [
          this.buildIslandLookup(params.islandId),
          {
            'islandEconomyMutations.mutationId': {
              $ne: params.mutationId,
            },
          },
        ],
      },
      {
        $push: {
          islandEconomyMutations: {
            $each: [reservation],
            $slice: -this.maxIslandEconomyMutations,
          },
        },
      },
      { new: true }
    );

    if (reservedMap) {
      return {
        userMapId: String(reservedMap['_id']),
        bAlreadyApplied: false,
      };
    }

    const existingMutationMap = await this.userMapModel.findOne({
      $and: [
        this.buildIslandLookup(params.islandId),
        { 'islandEconomyMutations.mutationId': params.mutationId },
      ],
    });

    if (!existingMutationMap) {
      throw new HttpException('Island map not found', HttpStatus.NOT_FOUND);
    }

    const islandEconomyMutations = existingMutationMap[
      'islandEconomyMutations'
    ] as Array<Record<string, unknown>> | undefined;
    const existingMutation = this.findMutationInLedger(
      islandEconomyMutations,
      params.mutationId
    );

    if (existingMutation?.status === 'applied') {
      return {
        userMapId: String(existingMutationMap['_id']),
        bAlreadyApplied: true,
        inventoryMutationsApplied:
          Number(existingMutation.inventoryMutationsApplied) || 0,
        xpMutationsApplied: Number(existingMutation.xpMutationsApplied) || 0,
      };
    }

    if (existingMutation?.status === 'failed') {
      throw new HttpException(
        'Island economy mutation failed and requires reconciliation',
        HttpStatus.CONFLICT
      );
    }

    throw new HttpException(
      'Island economy mutation is already pending',
      HttpStatus.CONFLICT
    );
  }

  private async findEconomyMutation(params: {
    islandId: string;
    mutationId: string;
  }): Promise<Record<string, unknown> | undefined> {
    const mutationMap = await this.userMapModel.findOne({
      $and: [
        this.buildIslandLookup(params.islandId),
        { 'islandEconomyMutations.mutationId': params.mutationId },
      ],
    });

    if (!mutationMap) {
      return undefined;
    }

    const islandEconomyMutations = mutationMap['islandEconomyMutations'] as
      | Array<Record<string, unknown>>
      | undefined;
    return this.findMutationInLedger(islandEconomyMutations, params.mutationId);
  }

  private findMutationInLedger(
    islandEconomyMutations: Array<Record<string, unknown>> | undefined,
    mutationId: string
  ): Record<string, unknown> | undefined {
    return Array.isArray(islandEconomyMutations)
      ? islandEconomyMutations.find(
          (mutation) => mutation?.mutationId === mutationId
        )
      : undefined;
  }

  private buildEconomyMutationStatusOutput(
    mutation: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      mutationId: mutation.mutationId,
      status: mutation.status || 'unknown',
      islandId: mutation.islandId,
      sessionId: mutation.sessionId,
      userId: mutation.userId,
      cukiId: mutation.cukiId,
      createdAt: mutation.createdAt,
      appliedAt: mutation.appliedAt,
      failedAt: mutation.failedAt,
      inventoryMutationsApplied:
        Number(mutation.inventoryMutationsApplied) || 0,
      xpMutationsApplied: Number(mutation.xpMutationsApplied) || 0,
      failureReason: mutation.failureReason,
      compensationFailed: mutation.compensationFailed === true,
    };
  }

  private buildInventoryMutations(
    deltas: IslandEconomyInventoryDeltaDto[]
  ): IslandEconomyItemMutation[] {
    return deltas.map((delta) => ({
      id: delta.id,
      amount: Math.abs(delta.amount),
      slot: delta.slot ?? 0,
      durability: delta.durability ?? 0,
    }));
  }

  private async buildAddInventoryMutations(params: {
    userId: string;
    cukiId: string;
    deltas: IslandEconomyInventoryDeltaDto[];
  }): Promise<IslandEconomyItemMutation[]> {
    if (params.deltas.length === 0) {
      return [];
    }

    if (params.deltas.every((delta) => delta.slot !== undefined)) {
      return this.buildInventoryMutations(params.deltas);
    }

    const inventory = await this.getInventorySnapshot({
      userId: params.userId,
      cukiId: params.cukiId,
    });
    const occupiedSlots = new Map<number, string>();
    const existingSlotsByItemId = new Map<string, number>();
    const slotLimit = Number.isInteger(inventory.slots) ? inventory.slots : 0;

    for (const contentItem of inventory.content ?? []) {
      if (
        !contentItem?.id ||
        !Number.isInteger(contentItem.slot) ||
        Number(contentItem.amount ?? 0) <= 0
      ) {
        continue;
      }

      occupiedSlots.set(contentItem.slot, contentItem.id);
      if (!existingSlotsByItemId.has(contentItem.id)) {
        existingSlotsByItemId.set(contentItem.id, contentItem.slot);
      }
    }

    return params.deltas.map((delta) => {
      const slot =
        delta.slot ??
        existingSlotsByItemId.get(delta.id) ??
        this.findFirstFreeInventorySlot(occupiedSlots, slotLimit);
      occupiedSlots.set(slot, delta.id);
      existingSlotsByItemId.set(delta.id, slot);

      return {
        id: delta.id,
        amount: Math.abs(delta.amount),
        slot,
        durability: delta.durability ?? 0,
      };
    });
  }

  private async getInventorySnapshot(params: {
    userId: string;
    cukiId: string;
  }): Promise<IslandEconomyInventorySnapshot> {
    const inventoryResults = await this.inventoryService.getInventory({
      userId: params.userId,
      cukiId: params.cukiId,
    });
    const inventory =
      'results' in inventoryResults ? inventoryResults.results?.[0] : undefined;
    if (!inventory) {
      throw new HttpException('Inventory not found', HttpStatus.NOT_FOUND);
    }

    return inventory as IslandEconomyInventorySnapshot;
  }

  private findFirstFreeInventorySlot(
    occupiedSlots: Map<number, string>,
    slotLimit: number
  ): number {
    for (let slot = 0; slot < slotLimit; slot += 1) {
      if (!occupiedSlots.has(slot)) {
        return slot;
      }
    }

    throw new HttpException('Inventory is full', HttpStatus.CONFLICT);
  }

  private async markEconomyMutationApplied(params: {
    userMapId: string;
    mutationId: string;
    inventoryMutationsApplied: number;
    xpMutationsApplied: number;
  }): Promise<void> {
    await this.userMapModel.updateOne(
      {
        _id: params.userMapId,
        'islandEconomyMutations.mutationId': params.mutationId,
      },
      {
        $set: {
          'islandEconomyMutations.$.status': 'applied',
          'islandEconomyMutations.$.appliedAt': new Date().toISOString(),
          'islandEconomyMutations.$.inventoryMutationsApplied':
            params.inventoryMutationsApplied,
          'islandEconomyMutations.$.xpMutationsApplied':
            params.xpMutationsApplied,
        },
      }
    );
  }

  private async markEconomyMutationFailed(params: {
    userMapId: string;
    mutationId: string;
    reason: string;
  }): Promise<void> {
    try {
      await this.userMapModel.updateOne(
        {
          _id: params.userMapId,
          'islandEconomyMutations.mutationId': params.mutationId,
        },
        {
          $set: {
            'islandEconomyMutations.$.status': 'failed',
            'islandEconomyMutations.$.failedAt': new Date().toISOString(),
            'islandEconomyMutations.$.failureReason': params.reason,
            'islandEconomyMutations.$.compensationFailed': true,
          },
        }
      );
    } catch {
      // Preserve the original mutation error; the stuck pending ledger blocks retries.
    }
  }

  private async releaseReservedEconomyMutation(
    userMapId: string,
    mutationId: string
  ): Promise<void> {
    try {
      await this.userMapModel.updateOne(
        { _id: userMapId },
        {
          $pull: {
            islandEconomyMutations: { mutationId },
          },
        }
      );
    } catch {
      // Best-effort cleanup; the original economy error remains the source of truth.
    }
  }

  private buildAppliedEconomyMutationOutput(params: {
    islandId: string;
    sessionId: string;
    userId: string;
    cukiId: string;
    mutationId: string;
    inventoryMutationsApplied: number;
    xpMutationsApplied: number;
    idempotentReplay?: boolean;
  }): Output {
    return {
      totalCount: 1,
      results: [
        {
          islandId: params.islandId,
          sessionId: params.sessionId,
          userId: params.userId,
          cukiId: params.cukiId,
          mutationId: params.mutationId,
          inventoryMutationsApplied: params.inventoryMutationsApplied,
          xpMutationsApplied: params.xpMutationsApplied,
          idempotentReplay: params.idempotentReplay || false,
        },
      ],
    };
  }

  private async compensateAppliedInventoryMutations(params: {
    userId: string;
    cukiId: string;
    appliedAddItemMutations: IslandEconomyItemMutation[];
    appliedRemoveItemMutations: IslandEconomyItemMutation[];
  }): Promise<boolean> {
    try {
      if (params.appliedAddItemMutations.length > 0) {
        await this.inventoryService.removeItemsFromInventory({
          userId: params.userId,
          cukiId: params.cukiId,
          itemContentDto: params.appliedAddItemMutations,
        });
      }

      if (params.appliedRemoveItemMutations.length > 0) {
        await this.inventoryService.addItemsToInventory({
          userId: params.userId,
          cukiId: params.cukiId,
          itemContentDto: params.appliedRemoveItemMutations,
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  private buildIslandLookup(islandId: string) {
    return Types.ObjectId.isValid(islandId)
      ? { $or: [{ _id: islandId }, { islandId }] }
      : { islandId };
  }

  private verifyJoinToken(joinToken: string): IslandJoinTokenPayload {
    let decoded: string | jwt.JwtPayload;
    try {
      decoded = jwt.verify(joinToken, this.getJoinTokenSecret(), {
        algorithms: ['HS256'],
        issuer: gameEnv.sessionIssuer,
        audience: gameEnv.sessionAudience,
      });
    } catch {
      throw new HttpException(
        'Invalid island join token',
        HttpStatus.FORBIDDEN
      );
    }

    if (typeof decoded === 'string') {
      throw new HttpException(
        'Invalid island join token',
        HttpStatus.FORBIDDEN
      );
    }

    const payload = decoded as IslandJoinTokenPayload;
    if (
      payload.type !== 'island-join' ||
      !payload.islandId ||
      !payload.sessionId ||
      !payload.userId ||
      payload.env !== gameEnv.appEnv ||
      payload.namespace !== gameEnv.namespace ||
      !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new HttpException(
        'Invalid island join token',
        HttpStatus.FORBIDDEN
      );
    }

    return payload;
  }

  private getJoinTokenSecret(): string {
    const secret = gameEnv.ISLAND_JOIN_SECRET;
    if (secret) {
      return secret;
    }
    if (process.env.NODE_ENV === 'test') {
      return 'test-island-join-secret';
    }
    throw new HttpException(
      'Island join token verification is not configured',
      HttpStatus.SERVICE_UNAVAILABLE
    );
  }

  private assertServerToken(serverToken?: string): void {
    const expectedToken = gameEnv.ISLAND_SERVER_ECONOMY_TOKEN;
    if (!expectedToken && process.env.NODE_ENV === 'test') {
      if (serverToken === 'test-island-economy-token') {
        return;
      }
      throw new HttpException(
        'Invalid island economy server token',
        HttpStatus.FORBIDDEN
      );
    }

    if (!expectedToken) {
      throw new HttpException(
        'Island economy server token is not configured',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    if (serverToken !== expectedToken) {
      throw new HttpException(
        'Invalid island economy server token',
        HttpStatus.FORBIDDEN
      );
    }
  }

  private normalizeInventoryDeltas(
    deltas?: IslandEconomyInventoryDeltaDto[]
  ): IslandEconomyInventoryDeltaDto[] {
    if (!Array.isArray(deltas)) {
      return [];
    }

    return deltas.map((delta) => {
      const id = this.requireString(delta?.id, 'inventoryDeltas.id');
      const amount = this.requireInteger(
        delta?.amount,
        'inventoryDeltas.amount'
      );
      if (amount === 0) {
        throw new HttpException(
          'inventoryDeltas.amount cannot be zero',
          HttpStatus.BAD_REQUEST
        );
      }

      return {
        id,
        amount,
        slot:
          delta.slot === undefined
            ? undefined
            : this.requireNonNegativeInteger(
                delta.slot,
                'inventoryDeltas.slot'
              ),
        durability:
          delta.durability === undefined
            ? undefined
            : this.requireNonNegativeInteger(
                delta.durability,
                'inventoryDeltas.durability'
              ),
      };
    });
  }

  private normalizeXpDeltas(
    deltas?: IslandEconomyXpDeltaDto[]
  ): IslandEconomyXpDeltaDto[] {
    if (!Array.isArray(deltas)) {
      return [];
    }

    return deltas.map((delta) => ({
      skill: this.requireString(delta?.skill, 'xpDeltas.skill'),
      exp: this.requirePositiveNumber(delta?.exp, 'xpDeltas.exp'),
    }));
  }

  private assertValidXpSkill(skill: string): void {
    const allowedSkills = [
      'miner',
      'engineer',
      'farmer',
      'gatherer',
      'scout',
      'breeder',
      'life',
      'energy',
      'generation',
      'cook',
    ];
    if (!allowedSkills.includes(skill)) {
      throw new HttpException('Invalid skill', HttpStatus.BAD_REQUEST);
    }
  }

  private normalizeErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Island economy mutation failed';
  }

  private requireString(value: unknown, field: string): string {
    const normalized = `${value ?? ''}`.trim();
    if (!normalized) {
      throw new HttpException(`${field} is required`, HttpStatus.BAD_REQUEST);
    }
    return normalized;
  }

  private requireInteger(value: unknown, field: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new HttpException(
        `${field} must be an integer`,
        HttpStatus.BAD_REQUEST
      );
    }
    return parsed;
  }

  private requireNonNegativeInteger(value: unknown, field: string): number {
    const parsed = this.requireInteger(value, field);
    if (parsed < 0) {
      throw new HttpException(
        `${field} must be zero or positive`,
        HttpStatus.BAD_REQUEST
      );
    }
    return parsed;
  }

  private requirePositiveNumber(value: unknown, field: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new HttpException(
        `${field} must be positive`,
        HttpStatus.BAD_REQUEST
      );
    }
    return parsed;
  }
}
