import { getDefaultCcRemovedHeader } from "@/lib/defaultCcRemoval";
import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

/** Default request budget — many CRM list/aggregate endpoints exceed 25s under load. */
const DEFAULT_AXIOS_TIMEOUT_MS = 120_000;

const axiosInstance: AxiosInstance = axios.create({
    baseURL: API_BASE_URL,
    timeout: DEFAULT_AXIOS_TIMEOUT_MS,
    headers: {
        'Content-Type': 'application/json',
    },
});

// axiosInstance.interceptors.request.use(
//     (config: InternalAxiosRequestConfig) => {
//         const token = localStorage.getItem('token')?.toString() || sessionStorage.getItem('token')?.toString();

//         if (token && config.headers) {
//             config.headers.Authorization = `Bearer ${token}`;
//         }

//         return config;
//     },
//     (error: AxiosError) => {
//         return Promise.reject(error);
//     }
// );

axiosInstance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
  
      const token =
        localStorage.getItem("token")?.toString() ||
        sessionStorage.getItem("token")?.toString();
  
      // 🔥 Don't overwrite existing Authorization header
      if (token && config.headers && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
  
        // Let the browser set Content-Type for FormData (multipart/form-data + boundary)
        if (config.data instanceof FormData && config.headers) {
            delete config.headers['Content-Type'];
        }

        // Default Cc chips (Mark@ / subs@) the user removed in the open mail popup.
        const removedDefaultCc = getDefaultCcRemovedHeader();
        if (removedDefaultCc && config.headers) {
            config.headers['x-default-cc-removed'] = removedDefaultCc;
        }

      return config;
    },
    (error: AxiosError) => Promise.reject(error)
  );

axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => {
        return response;
    },
    (error: AxiosError) => {
        if (error.response) {
            const { status } = error.response;
            const requestUrl = error.config?.url ?? '';
            const isLoginRequest = requestUrl.includes('/auth/login');

            const isDocusignIntegrationRequest = requestUrl.includes('/docusign/');
            const isPublicPortalRequest = requestUrl.includes('/public/application/');

            if (
                status === 401 &&
                !isLoginRequest &&
                !isDocusignIntegrationRequest &&
                !isPublicPortalRequest
            ) {
                localStorage.removeItem('token');
                sessionStorage.removeItem('token');
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
            }

            if (status === 403) {
                console.error('Access forbidden');
            }

            if (status === 500) {
                console.error('Internal server error');
            }
        }

        return Promise.reject(error);
    }
);

// export default axiosInstance;
export const axiosGet = (url: string, config?: AxiosRequestConfig) => axiosInstance.get(url, config);
export const axiosPost = (url: string, payload?: any, config?: AxiosRequestConfig) => axiosInstance.post(url, payload, config);
export const axiosPut = (url: string, payload?: any, config?: AxiosRequestConfig) => axiosInstance.put(url, payload, config);
export const axiosPatch = (url: string, payload?: any, config?: AxiosRequestConfig) => axiosInstance.patch(url, payload, config);
export const axiosDelete = (url: string, config?: AxiosRequestConfig) => axiosInstance.delete(url, config);

// FormData upload helper – interceptor clears Content-Type so browser sets multipart/form-data + boundary
export const axiosPostFormData = (
    url: string,
    formData: FormData,
    config?: AxiosRequestConfig
) =>
    axiosInstance.post(url, formData, { timeout: 120000, ...config });

export const axiosPatchFormData = (
    url: string,
    formData: FormData,
    config?: AxiosRequestConfig
) =>
    axiosInstance.patch(url, formData, { timeout: 120000, ...config });
