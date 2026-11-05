import axios from "axios";
import NProgress from "nprogress";

export const API_BASE = import.meta.env.VITE_API_BASE;

const client = axios.create({ baseURL: API_BASE });

let activeRequests = 0;

client.interceptors.request.use((config) => {
  if (activeRequests === 0) {
    NProgress.start();
  }
  activeRequests++;

  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => {
    activeRequests = Math.max(0, activeRequests - 1);
    if (activeRequests === 0) {
      NProgress.done();
    }
    return res;
  },
  (err) => {
    activeRequests = Math.max(0, activeRequests - 1);
    if (activeRequests === 0) {
      NProgress.done();
    }
    if (err?.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (!location.pathname.startsWith("/login")) {
        location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default client;
