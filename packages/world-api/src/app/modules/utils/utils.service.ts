import { Injectable } from '@nestjs/common';

@Injectable()
export class UtilsService {
  getServerTime(): number {
    return new Date().getTime();
  }
}
