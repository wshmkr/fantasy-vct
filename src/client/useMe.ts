import { API_ROUTES } from "@shared/api";
import type { User } from "@shared/entities";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./apiClient";

export const ME_QUERY_KEY = ["me"];

export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiClient.get<User>(API_ROUTES.me),
    retry: false,
  });
}
