import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { API_ROUTES } from "@shared/api";
import { APP_PRODUCT_NAME } from "@shared/branding";
import { displayNameOf, type User } from "@shared/entities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, LogIn } from "lucide-react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { apiClient } from "../apiClient";
import ManagerAvatar from "../components/ManagerAvatar";
import Pane from "../components/Pane";
import { LogoMark } from "../components/SiteLogo";
import Background from "../layout/Background";
import { ME_QUERY_KEY, useMe } from "../useMe";

function NoAccess({ discordUsername }: { discordUsername: string }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1.5,
      }}
    >
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: "var(--radius-full)",
          bgcolor: "color-mix(in srgb, var(--loss) 10%, transparent)",
          boxShadow:
            "inset 0 0 0 1px color-mix(in srgb, var(--loss) 33%, transparent)",
          color: "var(--loss)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Lock aria-hidden />
      </Box>
      <Typography variant="bodyStrong">No access</Typography>
      {discordUsername && (
        <Typography variant="body" sx={{ color: "var(--ink-muted)" }}>
          @{discordUsername}
        </Typography>
      )}
    </Box>
  );
}

function DevLogin({ devUsers }: { devUsers: User[] }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const devLogin = useMutation({
    mutationFn: (userId: number) =>
      apiClient.post<User>(API_ROUTES.authDev, { userId }),
    onSuccess: (user) => {
      queryClient.setQueryData(ME_QUERY_KEY, user);
      navigate("/", { replace: true });
    },
  });

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "14px",
      }}
    >
      {devUsers.map((user) => {
        const name = displayNameOf(user);
        return (
          <ButtonBase
            key={user.id}
            aria-label={`Log in as ${name}`}
            onClick={() => devLogin.mutate(user.id)}
            sx={{
              width: 64,
              flexDirection: "column",
              gap: 1,
              borderRadius: "var(--radius-md)",
              color: "var(--ink-muted)",
              transition: "transform 180ms ease-out, color 180ms ease-out",
              "&:hover": { transform: "translateY(-2px)", color: "var(--ink)" },
            }}
          >
            <ManagerAvatar user={user} size={52} />
            <Typography variant="label" noWrap sx={{ maxWidth: "100%" }}>
              {name}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function DiscordLogin() {
  return (
    <Button
      variant="contained"
      fullWidth
      href={API_ROUTES.authDiscord}
      startIcon={<LogIn size={18} />}
      sx={{ py: 1.5, fontSize: 15 }}
    >
      Log in with Discord
    </Button>
  );
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const deniedUsername = searchParams.get("denied");
  const me = useMe();
  const devUsers = useQuery({
    queryKey: ["dev-users"],
    queryFn: () => apiClient.get<User[]>(API_ROUTES.authDevUsers),
    retry: false,
  });

  if (me.data) return <Navigate to="/" replace />;

  return (
    <>
      <Background />
      {/* The login card is a dialog-like surface, so it's the one centered layout. */}
      <Box
        component="main"
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          px: 2,
          py: 6,
        }}
      >
        <Pane
          sx={{
            width: "100%",
            maxWidth: 380,
            borderRadius: "var(--radius-xl)",
            px: 4,
            pt: 5,
            pb: 4,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "28px",
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <LogoMark size={52} />
            <Typography
              variant="h1"
              sx={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}
            >
              {APP_PRODUCT_NAME}
            </Typography>
          </Box>
          {deniedUsername !== null ? (
            <NoAccess discordUsername={deniedUsername} />
          ) : devUsers.data ? (
            <DevLogin devUsers={devUsers.data} />
          ) : devUsers.isError ? (
            <DiscordLogin />
          ) : null}
        </Pane>
      </Box>
    </>
  );
}
