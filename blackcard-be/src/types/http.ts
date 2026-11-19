/**
 * Stable axios surface for `tsc` on Linux/CI (CJS `moduleResolution: node` + axios package exports).
 */
import axios from 'axios';

export default axios;

/** Same as axios instance returned by `axios.create()`. */
export type AxiosInstance = ReturnType<typeof axios.create>;

export type AxiosResponse<T = unknown> = {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, unknown>;
  config?: unknown;
};

export type AxiosRequestConfig = {
  headers?: Record<string, string | undefined>;
  params?: Record<string, unknown>;
  timeout?: number;
  maxBodyLength?: number;
  maxContentLength?: number;
  responseType?: string;
  validateStatus?: (status: number) => boolean;
  paramsSerializer?: (params: Record<string, unknown>) => string;
};
