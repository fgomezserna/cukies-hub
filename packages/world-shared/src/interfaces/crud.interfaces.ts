export interface IResponseCRUD {
  totalCount?: number;
  results: any[];
}

export interface IResponse {
  code?: number;
  message: string;
}
export interface IGet {
  skip?: number;
  limit?: number;
  filterType?: string;
  filterQuery?: Record<string, any>;
  order?: string;
  populate?: string[];
}

export type Output = IResponseCRUD | IResponse;

export function isResponseCRUD(data: Output): data is IResponseCRUD {
  return (data as IResponseCRUD).results !== undefined;
}

export function isResponse(data: Output): data is IResponse {
  return (data as IResponse).message !== undefined;
}
