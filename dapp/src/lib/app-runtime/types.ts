export type AppRuntimeServiceName = 'indexer' | 'master' | 'credits';

export type AppRuntimeServiceStatus = {
  status: 'ready' | 'syncing' | 'unavailable' | 'disabled';
  checkedAt: string;
  lastSuccessAt: string | null;
  code: string | null;
};

export type AppRuntimeStatus = {
  checkedAt: string;
  services: Record<AppRuntimeServiceName, AppRuntimeServiceStatus>;
};
