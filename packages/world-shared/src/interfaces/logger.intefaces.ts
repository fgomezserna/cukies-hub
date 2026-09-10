
export interface Metadata {
  [key: string]: any;
}

export interface ProcessedEvent {
  network?: string;
  timestamp?: string;
  name?: string;
  transactionId?: string;
  data?: {
    [key: string]: string;
  };
  metadata?: Metadata;
}

export interface CompletedEvent {
  eventInfo: { eventId?: string; timeStamp?: number };
  timestamp?: string;
  metadata?: Metadata;
}

export interface ErrorInfo {
  name?: string;
  message?: string;
  stack?: string;
  status?: number | string;
  metadata?: Metadata;
}

export interface ApiMetadata {
  functionName?: string;
  requestId?: string;
  ipAddress?: string;
  metadata?: Metadata;
}

export interface Payload {
  [key: string]: any;
  metadata?: Metadata;
}
