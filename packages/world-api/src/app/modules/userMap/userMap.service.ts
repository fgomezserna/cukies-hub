import { IGet, Output } from '@cukies/world-shared';
import { gameEnv } from '@cukies/world-shared';
import { CRUD } from '@cukies/world-shared';
import {
  ResourceMap,
  ResourceMapDocument,
  User,
  UserDocument,
  UserMap,
  UserMapDocument,
} from '@cukies/world-shared';
import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserService } from '../user/user.service';
import { BuildingTileDto } from './dto/buildingTile.dto';
import { CreateUserMapDto } from './dto/create-userMap.dto';
import { HouseAppliancesDto } from './dto/houseAppliances.dto';
import {
  IslandActionEventDto,
  IslandActionEventsDto,
} from './dto/islandActionEvent.dto';
import {
  IslandChatReportDto,
  IslandChatReportsDto,
} from './dto/islandChatReport.dto';
import {
  IslandChatBlocksDto,
  IslandChatBlockTargetDto,
} from './dto/islandChatBlock.dto';
import {
  IslandChatMessageDto,
  IslandChatMessagesDto,
} from './dto/islandChatMessage.dto';
import { MapTileDto } from './dto/mapTile.dto';
import { MapTileCoordinatesDto } from './dto/mapTileCoordinates';
import { MapTileRangeDto } from './dto/mapTileRange.dto';
import { UpdateUserMapDto } from './dto/update-userMap.dto';

@Injectable()
export class UserMapService implements OnModuleInit {
  private readonly generatedResourceMapNamePrefix = 'generated-current-';
  private readonly maxIslandActionEvents = 200;
  private readonly maxIslandActionEventBatchSize = 50;
  private readonly maxIslandChatMessages = 200;
  private readonly maxIslandChatMessageBatchSize = 50;
  private readonly maxIslandChatReports = 200;
  private readonly maxIslandChatReportBatchSize = 25;
  private readonly maxIslandChatBlocks = 500;
  private readonly maxIslandChatBlockTargets = 100;
  private userMapCRUD: CRUD = null;
  private userCRUD: CRUD = null;
  private resourceMapCRUD: CRUD = null;
  private userService: UserService;

  constructor(
    private moduleRef: ModuleRef,
    @InjectModel(UserMap.name, 'gameDB')
    private userMapModel: Model<UserMapDocument>,

    @InjectModel(User.name, 'cukiesDB')
    private userModel: Model<UserDocument>,

    @InjectModel(ResourceMap.name, 'gameDB')
    private resourceMapModel: Model<ResourceMapDocument>
  ) {
    this.userMapCRUD = new CRUD(this.userMapModel);
    this.userCRUD = new CRUD(this.userModel);
    this.resourceMapCRUD = new CRUD(this.resourceMapModel);
  }

  onModuleInit() {
    this.userService = this.moduleRef.get(UserService, { strict: false });
  }

  private toInteger(value: unknown, fieldName: string): number {
    if (
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      throw new HttpException(
        `${fieldName} is required`,
        HttpStatus.BAD_REQUEST
      );
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new HttpException(
        `${fieldName} must be an integer`,
        HttpStatus.BAD_REQUEST
      );
    }

    return parsed;
  }

  private normalizeStableIslandId(islandId: string): string {
    const normalizedIslandId = `${islandId ?? ''}`.trim();
    const globalAliases = new Set(['', 'current', 'default', 'me']);
    if (globalAliases.has(normalizedIslandId.toLowerCase())) {
      throw new HttpException(
        'A stable islandId is required',
        HttpStatus.BAD_REQUEST
      );
    }

    return normalizedIslandId;
  }

  private buildIslandLookup(islandId: string) {
    return Types.ObjectId.isValid(islandId)
      ? { $or: [{ _id: islandId }, { islandId }] }
      : { islandId };
  }

  private buildIslandShareOutput(params: {
    islandMap: { _id: unknown; islandId?: string };
    ownerUserId: string;
    targetUserId: string;
    shared: boolean;
  }): Output {
    const { islandMap, ownerUserId, targetUserId, shared } = params;
    const mapId = String(islandMap._id);

    return {
      totalCount: 1,
      results: [
        {
          islandId: islandMap.islandId || mapId,
          mapId,
          ownerUserId,
          targetUserId,
          shared,
        },
      ],
    };
  }

  private buildIslandAccessClaims(
    accessAllowed: boolean,
    isOwner: boolean
  ): {
    islandRole: 'owner' | 'guest' | 'none';
    islandPermissions: string[];
    canHarvest: boolean;
    canBuild: boolean;
    canManageAccess: boolean;
  } {
    if (!accessAllowed) {
      return {
        islandRole: 'none',
        islandPermissions: [],
        canHarvest: false,
        canBuild: false,
        canManageAccess: false,
      };
    }

    if (isOwner) {
      return {
        islandRole: 'owner',
        islandPermissions: ['harvest', 'build', 'manage-access'],
        canHarvest: true,
        canBuild: true,
        canManageAccess: true,
      };
    }

    return {
      islandRole: 'guest',
      islandPermissions: [],
      canHarvest: false,
      canBuild: false,
      canManageAccess: false,
    };
  }

  private assertIslandServerToken(serverToken?: string): void {
    const expectedToken = gameEnv.MATCHMAKING_SERVER_REGISTRATION_TOKEN;
    if (!expectedToken || serverToken !== expectedToken) {
      throw new HttpException(
        'Island server access denied',
        HttpStatus.FORBIDDEN
      );
    }
  }

  private async getUserMapDocument(userId: string) {
    const { userMap } = await this.getUserMapContext(userId);
    return userMap;
  }

  private hashString(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private async getAssignableResourceMap(userId: string) {
    const generatedFilter = {
      name: new RegExp(`^${this.generatedResourceMapNamePrefix}`),
    };
    const generatedCount = await this.resourceMapModel.countDocuments(
      generatedFilter
    );
    const filterQuery = generatedCount > 0 ? generatedFilter : {};
    const resourceMapCount =
      generatedCount > 0
        ? generatedCount
        : await this.resourceMapModel.countDocuments(filterQuery);

    if (resourceMapCount <= 0) {
      return null;
    }

    const selectedIndex = this.hashString(userId) % resourceMapCount;
    return this.resourceMapModel
      .findOne(filterQuery)
      .sort({ name: 1, _id: 1 })
      .skip(selectedIndex);
  }

  private async getUserMapContext(userId: string) {
    const userMap = await this.userMapCRUD.getOne({
      filterQuery: { user: userId },
      populate: ['baseMap'],
    });
    const document = userMap?.['results']?.[0];
    if (!document) {
      throw new HttpException('User map not found', HttpStatus.NOT_FOUND);
    }

    const resourceMap = document?.resourceMap?.data
      ? document.resourceMap
      : await this.resourceMapModel.findById(document.resourceMap);
    if (!resourceMap) {
      throw new HttpException(
        'Resource map not found',
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    return { userMap: document, resourceMap };
  }

  private async getIslandMapContext(userId: string, islandIdValue: string) {
    const islandId = this.normalizeStableIslandId(islandIdValue);
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const allowedMapIds = (user.maps ?? []).map((mapId) => String(mapId));
    const userMap = await this.userMapModel
      .findOne({
        $and: [
          this.buildIslandLookup(islandId),
          { $or: [{ user: userId }, { _id: { $in: allowedMapIds } }] },
        ],
      })
      .populate('baseMap');

    if (!userMap) {
      throw new HttpException('Island map not found', HttpStatus.NOT_FOUND);
    }

    const userMapDocument = userMap as any;
    const resourceMap = userMapDocument?.resourceMap?.data
      ? userMapDocument.resourceMap
      : await this.resourceMapModel.findById(userMapDocument.resourceMap);
    if (!resourceMap) {
      throw new HttpException(
        'Resource map not found',
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    return { userMap: userMapDocument, resourceMap };
  }

  private getGrid(userMap, section: string, key: string): any[][] {
    const grid = userMap?.data?.[section]?.[key];
    if (!Array.isArray(grid)) {
      throw new HttpException(
        'Invalid user map data',
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    return grid;
  }

  private getBaseGrid(resourceMap, section: string, key: string): any[][] {
    const grid = resourceMap?.data?.[section]?.[key];
    if (!Array.isArray(grid)) {
      throw new HttpException(
        'Invalid resource map data',
        HttpStatus.UNPROCESSABLE_ENTITY
      );
    }

    return grid;
  }

  private normalizeCoordinates(
    grid: any[][],
    xValue: unknown,
    yValue: unknown
  ) {
    const x = this.toInteger(xValue, 'x');
    const y = this.toInteger(yValue, 'y');
    if (x < 0 || y < 0 || !Array.isArray(grid[x]) || grid[x][y] === undefined) {
      throw new HttpException(
        'Map coordinates out of bounds',
        HttpStatus.BAD_REQUEST
      );
    }

    return { x, y };
  }

  private normalizeRange(
    grid: any[][],
    xValue: unknown,
    yValue: unknown,
    sizeXValue: unknown,
    sizeYValue: unknown
  ) {
    const { x, y } = this.normalizeCoordinates(grid, xValue, yValue);
    const sizeX = this.toInteger(sizeXValue, 'sizeX');
    const sizeY = this.toInteger(sizeYValue, 'sizeY');
    if (sizeX <= 0 || sizeY <= 0) {
      throw new HttpException(
        'Range size must be positive',
        HttpStatus.BAD_REQUEST
      );
    }

    this.normalizeCoordinates(grid, x + sizeX - 1, y + sizeY - 1);
    return { x, y, sizeX, sizeY };
  }

  private getTileId(tile): number {
    return Number(Array.isArray(tile) ? tile[0] : tile);
  }

  private isFarmTile(tile): boolean {
    const tileId = this.getTileId(tile);
    return tileId > 7 && tileId < 19;
  }

  private buildResourceTile(tileId: number, health = 100) {
    const timestamp = new Date().getTime();
    return this.isFarmTile(tileId)
      ? [tileId, timestamp, null, null, health]
      : [tileId, timestamp, health];
  }

  private cloneValue<T>(value: T): T {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  }

  private normalizeTextField(
    value: unknown,
    fieldName: string,
    maxLength: number,
    required = false
  ): string {
    const normalized = `${value ?? ''}`.replace(/\s+/g, ' ').trim();
    if (required && !normalized) {
      throw new HttpException(
        `${fieldName} is required`,
        HttpStatus.BAD_REQUEST
      );
    }

    return normalized.slice(0, maxLength);
  }

  private normalizeOptionalInteger(value: unknown, fieldName: string): number {
    if (
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      return 0;
    }

    return this.toInteger(value, fieldName);
  }

  private buildIslandActionEventKey(event: Record<string, unknown>): string {
    const explicitKey = this.normalizeTextField(
      event.eventKey,
      'eventKey',
      256
    );
    if (explicitKey) {
      return explicitKey;
    }

    return ['action', event.sessionId ?? '', event.sequence ?? ''].join('|');
  }

  private buildAppendUniqueCappedArrayPipeline(params: {
    field: string;
    keyField: string;
    values: Record<string, unknown>[];
    maxItems: number;
  }): Record<string, unknown>[] {
    return [
      {
        $set: {
          [params.field]: {
            $slice: [
              {
                $concatArrays: [
                  { $ifNull: [`$${params.field}`, []] },
                  {
                    $filter: {
                      input: { $literal: params.values },
                      as: 'incoming',
                      cond: {
                        $not: [
                          {
                            $in: [
                              `$$incoming.${params.keyField}`,
                              {
                                $map: {
                                  input: { $ifNull: [`$${params.field}`, []] },
                                  as: 'existing',
                                  in: `$$existing.${params.keyField}`,
                                },
                              },
                            ],
                          },
                        ],
                      },
                    },
                  },
                ],
              },
              -params.maxItems,
            ],
          },
        },
      },
    ];
  }

  private async appendUniqueCappedArrayValues(params: {
    mapId: unknown;
    field: string;
    keyField: string;
    values: Record<string, unknown>[];
    maxItems: number;
  }): Promise<Record<string, unknown>[]> {
    if (params.values.length === 0) {
      return [];
    }

    const previousDocument = await this.userMapModel.findByIdAndUpdate(
      params.mapId,
      this.buildAppendUniqueCappedArrayPipeline(params),
      { new: false }
    );
    if (!previousDocument) {
      throw new HttpException(
        'Island map changed during append',
        HttpStatus.CONFLICT
      );
    }

    const previousRecord = previousDocument as unknown as Record<
      string,
      unknown
    >;
    const previousValues = Array.isArray(previousRecord[params.field])
      ? (previousRecord[params.field] as Record<string, unknown>[])
      : [];
    const previousKeys = new Set(
      previousValues.map((value) => String(value?.[params.keyField] ?? ''))
    );

    return params.values.filter(
      (value) => !previousKeys.has(String(value[params.keyField] ?? ''))
    );
  }

  private normalizeIslandActionEvent(event: IslandActionEventDto) {
    if (!event || typeof event !== 'object') {
      throw new HttpException(
        'Island action event is required',
        HttpStatus.BAD_REQUEST
      );
    }

    const sequence = this.toInteger(event.sequence, 'sequence');
    if (sequence <= 0) {
      throw new HttpException(
        'sequence must be positive',
        HttpStatus.BAD_REQUEST
      );
    }

    const normalized = {
      sequence,
      eventType: this.normalizeTextField(
        event.eventType,
        'eventType',
        64,
        true
      ),
      sessionId: this.normalizeTextField(event.sessionId, 'sessionId', 128),
      playerId:
        event.playerId === undefined || event.playerId === null
          ? -1
          : this.toInteger(event.playerId, 'playerId'),
      senderName: this.normalizeTextField(
        event.senderName,
        'senderName',
        128
      ),
      x: this.normalizeOptionalInteger(event.x, 'x'),
      y: this.normalizeOptionalInteger(event.y, 'y'),
      subjectId: this.normalizeTextField(event.subjectId, 'subjectId', 128),
      itemId: this.normalizeTextField(event.itemId, 'itemId', 128),
      amount: this.normalizeOptionalInteger(event.amount, 'amount'),
      xpDelta: this.normalizeOptionalInteger(event.xpDelta, 'xpDelta'),
      totalXp: this.normalizeOptionalInteger(event.totalXp, 'totalXp'),
      tileRevision: this.normalizeOptionalInteger(
        event.tileRevision,
        'tileRevision'
      ),
      buildingRevision: this.normalizeOptionalInteger(
        event.buildingRevision,
        'buildingRevision'
      ),
      unixTimeSeconds:
        event.unixTimeSeconds === undefined || event.unixTimeSeconds === null
          ? Math.floor(Date.now() / 1000)
          : this.toInteger(event.unixTimeSeconds, 'unixTimeSeconds'),
    };

    return {
      ...normalized,
      eventKey: this.buildIslandActionEventKey({
        ...normalized,
        eventKey: event.eventKey,
      }),
    };
  }

  private normalizeIslandActionEventBatch(
    dto: IslandActionEventsDto
  ): Record<string, unknown>[] {
    const candidateEvents = Array.isArray(dto?.events)
      ? dto.events
      : dto?.event
      ? [dto.event]
      : dto
      ? [dto as IslandActionEventDto]
      : [];

    if (candidateEvents.length <= 0) {
      throw new HttpException(
        'At least one island action event is required',
        HttpStatus.BAD_REQUEST
      );
    }
    if (candidateEvents.length > this.maxIslandActionEventBatchSize) {
      throw new HttpException(
        `At most ${this.maxIslandActionEventBatchSize} island action events can be appended at once`,
        HttpStatus.BAD_REQUEST
      );
    }

    return candidateEvents.map((event) =>
      this.normalizeIslandActionEvent(event)
    );
  }

  private normalizeIslandChatReport(report: IslandChatReportDto) {
    if (!report || typeof report !== 'object') {
      throw new HttpException(
        'Island chat report is required',
        HttpStatus.BAD_REQUEST
      );
    }

    const reporterPlayerId = this.toInteger(
      report.reporterPlayerId,
      'reporterPlayerId'
    );
    const targetPlayerId = this.toInteger(
      report.targetPlayerId,
      'targetPlayerId'
    );
    if (reporterPlayerId === targetPlayerId) {
      throw new HttpException(
        'Cannot report the same player',
        HttpStatus.BAD_REQUEST
      );
    }

    const sequence = this.normalizeOptionalInteger(report.sequence, 'sequence');
    if (sequence < 0) {
      throw new HttpException(
        'sequence must not be negative',
        HttpStatus.BAD_REQUEST
      );
    }
    const normalized = {
      sessionId: this.normalizeTextField(report.sessionId, 'sessionId', 128),
      reporterPlayerId,
      reporterName: this.normalizeTextField(
        report.reporterName,
        'reporterName',
        128
      ),
      reporterBackendUserId: this.normalizeTextField(
        report.reporterBackendUserId,
        'reporterBackendUserId',
        128
      ),
      reporterCukieId: this.normalizeTextField(
        report.reporterCukieId,
        'reporterCukieId',
        128
      ),
      targetPlayerId,
      targetName: this.normalizeTextField(report.targetName, 'targetName', 128),
      targetBackendUserId: this.normalizeTextField(
        report.targetBackendUserId,
        'targetBackendUserId',
        128
      ),
      targetCukieId: this.normalizeTextField(
        report.targetCukieId,
        'targetCukieId',
        128
      ),
      reason: this.normalizeTextField(report.reason, 'reason', 512, true),
      unixTimeSeconds:
        report.unixTimeSeconds === undefined ||
        report.unixTimeSeconds === null
          ? Math.floor(Date.now() / 1000)
          : this.toInteger(report.unixTimeSeconds, 'unixTimeSeconds'),
    };

    return {
      ...normalized,
      ...(sequence > 0 ? { sequence } : {}),
      reportKey: this.buildIslandChatReportKey({
        ...normalized,
        sequence,
        reportKey: report.reportKey,
      }),
    };
  }

  private buildIslandChatReportKey(report: Record<string, unknown>): string {
    const explicitKey = this.normalizeTextField(
      report.reportKey,
      'reportKey',
      256
    );
    if (explicitKey) {
      return explicitKey;
    }

    return [
      'report',
      report.sessionId ?? '',
      report.sequence ?? 0,
      report.reporterBackendUserId || report.reporterPlayerId || '',
      report.targetBackendUserId || report.targetPlayerId || '',
      report.unixTimeSeconds ?? '',
      report.reason ?? '',
    ].join('|');
  }

  private normalizeIslandChatReportBatch(
    dto: IslandChatReportsDto
  ): Record<string, unknown>[] {
    const candidateReports = Array.isArray(dto?.reports)
      ? dto.reports
      : dto?.report
      ? [dto.report]
      : dto
      ? [dto as IslandChatReportDto]
      : [];

    if (candidateReports.length <= 0) {
      throw new HttpException(
        'At least one island chat report is required',
        HttpStatus.BAD_REQUEST
      );
    }
    if (candidateReports.length > this.maxIslandChatReportBatchSize) {
      throw new HttpException(
        `At most ${this.maxIslandChatReportBatchSize} island chat reports can be appended at once`,
        HttpStatus.BAD_REQUEST
      );
    }

    return candidateReports.map((report) =>
      this.normalizeIslandChatReport(report)
    );
  }

  private looksLikeUnsafeIslandChatMessage(message: string): boolean {
    const lowerMessage = message.toLowerCase();
    return (
      lowerMessage.includes('http://') ||
      lowerMessage.includes('https://') ||
      lowerMessage.includes('www.') ||
      lowerMessage.includes('bearer ') ||
      lowerMessage.includes('jwt') ||
      lowerMessage.includes('jointoken') ||
      lowerMessage.includes('join-token') ||
      lowerMessage.includes('sk-') ||
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lowerMessage) ||
      /\s[^\s@]+@[^\s@]+\.[^\s@]+/.test(lowerMessage)
    );
  }

  private normalizeIslandChatChannel(channel: unknown, system: boolean): string {
    const normalized = this.normalizeTextField(channel, 'channel', 32).toLowerCase();
    if (!normalized) {
      return system ? 'system' : 'island';
    }
    if (!['island', 'party', 'global', 'system'].includes(normalized)) {
      throw new HttpException(
        'channel must be island, party, global or system',
        HttpStatus.BAD_REQUEST
      );
    }

    return normalized;
  }

  private normalizeBooleanField(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes';
    }
    return Boolean(value);
  }

  private buildIslandChatMessageKey(message: Record<string, unknown>): string {
    const explicitKey = this.normalizeTextField(
      message.messageKey,
      'messageKey',
      256
    );
    if (explicitKey) {
      return explicitKey;
    }

    return [
      message.sessionId ?? '',
      message.senderPlayerId ?? '',
      message.senderBackendUserId ?? '',
      message.senderCukieId ?? '',
      message.channel ?? '',
      message.unixTimeSeconds ?? '',
      message.message ?? '',
    ].join('|');
  }

  private normalizeIslandChatMessage(message: IslandChatMessageDto) {
    if (!message || typeof message !== 'object') {
      throw new HttpException(
        'Island chat message is required',
        HttpStatus.BAD_REQUEST
      );
    }

    const sharedMessage = this.normalizeTextField(
      message.message,
      'message',
      240,
      true
    );
    if (this.looksLikeUnsafeIslandChatMessage(sharedMessage)) {
      throw new HttpException(
        'message contains disallowed chat content',
        HttpStatus.BAD_REQUEST
      );
    }

    const isPrivate = this.normalizeBooleanField(message.private);
    if (isPrivate) {
      throw new HttpException(
        'private chat messages are not stored in shared history',
        HttpStatus.BAD_REQUEST
      );
    }

    const system = this.normalizeBooleanField(message.system);
    const normalized = {
      sessionId: this.normalizeTextField(message.sessionId, 'sessionId', 128),
      senderName: this.normalizeTextField(
        message.senderName,
        'senderName',
        128
      ),
      senderPlayerId:
        message.senderPlayerId === undefined || message.senderPlayerId === null
          ? -1
          : this.toInteger(message.senderPlayerId, 'senderPlayerId'),
      senderBackendUserId: this.normalizeTextField(
        message.senderBackendUserId,
        'senderBackendUserId',
        128
      ),
      senderCukieId: this.normalizeTextField(
        message.senderCukieId,
        'senderCukieId',
        128
      ),
      message: sharedMessage,
      channel: this.normalizeIslandChatChannel(message.channel, system),
      system,
      private: false,
      targetPlayerId:
        message.targetPlayerId === undefined || message.targetPlayerId === null
          ? -1
          : this.toInteger(message.targetPlayerId, 'targetPlayerId'),
      unixTimeSeconds:
        message.unixTimeSeconds === undefined ||
        message.unixTimeSeconds === null
          ? Math.floor(Date.now() / 1000)
          : this.toInteger(message.unixTimeSeconds, 'unixTimeSeconds'),
    };

    return {
      ...normalized,
      messageKey: this.buildIslandChatMessageKey({
        ...normalized,
        messageKey: message.messageKey,
      }),
    };
  }

  private normalizeIslandChatMessageBatch(
    dto: IslandChatMessagesDto
  ): Record<string, unknown>[] {
    const candidateMessages = Array.isArray(dto?.messages)
      ? dto.messages
      : dto?.message
      ? [dto.message]
      : dto
      ? [dto as unknown as IslandChatMessageDto]
      : [];

    if (candidateMessages.length <= 0) {
      throw new HttpException(
        'At least one island chat message is required',
        HttpStatus.BAD_REQUEST
      );
    }
    if (candidateMessages.length > this.maxIslandChatMessageBatchSize) {
      throw new HttpException(
        `At most ${this.maxIslandChatMessageBatchSize} island chat messages can be appended at once`,
        HttpStatus.BAD_REQUEST
      );
    }

    const messagesByKey = new Map<string, Record<string, unknown>>();
    for (const message of candidateMessages) {
      const normalized = this.normalizeIslandChatMessage(message);
      messagesByKey.set(String(normalized.messageKey), normalized);
    }

    return Array.from(messagesByKey.values());
  }

  private hasInputValue(value: unknown): boolean {
    return (
      value !== undefined &&
      value !== null &&
      !(typeof value === 'string' && value.trim() === '')
    );
  }

  private buildIslandChatIdentityKey(params: {
    backendUserId?: string;
    cukieId?: string;
    playerId?: number;
    fieldName: string;
  }): string {
    if (params.backendUserId) {
      return `backend:${params.backendUserId}`;
    }
    if (params.cukieId) {
      return `cukie:${params.cukieId}`;
    }
    if (params.playerId !== undefined) {
      return `player:${params.playerId}`;
    }

    throw new HttpException(
      `${params.fieldName} identity is required`,
      HttpStatus.BAD_REQUEST
    );
  }

  private normalizeIslandChatBlockTarget(
    dto: IslandChatBlocksDto,
    target: IslandChatBlockTargetDto
  ) {
    if (!target || typeof target !== 'object') {
      throw new HttpException(
        'Island chat block target is required',
        HttpStatus.BAD_REQUEST
      );
    }

    const blockerPlayerId = this.hasInputValue(dto.blockerPlayerId)
      ? this.toInteger(dto.blockerPlayerId, 'blockerPlayerId')
      : undefined;
    const blockerBackendUserId = this.normalizeTextField(
      dto.blockerBackendUserId,
      'blockerBackendUserId',
      128
    );
    const blockerCukieId = this.normalizeTextField(
      dto.blockerCukieId,
      'blockerCukieId',
      128
    );
    const blockerKey = this.buildIslandChatIdentityKey({
      backendUserId: blockerBackendUserId,
      cukieId: blockerCukieId,
      playerId: blockerPlayerId,
      fieldName: 'blocker',
    });

    const targetPlayerId = this.hasInputValue(target.targetPlayerId)
      ? this.toInteger(target.targetPlayerId, 'targetPlayerId')
      : undefined;
    const targetBackendUserId = this.normalizeTextField(
      target.targetBackendUserId,
      'targetBackendUserId',
      128
    );
    const targetCukieId = this.normalizeTextField(
      target.targetCukieId,
      'targetCukieId',
      128
    );
    const targetKey = this.buildIslandChatIdentityKey({
      backendUserId: targetBackendUserId,
      cukieId: targetCukieId,
      playerId: targetPlayerId,
      fieldName: 'target',
    });

    if (blockerKey === targetKey) {
      throw new HttpException(
        'Cannot block the same player',
        HttpStatus.BAD_REQUEST
      );
    }

    return {
      blockerKey,
      blockerPlayerId,
      blockerName: this.normalizeTextField(dto.blockerName, 'blockerName', 128),
      blockerBackendUserId,
      blockerCukieId,
      targetKey,
      targetPlayerId,
      targetName: this.normalizeTextField(target.targetName, 'targetName', 128),
      targetBackendUserId,
      targetCukieId,
      unixTimeSeconds:
        target.unixTimeSeconds === undefined || target.unixTimeSeconds === null
          ? Math.floor(Date.now() / 1000)
          : this.toInteger(target.unixTimeSeconds, 'unixTimeSeconds'),
    };
  }

  private normalizeIslandChatBlockState(dto: IslandChatBlocksDto): {
    blockerKey: string;
    blocks: Record<string, unknown>[];
  } {
    if (!dto || typeof dto !== 'object') {
      throw new HttpException(
        'Island chat block state is required',
        HttpStatus.BAD_REQUEST
      );
    }

    const blockerPlayerId = this.hasInputValue(dto.blockerPlayerId)
      ? this.toInteger(dto.blockerPlayerId, 'blockerPlayerId')
      : undefined;
    const blockerKey = this.buildIslandChatIdentityKey({
      backendUserId: this.normalizeTextField(
        dto.blockerBackendUserId,
        'blockerBackendUserId',
        128
      ),
      cukieId: this.normalizeTextField(dto.blockerCukieId, 'blockerCukieId', 128),
      playerId: blockerPlayerId,
      fieldName: 'blocker',
    });
    const candidateTargets = Array.isArray(dto.blocks) ? dto.blocks : [];
    if (candidateTargets.length > this.maxIslandChatBlockTargets) {
      throw new HttpException(
        `At most ${this.maxIslandChatBlockTargets} island chat blocks can be stored per blocker`,
        HttpStatus.BAD_REQUEST
      );
    }

    const blocksByTargetKey = new Map<string, Record<string, unknown>>();
    for (const target of candidateTargets) {
      const block = this.normalizeIslandChatBlockTarget(dto, target);
      blocksByTargetKey.set(String(block.targetKey), block);
    }

    return {
      blockerKey,
      blocks: Array.from(blocksByTargetKey.values()),
    };
  }

  private buildOptionalIslandChatBlockerKey(params: {
    blockerBackendUserId?: string;
    blockerCukieId?: string;
    blockerPlayerId?: string | number;
  }): string {
    const blockerBackendUserId = this.normalizeTextField(
      params.blockerBackendUserId,
      'blockerBackendUserId',
      128
    );
    const blockerCukieId = this.normalizeTextField(
      params.blockerCukieId,
      'blockerCukieId',
      128
    );
    const blockerPlayerId = this.hasInputValue(params.blockerPlayerId)
      ? this.toInteger(params.blockerPlayerId, 'blockerPlayerId')
      : undefined;
    if (!blockerBackendUserId && !blockerCukieId && blockerPlayerId === undefined) {
      return '';
    }

    return this.buildIslandChatIdentityKey({
      backendUserId: blockerBackendUserId,
      cukieId: blockerCukieId,
      playerId: blockerPlayerId,
      fieldName: 'blocker',
    });
  }

  private normalizeChatBlockLimit(limitValue: unknown): number {
    if (
      limitValue === undefined ||
      limitValue === null ||
      `${limitValue}`.trim() === ''
    ) {
      return 100;
    }

    const limit = this.toInteger(limitValue, 'limit');
    if (limit <= 0) {
      throw new HttpException(
        'limit must be positive',
        HttpStatus.BAD_REQUEST
      );
    }

    return Math.min(limit, this.maxIslandChatBlocks);
  }

  private normalizeActionEventLimit(limitValue: unknown): number {
    if (
      limitValue === undefined ||
      limitValue === null ||
      `${limitValue}`.trim() === ''
    ) {
      return 100;
    }

    const limit = this.toInteger(limitValue, 'limit');
    if (limit <= 0) {
      throw new HttpException(
        'limit must be positive',
        HttpStatus.BAD_REQUEST
      );
    }

    return Math.min(limit, this.maxIslandActionEvents);
  }

  private normalizeChatMessageLimit(limitValue: unknown): number {
    if (
      limitValue === undefined ||
      limitValue === null ||
      `${limitValue}`.trim() === ''
    ) {
      return 50;
    }

    const limit = this.toInteger(limitValue, 'limit');
    if (limit <= 0) {
      throw new HttpException(
        'limit must be positive',
        HttpStatus.BAD_REQUEST
      );
    }

    return Math.min(limit, this.maxIslandChatMessages);
  }

  private normalizeChatReportLimit(limitValue: unknown): number {
    if (
      limitValue === undefined ||
      limitValue === null ||
      `${limitValue}`.trim() === ''
    ) {
      return 100;
    }

    const limit = this.toInteger(limitValue, 'limit');
    if (limit <= 0) {
      throw new HttpException(
        'limit must be positive',
        HttpStatus.BAD_REQUEST
      );
    }

    return Math.min(limit, this.maxIslandChatReports);
  }

  private getTileKey(x: number, y: number): string {
    return `${x}_${y}`;
  }

  private parseTileKey(key: string) {
    const [xRaw, yRaw] = key.split('_');
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return null;
    }

    return { x, y };
  }

  private getOverrideSection(userMap, section: 'Resources' | 'Buildings') {
    const overrides = userMap?.overrides?.[section];
    return overrides && typeof overrides === 'object' ? overrides : {};
  }

  private getMaterializationSourceGrid(
    userMap,
    resourceMap,
    section: 'Resources' | 'Buildings',
    key: 'mapResources' | 'mapBuildings'
  ): any[][] {
    const legacyGrid = userMap?.data?.[section]?.[key];
    return Array.isArray(legacyGrid)
      ? legacyGrid
      : this.getBaseGrid(resourceMap, section, key);
  }

  private getCurrentTile(
    userMap,
    resourceMap,
    section: 'Resources' | 'Buildings',
    key: 'mapResources' | 'mapBuildings',
    x: number,
    y: number
  ) {
    const override = this.getOverrideSection(userMap, section)[
      this.getTileKey(x, y)
    ];
    if (override !== undefined) {
      return this.cloneValue(override);
    }

    const legacyGrid = userMap?.data?.[section]?.[key];
    if (Array.isArray(legacyGrid?.[x]) && legacyGrid[x][y] !== undefined) {
      return this.cloneValue(legacyGrid[x][y]);
    }

    const baseGrid = this.getBaseGrid(resourceMap, section, key);
    return this.cloneValue(baseGrid[x][y]);
  }

  private applyTileOverrides(
    grid: any[][],
    overrides: Record<string, unknown>
  ) {
    for (const [key, value] of Object.entries(overrides ?? {})) {
      const coordinates = this.parseTileKey(key);
      if (
        coordinates &&
        Array.isArray(grid[coordinates.x]) &&
        grid[coordinates.x][coordinates.y] !== undefined
      ) {
        grid[coordinates.x][coordinates.y] = this.cloneValue(value);
      }
    }
  }

  private getHouseAppliances(userMap) {
    if (Array.isArray(userMap?.overrides?.HouseAppliances)) {
      return this.cloneValue(userMap.overrides.HouseAppliances);
    }

    if (Array.isArray(userMap?.data?.HouseAppliances)) {
      return this.cloneValue(userMap.data.HouseAppliances);
    }

    return [];
  }

  private async materializeUserMap(userMap) {
    if (!userMap) return userMap;

    const plainUserMap =
      typeof userMap.toObject === 'function' ? userMap.toObject() : userMap;
    const resourceMap = plainUserMap?.resourceMap?.data
      ? plainUserMap.resourceMap
      : await this.resourceMapModel.findById(plainUserMap.resourceMap).lean();

    if (!resourceMap) {
      return plainUserMap;
    }

    const resourceGrid = this.cloneValue(
      this.getMaterializationSourceGrid(
        plainUserMap,
        resourceMap,
        'Resources',
        'mapResources'
      )
    );
    const buildingGrid = this.cloneValue(
      this.getMaterializationSourceGrid(
        plainUserMap,
        resourceMap,
        'Buildings',
        'mapBuildings'
      )
    );
    this.applyTileOverrides(
      resourceGrid,
      this.getOverrideSection(plainUserMap, 'Resources')
    );
    this.applyTileOverrides(
      buildingGrid,
      this.getOverrideSection(plainUserMap, 'Buildings')
    );

    return {
      ...plainUserMap,
      resourceMap: resourceMap._id ?? plainUserMap.resourceMap,
      mapStorageMode: 'overrides',
      data: {
        Resources: {
          mapSize:
            plainUserMap?.data?.Resources?.mapSize ??
            resourceMap.data.Resources.mapSize,
          mapResources: resourceGrid,
        },
        Buildings: {
          mapSize:
            plainUserMap?.data?.Buildings?.mapSize ??
            resourceMap.data.Buildings.mapSize,
          mapBuildings: buildingGrid,
        },
        HouseAppliances: this.getHouseAppliances(plainUserMap),
      },
    };
  }

  private async materializeOutput(output: Output): Promise<Output> {
    const results = (output as any)?.results ?? [];
    return {
      ...output,
      results: await Promise.all(
        results.map((userMap) => this.materializeUserMap(userMap))
      ),
    };
  }

  private normalizeBuildingTile(buildingTileDto: BuildingTileDto) {
    const rawTileId = buildingTileDto.tileId as any;
    const rawBuildingId = Array.isArray(rawTileId) ? rawTileId[0] : rawTileId;
    const rawRotation = Array.isArray(rawTileId)
      ? rawTileId[1]
      : buildingTileDto.rotation;
    const buildingId = `${rawBuildingId ?? ''}`.trim();
    if (!buildingId) {
      throw new HttpException(
        'Building id is required',
        HttpStatus.BAD_REQUEST
      );
    }

    return [buildingId, this.toInteger(rawRotation ?? 0, 'rotation')];
  }

  private async updateResourceMapTileInContext(params: {
    userMap: any;
    resourceMap: any;
    mapTileDto: MapTileDto;
  }): Promise<Output> {
    const { userMap, resourceMap, mapTileDto } = params;
    const resourceGrid = this.getBaseGrid(
      resourceMap,
      'Resources',
      'mapResources'
    );
    const { x, y } = this.normalizeCoordinates(
      resourceGrid,
      mapTileDto.x,
      mapTileDto.y
    );
    const tileId = this.toInteger(mapTileDto.tileId, 'tileId');
    const health =
      mapTileDto.health === undefined || mapTileDto.health === null
        ? 100
        : this.toInteger(mapTileDto.health, 'health');

    const newMapTile = this.buildResourceTile(tileId, health);

    return await this.userMapCRUD.update(userMap['_id'], {
      $set: {
        [`overrides.Resources.${this.getTileKey(x, y)}`]: newMapTile,
      },
    });
  }

  private async updateBuildingMapTileInContext(params: {
    userMap: any;
    resourceMap: any;
    buildingTileDto: BuildingTileDto;
  }): Promise<Output> {
    const { userMap, resourceMap, buildingTileDto } = params;
    const buildingGrid = this.getBaseGrid(
      resourceMap,
      'Buildings',
      'mapBuildings'
    );
    const { x, y } = this.normalizeCoordinates(
      buildingGrid,
      buildingTileDto.x,
      buildingTileDto.y
    );
    const newMapTile = [
      ...this.normalizeBuildingTile(buildingTileDto),
      Array.isArray(buildingTileDto.buildingResources)
        ? buildingTileDto.buildingResources
        : [],
    ];
    if (buildingTileDto.link) newMapTile.push(buildingTileDto.link as any);

    await this.userMapCRUD.update(userMap['_id'], {
      $set: {
        [`overrides.Buildings.${this.getTileKey(x, y)}`]: newMapTile,
      },
    });

    return { message: 'tile changed', code: 200 };
  }

  /**
   * Method to find all UserMaps
   * @returns
   */
  async findAll(params: { findParams: IGet }): Promise<Output> {
    const { findParams } = params;
    return await this.userMapCRUD.getAll(findParams);
  }

  /**
   * Method to find specific UserMap by Id
   * @param id
   * @returns
   */
  async findOne(params: { id: string }): Promise<Output> {
    const { id } = params;
    return this.materializeOutput(
      await this.userMapCRUD.getOne({
        filterQuery: { _id: id },
        populate: ['baseMap'],
      })
    );
  }

  /**
   * Method to create a bew UserMap
   * @param createUserMapDto : New object
   * @returns
   */
  async create(params: {
    createUserMapDto: CreateUserMapDto;
  }): Promise<Output> {
    const { createUserMapDto } = params;

    const resourceMapClone = await this.resourceMapCRUD.getOne({
      filterQuery: { _id: createUserMapDto.resourceMap },
    });

    //If the message exists it means there was an error.
    if (resourceMapClone['message']) return resourceMapClone;

    const resourceMap = resourceMapClone['results'][0];
    const houseAppliances = Array.isArray(
      (createUserMapDto.data as any)?.HouseAppliances
    )
      ? (createUserMapDto.data as any).HouseAppliances
      : [];
    createUserMapDto.baseMap = createUserMapDto.baseMap ?? resourceMap.map;
    createUserMapDto.data = { HouseAppliances: houseAppliances } as any;
    createUserMapDto.overrides = {
      Resources: {},
      Buildings: {},
      HouseAppliances: houseAppliances,
    };
    return this.materializeOutput(
      await this.userMapCRUD.create(createUserMapDto, ['baseMap'])
    );
  }

  /**
   * Method to update some UserMap data.
   * @param id : UserMap id that we want to change.
   * @param updateUserMapDto: New Data to store.
   * @returns : new Object
   */
  async update(params: {
    id: string;
    updateUserMapDto: UpdateUserMapDto;
    userId?: string;
  }): Promise<Output> {
    const { id, updateUserMapDto, userId } = params;
    if (userId)
      await this.userService.updateLastChange({
        userId,
        lastChange: 'userMap',
      });

    return await this.userMapCRUD.update(id, updateUserMapDto);
  }

  /**
   * Method to remove some UserMap object.
   * @param id : Id of map to delete.
   * @returns
   */
  async remove(params: { id: string }): Promise<Output> {
    const { id } = params;
    return await this.userMapCRUD.remove(id);
  }

  async findAllFromToken(params: { userId: string }): Promise<Output> {
    const { userId } = params;

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const userMaps = await this.userMapCRUD.getAll({
      filterQuery: { user: userId },
      order: 'asc',
      limit: 1000,
      skip: 0,
      populate: ['baseMap'],
    });

    if (userMaps['totalCount'] && userMaps['totalCount'] !== 0) {
      const firstMap = userMaps['results']?.[0];
      if (firstMap?._id) {
        await this.userModel.findByIdAndUpdate(userId, {
          $addToSet: { maps: firstMap._id },
        });
      }
      return this.materializeOutput(userMaps);
    }

    return this.createFromToken({ userId });
  }

  async findIslandMapFromToken(params: {
    userId: string;
    islandId: string;
  }): Promise<Output> {
    const { userId } = params;
    const islandId = `${params.islandId ?? ''}`.trim();
    const defaultIslandIds = new Set(['', 'current', 'default', 'me']);

    if (defaultIslandIds.has(islandId.toLowerCase()) || islandId === userId) {
      return this.findAllFromToken({ userId });
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const allowedMapIds = (user.maps ?? []).map((mapId) => String(mapId));
    const islandLookup = this.buildIslandLookup(islandId);
    const islandMap = await this.userMapModel
      .findOne({
        $and: [
          islandLookup,
          { $or: [{ user: userId }, { _id: { $in: allowedMapIds } }] },
        ],
      })
      .populate('baseMap');

    if (!islandMap) {
      throw new HttpException('Island map not found', HttpStatus.NOT_FOUND);
    }

    return this.materializeOutput({
      totalCount: 1,
      results: [islandMap],
    });
  }

  async getIslandActionEventsFromToken(params: {
    userId: string;
    islandId: string;
    limit?: string | number;
  }): Promise<Output> {
    const { userMap } = await this.getIslandMapContext(
      params.userId,
      params.islandId
    );
    const limit = this.normalizeActionEventLimit(params.limit);
    const events = Array.isArray(userMap?.islandActionEvents)
      ? userMap.islandActionEvents
      : [];

    return {
      totalCount: events.length,
      results: this.cloneValue(events.slice(-limit)),
    };
  }

  async appendIslandActionEventsFromToken(params: {
    userId: string;
    islandId: string;
    islandActionEventsDto: IslandActionEventsDto;
  }): Promise<Output> {
    const { userMap } = await this.getIslandMapContext(
      params.userId,
      params.islandId
    );
    const existingEvents = Array.isArray(userMap?.islandActionEvents)
      ? userMap.islandActionEvents
      : [];
    const existingKeys = new Set(
      existingEvents.map((event) => this.buildIslandActionEventKey(event))
    );
    const eventsByKey = new Map<string, Record<string, unknown>>();
    for (const event of this.normalizeIslandActionEventBatch(
      params.islandActionEventsDto
    )) {
      const eventKey = String(event.eventKey ?? '');
      if (!existingKeys.has(eventKey)) {
        eventsByKey.set(eventKey, event);
      }
    }
    const events = Array.from(eventsByKey.values());

    const appendedEvents = await this.appendUniqueCappedArrayValues({
      mapId: userMap['_id'],
      field: 'islandActionEvents',
      keyField: 'eventKey',
      values: events,
      maxItems: this.maxIslandActionEvents,
    });

    return {
      totalCount: appendedEvents.length,
      results: appendedEvents,
    };
  }

  async getIslandChatMessagesFromToken(params: {
    userId: string;
    islandId: string;
    limit?: string | number;
  }): Promise<Output> {
    const { userMap } = await this.getIslandMapContext(
      params.userId,
      params.islandId
    );
    const limit = this.normalizeChatMessageLimit(params.limit);
    const messages = Array.isArray(userMap?.islandChatMessages)
      ? userMap.islandChatMessages
      : [];

    return {
      totalCount: messages.length,
      results: this.cloneValue(messages.slice(-limit)),
    };
  }

  async appendIslandChatMessagesFromToken(params: {
    userId: string;
    islandId: string;
    islandChatMessagesDto: IslandChatMessagesDto;
  }): Promise<Output> {
    const { userMap } = await this.getIslandMapContext(
      params.userId,
      params.islandId
    );
    const existingMessages = Array.isArray(userMap?.islandChatMessages)
      ? userMap.islandChatMessages
      : [];
    const existingKeys = new Set(
      existingMessages.map((message) => `${message?.messageKey ?? ''}`)
    );
    const messagesByKey = new Map<string, Record<string, unknown>>();
    for (const message of this.normalizeIslandChatMessageBatch(
      params.islandChatMessagesDto
    )) {
      const messageKey = String(message.messageKey ?? '');
      if (!existingKeys.has(messageKey)) {
        messagesByKey.set(messageKey, message);
      }
    }
    const messages = Array.from(messagesByKey.values());

    const appendedMessages = await this.appendUniqueCappedArrayValues({
      mapId: userMap['_id'],
      field: 'islandChatMessages',
      keyField: 'messageKey',
      values: messages,
      maxItems: this.maxIslandChatMessages,
    });

    return {
      totalCount: appendedMessages.length,
      results: appendedMessages,
    };
  }

  async getIslandChatReportsFromToken(params: {
    userId: string;
    islandId: string;
    limit?: string | number;
  }): Promise<Output> {
    const { userMap } = await this.getIslandMapContext(
      params.userId,
      params.islandId
    );
    const limit = this.normalizeChatReportLimit(params.limit);
    const reports = Array.isArray(userMap?.islandChatReports)
      ? userMap.islandChatReports
      : [];

    return {
      totalCount: reports.length,
      results: this.cloneValue(reports.slice(-limit)),
    };
  }

  async appendIslandChatReportsFromToken(params: {
    userId: string;
    islandId: string;
    islandChatReportsDto: IslandChatReportsDto;
  }): Promise<Output> {
    const { userMap } = await this.getIslandMapContext(
      params.userId,
      params.islandId
    );
    const existingReports = Array.isArray(userMap?.islandChatReports)
      ? userMap.islandChatReports
      : [];
    const existingKeys = new Set(
      existingReports.map((report) => this.buildIslandChatReportKey(report))
    );
    const reportsByKey = new Map<string, Record<string, unknown>>();
    for (const report of this.normalizeIslandChatReportBatch(
      params.islandChatReportsDto
    )) {
      const reportKey = String(report.reportKey ?? '');
      if (!existingKeys.has(reportKey)) {
        reportsByKey.set(reportKey, report);
      }
    }
    const reports = Array.from(reportsByKey.values());

    const appendedReports = await this.appendUniqueCappedArrayValues({
      mapId: userMap['_id'],
      field: 'islandChatReports',
      keyField: 'reportKey',
      values: reports,
      maxItems: this.maxIslandChatReports,
    });

    return {
      totalCount: appendedReports.length,
      results: appendedReports,
    };
  }

  async getIslandChatBlocksFromToken(params: {
    userId: string;
    islandId: string;
    blockerBackendUserId?: string;
    blockerCukieId?: string;
    blockerPlayerId?: string | number;
    limit?: string | number;
  }): Promise<Output> {
    const { userMap } = await this.getIslandMapContext(
      params.userId,
      params.islandId
    );
    const limit = this.normalizeChatBlockLimit(params.limit);
    const blockerKey = this.buildOptionalIslandChatBlockerKey({
      blockerBackendUserId: params.blockerBackendUserId,
      blockerCukieId: params.blockerCukieId,
      blockerPlayerId: params.blockerPlayerId,
    });
    const blocks = Array.isArray(userMap?.islandChatBlocks)
      ? userMap.islandChatBlocks
      : [];
    const filteredBlocks = blockerKey
      ? blocks.filter((block) => block?.blockerKey === blockerKey)
      : blocks;

    return {
      totalCount: filteredBlocks.length,
      results: this.cloneValue(filteredBlocks.slice(-limit)),
    };
  }

  async setIslandChatBlocksFromToken(params: {
    userId: string;
    islandId: string;
    islandChatBlocksDto: IslandChatBlocksDto;
  }): Promise<Output> {
    const { userMap } = await this.getIslandMapContext(
      params.userId,
      params.islandId
    );
    const { blockerKey, blocks } = this.normalizeIslandChatBlockState(
      params.islandChatBlocksDto
    );

    await this.userMapModel.findByIdAndUpdate(userMap['_id'], {
      $pull: {
        islandChatBlocks: { blockerKey },
      },
    });

    if (blocks.length > 0) {
      await this.userMapModel.findByIdAndUpdate(userMap['_id'], {
        $push: {
          islandChatBlocks: {
            $each: blocks,
            $slice: -this.maxIslandChatBlocks,
          },
        },
      });
    }

    return {
      totalCount: blocks.length,
      results: blocks,
    };
  }

  async shareIslandMapFromToken(params: {
    userId: string;
    islandId: string;
    targetUserId: string;
  }): Promise<Output> {
    const { userId } = params;
    const islandId = this.normalizeStableIslandId(params.islandId);
    const targetUserId = `${params.targetUserId ?? ''}`.trim();

    if (!targetUserId) {
      throw new HttpException(
        'targetUserId is required',
        HttpStatus.BAD_REQUEST
      );
    }
    if (targetUserId === userId) {
      throw new HttpException(
        'Cannot share an island with its owner',
        HttpStatus.BAD_REQUEST
      );
    }

    const [owner, targetUser] = await Promise.all([
      this.userModel.findById(userId),
      this.userModel.findById(targetUserId),
    ]);
    if (!owner) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    if (!targetUser) {
      throw new HttpException('Target user not found', HttpStatus.NOT_FOUND);
    }

    const islandMap = await this.userMapModel.findOne({
      $and: [this.buildIslandLookup(islandId), { user: userId }],
    });
    if (!islandMap) {
      throw new HttpException('Island map not found', HttpStatus.NOT_FOUND);
    }

    await this.userModel.findByIdAndUpdate(targetUserId, {
      $addToSet: { maps: islandMap._id },
    });

    return this.buildIslandShareOutput({
      islandMap,
      ownerUserId: userId,
      targetUserId,
      shared: true,
    });
  }

  async unshareIslandMapFromToken(params: {
    userId: string;
    islandId: string;
    targetUserId: string;
  }): Promise<Output> {
    const { userId } = params;
    const islandId = this.normalizeStableIslandId(params.islandId);
    const targetUserId = `${params.targetUserId ?? ''}`.trim();

    if (!targetUserId) {
      throw new HttpException(
        'targetUserId is required',
        HttpStatus.BAD_REQUEST
      );
    }
    if (targetUserId === userId) {
      throw new HttpException(
        'Cannot revoke owner access to an island',
        HttpStatus.BAD_REQUEST
      );
    }

    const [owner, targetUser] = await Promise.all([
      this.userModel.findById(userId),
      this.userModel.findById(targetUserId),
    ]);
    if (!owner) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    if (!targetUser) {
      throw new HttpException('Target user not found', HttpStatus.NOT_FOUND);
    }

    const islandMap = await this.userMapModel.findOne({
      $and: [this.buildIslandLookup(islandId), { user: userId }],
    });
    if (!islandMap) {
      throw new HttpException('Island map not found', HttpStatus.NOT_FOUND);
    }

    await this.userModel.findByIdAndUpdate(targetUserId, {
      $pull: { maps: islandMap._id },
    });

    return this.buildIslandShareOutput({
      islandMap,
      ownerUserId: userId,
      targetUserId,
      shared: false,
    });
  }

  async getIslandPlayerAccessForServer(params: {
    islandId: string;
    targetUserId: string;
    serverToken?: string;
  }): Promise<Output> {
    this.assertIslandServerToken(params.serverToken);

    const islandId = this.normalizeStableIslandId(params.islandId);
    const targetUserId = `${params.targetUserId ?? ''}`.trim();
    if (!targetUserId) {
      throw new HttpException(
        'targetUserId is required',
        HttpStatus.BAD_REQUEST
      );
    }

    const islandMap = await this.userMapModel.findOne(
      this.buildIslandLookup(islandId)
    );
    if (!islandMap) {
      throw new HttpException('Island map not found', HttpStatus.NOT_FOUND);
    }

    const targetUser = await this.userModel.findById(targetUserId);
    const mapId = String(islandMap['_id']);
    const ownerUserId = String(islandMap['user'] ?? '');
    const isOwner = ownerUserId === targetUserId;
    const allowedMapIds = targetUser
      ? (targetUser.maps ?? []).map((mapIdValue) => String(mapIdValue))
      : [];
    const accessAllowed = isOwner || allowedMapIds.includes(mapId);
    const claims = this.buildIslandAccessClaims(accessAllowed, isOwner);

    return {
      totalCount: 1,
      results: [
        {
          islandId: islandMap['islandId'] || mapId,
          mapId,
          ownerUserId,
          targetUserId,
          accessAllowed,
          ...claims,
        },
      ],
    };
  }

  async createFromToken(params: { userId: string }): Promise<Output> {
    const { userId } = params;

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const resourceMap = await this.getAssignableResourceMap(userId);
    if (!resourceMap) {
      return {
        code: 422,
        message: 'No maps available',
      };
    }

    // create a new userMap
    try {
      const userMap = await this.userMapCRUD.create(
        {
          baseMap: resourceMap.map,
          resourceMap: resourceMap._id,
          user: userId,
          data: {
            HouseAppliances: (resourceMap.data as any).HouseAppliances ?? [],
          },
          overrides: {
            Resources: {},
            Buildings: {},
            HouseAppliances: (resourceMap.data as any).HouseAppliances ?? [],
          },
        },
        ['baseMap']
      );

      const userMapDocument = userMap['results']?.[0];
      if (userMapDocument?._id) {
        await this.userModel.findByIdAndUpdate(userId, {
          $addToSet: { maps: userMapDocument._id },
        });
        if (!userMapDocument.islandId) {
          const generatedIslandId = String(userMapDocument._id);
          await this.userMapModel.findByIdAndUpdate(userMapDocument._id, {
            $set: { islandId: generatedIslandId },
          });
          userMapDocument.islandId = generatedIslandId;
        }
      }

      return this.materializeOutput(userMap);
    } catch (error) {
      if (error?.code === 11000) {
        return this.findAllFromToken({ userId });
      }
      throw error;
    }
  }

  async updateFromToken(params: {
    userId: string;
    updateUserMapDto: UpdateUserMapDto;
  }): Promise<Output> {
    const { userId, updateUserMapDto } = params;
    const userMap = await this.getUserMapDocument(userId);
    if (
      updateUserMapDto._id &&
      String(updateUserMapDto._id) !== String(userMap['_id'])
    ) {
      throw new HttpException(
        'Cannot update another user map',
        HttpStatus.FORBIDDEN
      );
    }

    const sanitizedUpdate: Partial<UpdateUserMapDto> = {};
    if (
      updateUserMapDto.data?.Resources !== undefined ||
      updateUserMapDto.data?.Buildings !== undefined
    ) {
      throw new HttpException(
        'Use tile endpoints to update map grids',
        HttpStatus.BAD_REQUEST
      );
    }
    if (updateUserMapDto.data?.HouseAppliances !== undefined) {
      sanitizedUpdate.overrides = {
        HouseAppliances: updateUserMapDto.data.HouseAppliances,
      } as any;
    }

    if (Object.keys(sanitizedUpdate).length === 0) {
      throw new HttpException(
        'No updateable map fields provided',
        HttpStatus.BAD_REQUEST
      );
    }

    await this.update({
      id: userMap['_id'],
      updateUserMapDto: {
        $set: {
          'overrides.HouseAppliances': (sanitizedUpdate.overrides as any)
            .HouseAppliances,
        },
      } as any,
      userId,
    });

    return this.findAllFromToken({ userId });
  }

  async removeFromToken(params: {
    userId: string;
    mapId: string;
  }): Promise<Output> {
    const { userId, mapId } = params;

    const userMap = await this.getUserMapDocument(userId);
    if (String(userMap['_id']) !== String(mapId)) {
      throw new HttpException(
        'Cannot remove another user map',
        HttpStatus.FORBIDDEN
      );
    }

    // remove the map from the user
    await this.userModel.findByIdAndUpdate(userId, {
      $pull: { maps: userMap['_id'] },
    });

    // remove the map from the database
    const data = await this.userMapCRUD.remove(userMap['_id']);

    return data;
  }

  /**
   * Method to update a map tile.
   * @param userId: Id of the user that has the map.
   * @param mapTileDto: Data to update.
   * @returns : new Object
   */
  async updateMapTileFromToken(params: {
    userId: string;
    mapTileDto: MapTileDto;
  }): Promise<Output> {
    const { userId, mapTileDto } = params;

    const { userMap, resourceMap } = await this.getUserMapContext(userId);
    return this.updateResourceMapTileInContext({
      userMap,
      resourceMap,
      mapTileDto,
    });
  }

  async updateIslandMapTileFromToken(params: {
    userId: string;
    islandId: string;
    mapTileDto: MapTileDto;
  }): Promise<Output> {
    const { userId, islandId, mapTileDto } = params;
    const { userMap, resourceMap } = await this.getIslandMapContext(
      userId,
      islandId
    );
    return this.updateResourceMapTileInContext({
      userMap,
      resourceMap,
      mapTileDto,
    });
  }

  /**
   * Method to update a map tile.
   * @param userId: Id of the user that has the map.
   * @param buildingTileDto: Data to update.
   * @returns : new Object
   */
  async updateMapBuildingFromToken(params: {
    userId: string;
    buildingTileDto: BuildingTileDto;
  }): Promise<Output> {
    const { userId, buildingTileDto } = params;

    const { userMap, resourceMap } = await this.getUserMapContext(userId);
    return this.updateBuildingMapTileInContext({
      userMap,
      resourceMap,
      buildingTileDto,
    });
  }

  async updateIslandMapBuildingFromToken(params: {
    userId: string;
    islandId: string;
    buildingTileDto: BuildingTileDto;
  }): Promise<Output> {
    const { userId, islandId, buildingTileDto } = params;
    const { userMap, resourceMap } = await this.getIslandMapContext(
      userId,
      islandId
    );
    return this.updateBuildingMapTileInContext({
      userMap,
      resourceMap,
      buildingTileDto,
    });
  }

  /**
   * Method to place a building on the map.
   * @param userId: Id of the user that has the map.
   * @param buildingDto: Data to update.
   * @returns : new Object
   */
  async UpdateMapTileRange(params: {
    userId: string;
    mapTilesDto: MapTileRangeDto;
  }): Promise<Output> {
    const { userId, mapTilesDto } = params;

    const { userMap, resourceMap } = await this.getUserMapContext(userId);
    const resourceGrid = this.getBaseGrid(
      resourceMap,
      'Resources',
      'mapResources'
    );
    const { x, y, sizeX, sizeY } = this.normalizeRange(
      resourceGrid,
      mapTilesDto.x,
      mapTilesDto.y,
      mapTilesDto.sizeX,
      mapTilesDto.sizeY
    );
    if (mapTilesDto.tileId === undefined || mapTilesDto.tileId === null) {
      throw new HttpException('tileId is required', HttpStatus.BAD_REQUEST);
    }
    const tileId = this.toInteger(mapTilesDto.tileId, 'tileId');
    const newMapTile = this.buildResourceTile(tileId);

    // update the map tiles in the range of the building
    const setQuery = {};
    for (let i = 0; i < sizeX; i++) {
      for (let j = 0; j < sizeY; j++) {
        setQuery[`overrides.Resources.${this.getTileKey(x + i, y + j)}`] =
          newMapTile;
      }
    }
    await this.userMapCRUD.update(userMap['_id'], { $set: setQuery });

    const data = await this.userMapCRUD.getOne({
      filterQuery: { user: userId },
    });

    return data;
  }

  /**
   * Method to water (It refers a farm tile) one map tile.
   * @param userId: Id of the user that has the map.
   * @param mapTileCoordinatesDto: Data to update.
   * @returns : new Object
   */
  async waterMapTileFromToken(params: {
    userId: string;
    mapTileCoordinatesDto: MapTileCoordinatesDto;
  }): Promise<Output> {
    const { userId, mapTileCoordinatesDto } = params;

    const { userMap, resourceMap } = await this.getUserMapContext(userId);
    const resourceGrid = this.getBaseGrid(
      resourceMap,
      'Resources',
      'mapResources'
    );
    const { x, y } = this.normalizeCoordinates(
      resourceGrid,
      mapTileCoordinatesDto.x,
      mapTileCoordinatesDto.y
    );

    // get the tile from the map
    const tileToModify = this.getCurrentTile(
      userMap,
      resourceMap,
      'Resources',
      'mapResources',
      x,
      y
    );
    // check if the tile is a farm tile. If the map tile is not in range of 7 and 19 it means that is not a farm tile
    if (!this.isFarmTile(tileToModify))
      throw new HttpException(
        'The tile is not a farm tile',
        HttpStatus.BAD_REQUEST
      );

    /*const newMapTile = [
      tileToModify[0],
      tileToModify[1],
      new Date().getTime(),
      tileToModify[3],
      tileToModify[4]
    ];*/

    // update the map tile
    const newMapTile = Array.isArray(tileToModify)
      ? [...tileToModify]
      : this.buildResourceTile(this.getTileId(tileToModify));
    while (newMapTile.length < 5) {
      newMapTile.push(null);
    }
    newMapTile[2] = new Date().getTime();

    const data = await this.userMapCRUD.update(userMap['_id'], {
      $set: {
        [`overrides.Resources.${this.getTileKey(x, y)}`]: newMapTile,
      },
    });

    /* this.userService.updateLastChange(userId, 'userMap');*/

    return data;
  }

  async waterMapTilesFromToken(params: {
    userId: string;
    mapTilesCoordinatesDto: MapTileCoordinatesDto[];
  }): Promise<Output> {
    const { userId, mapTilesCoordinatesDto } = params;
    const { userMap, resourceMap } = await this.getUserMapContext(userId);
    const resourceGrid = this.getBaseGrid(
      resourceMap,
      'Resources',
      'mapResources'
    );
    const setQuery = {};
    const now = new Date().getTime();
    for (const mapTile of mapTilesCoordinatesDto) {
      const { x, y } = this.normalizeCoordinates(
        resourceGrid,
        mapTile.x,
        mapTile.y
      );

      const tileToModify = this.getCurrentTile(
        userMap,
        resourceMap,
        'Resources',
        'mapResources',
        x,
        y
      );

      // check if the tile is a farm tile. If the map tile is not in range of 7 and 19 it means that is not a farm tile
      if (!this.isFarmTile(tileToModify))
        throw new HttpException(
          `The tile ${x},${y} is not a farm tile ${this.getTileId(
            tileToModify
          )}`,
          HttpStatus.BAD_REQUEST
        );

      const newMapTile = Array.isArray(tileToModify)
        ? [...tileToModify]
        : this.buildResourceTile(this.getTileId(tileToModify));
      while (newMapTile.length < 5) {
        newMapTile.push(null);
      }
      newMapTile[2] = now;
      setQuery[`overrides.Resources.${this.getTileKey(x, y)}`] = newMapTile;
    }
    await this.userMapCRUD.update(userMap['_id'], { $set: setQuery });

    return {
      message: 'All tiles watered',
      code: 200,
    };
  }

  /**
   * Method to fertilising (It refers a farm tile) one map tile.
   * @param userId: Id of the user that has the map.
   * @param mapTileCoordinatesDto: Data to update.
   * @returns : new Object
   */
  async fertiliseMapTileFromToken(params: {
    userId: string;
    mapTileCoordinatesDto: MapTileCoordinatesDto;
  }): Promise<Output> {
    const { userId, mapTileCoordinatesDto } = params;

    const { userMap, resourceMap } = await this.getUserMapContext(userId);
    const resourceGrid = this.getBaseGrid(
      resourceMap,
      'Resources',
      'mapResources'
    );
    const { x, y } = this.normalizeCoordinates(
      resourceGrid,
      mapTileCoordinatesDto.x,
      mapTileCoordinatesDto.y
    );

    // get the tile from the map
    const tileToModify = this.getCurrentTile(
      userMap,
      resourceMap,
      'Resources',
      'mapResources',
      x,
      y
    );

    // check if the tile is a farm tile
    if (!this.isFarmTile(tileToModify))
      throw new HttpException(
        'The tile is not a farm tile',
        HttpStatus.BAD_REQUEST
      );

    // update the map tile
    const newMapTile = Array.isArray(tileToModify)
      ? [...tileToModify]
      : this.buildResourceTile(this.getTileId(tileToModify));
    while (newMapTile.length < 5) {
      newMapTile.push(null);
    }
    newMapTile[3] = new Date().getTime();

    const data = await this.userMapCRUD.update(userMap['_id'], {
      $set: {
        [`overrides.Resources.${this.getTileKey(x, y)}`]: newMapTile,
      },
    });

    /* this.userService.updateLastChange(userId, 'userMap');*/

    return data;
  }

  /**
   * Método para actualizar o crear electrodomésticos en la casa.
   * @param params: Datos del electrodoméstico.
   * @returns : nuevo objeto
   */
  async updateHouseAppliances(params: {
    userId: string;
    houseAppliancesDto: HouseAppliancesDto;
  }): Promise<Output> {
    const { userId, houseAppliancesDto } = params;
    const userMap = await this.getUserMapDocument(userId);
    return this.updateHouseAppliancesInContext({
      userMap,
      houseAppliancesDto,
    });
  }

  async updateIslandHouseAppliances(params: {
    userId: string;
    islandId: string;
    houseAppliancesDto: HouseAppliancesDto;
  }): Promise<Output> {
    const { userId, islandId, houseAppliancesDto } = params;
    const { userMap } = await this.getIslandMapContext(userId, islandId);
    return this.updateHouseAppliancesInContext({
      userMap,
      houseAppliancesDto,
    });
  }

  private async updateHouseAppliancesInContext(params: {
    userMap: any;
    houseAppliancesDto: HouseAppliancesDto;
  }): Promise<Output> {
    const { userMap, houseAppliancesDto } = params;
    const { type, index, id, tier } = houseAppliancesDto;

    if (!type || !id) {
      throw new HttpException(
        'type and id are required',
        HttpStatus.BAD_REQUEST
      );
    }
    const applianceIndex = this.toInteger(index, 'index');
    const applianceTier = this.toInteger(tier, 'tier');
    if (applianceIndex < 0 || applianceTier < 0) {
      throw new HttpException(
        'index and tier must be zero or positive',
        HttpStatus.BAD_REQUEST
      );
    }

    // Comprobar si existe 'HouseAppliances' en los datos del usuario
    const houseAppliances = this.getHouseAppliances(userMap);

    // Comprobar si el electrodoméstico ya existe
    const existingAppliance = houseAppliances.find(
      (appliance) =>
        appliance.type === type && appliance.index === applianceIndex
    );

    // Si el electrodoméstico existe, actualizarlo. Si no, crear uno nuevo.
    if (existingAppliance) {
      existingAppliance.id = id;
      existingAppliance.tier = applianceTier;
    } else {
      houseAppliances.push({
        ...houseAppliancesDto,
        index: applianceIndex,
        tier: applianceTier,
      });
    }

    // Actualizar el mapa del usuario
    const data = await this.userMapCRUD.update(userMap['_id'], {
      $set: {
        'overrides.HouseAppliances': houseAppliances,
      },
    });

    if (!data)
      throw new HttpException(
        'Error al actualizar el mapa del usuario',
        HttpStatus.INTERNAL_SERVER_ERROR
      );

    /* this.userService.updateLastChange(userId, 'userMap');*/

    return {
      totalCount: houseAppliances.length,
      results: houseAppliances,
    };
  }
}
