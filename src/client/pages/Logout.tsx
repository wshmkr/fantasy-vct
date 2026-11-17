import { API_ROUTES } from "@shared/api";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../apiClient";

export default function Logout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    apiClient.post(API_ROUTES.authLogout).finally(() => {
      queryClient.clear();
      navigate("/login", { replace: true });
    });
  }, [queryClient, navigate]);

  return null;
}
