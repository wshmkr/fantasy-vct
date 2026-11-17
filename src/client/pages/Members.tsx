import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import { keyframes } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { type AddMemberBody, API_ROUTES } from "@shared/api";
import type { User } from "@shared/entities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { apiClient } from "../apiClient";
import ErrorLabel from "../components/ErrorLabel";
import ManagerAvatar from "../components/ManagerAvatar";
import Pane from "../components/Pane";
import { useMe } from "../useMe";

const MEMBERS_QUERY_KEY = ["members"];

const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
`;

function AddMemberForm() {
  const queryClient = useQueryClient();
  const [discordUsername, setDiscordUsername] = useState("");
  const addMember = useMutation({
    mutationFn: (body: AddMemberBody) =>
      apiClient.post<User>(API_ROUTES.members, body),
    onSuccess: () => {
      setDiscordUsername("");
      queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (discordUsername.trim()) addMember.mutate({ discordUsername });
  }

  return (
    <Box
      component="form"
      onSubmit={submit}
      sx={{ display: "flex", gap: "10px", alignItems: "center" }}
    >
      <InputBase
        value={discordUsername}
        onChange={(event) => {
          setDiscordUsername(event.target.value);
          addMember.reset();
        }}
        placeholder="discord username"
        inputProps={{ "aria-label": "Discord username" }}
        startAdornment={
          <Box component="span" sx={{ color: "var(--ink-muted)", mr: 0.5 }}>
            @
          </Box>
        }
        error={addMember.isError}
        sx={[
          { flex: 1, px: "14px" },
          addMember.isError && { animation: `${shake} 200ms ease-out 2` },
        ]}
      />
      <ErrorLabel message={addMember.error?.message} />
      <Button
        type="submit"
        variant="contained"
        startIcon={<Plus size={16} />}
        disabled={addMember.isPending}
        sx={{ height: 44, px: "18px" }}
      >
        Add
      </Button>
    </Box>
  );
}

function MemberRow({ member }: { member: User }) {
  const queryClient = useQueryClient();
  const removeMember = useMutation({
    mutationFn: () => apiClient.delete(API_ROUTES.member(member.id)),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: MEMBERS_QUERY_KEY }),
  });
  const hasLoggedIn = member.firstLoginAt !== null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        height: 42,
        px: 1.5,
        borderRadius: "var(--radius-md)",
        "&:hover": { bgcolor: "var(--pane-hover)" },
        "&:hover .remove-member": { opacity: 1 },
      }}
    >
      <ManagerAvatar user={member} size={30} dimmed={!hasLoggedIn} />
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
        }}
      >
        {member.displayName && (
          <Typography
            variant="bodyStrong"
            sx={{ color: hasLoggedIn ? "var(--ink)" : "var(--ink-muted)" }}
          >
            {member.displayName}
          </Typography>
        )}
        <Typography
          variant="body"
          component="span"
          sx={{ fontSize: 13, color: "var(--ink-muted)" }}
        >
          @{member.discordUsername}
        </Typography>
      </Box>
      {member.role === "commissioner" ? (
        <Tooltip title="Commissioner">
          <Box
            component="span"
            aria-label="Commissioner"
            sx={{ display: "flex", color: "var(--accent)", px: 1 }}
          >
            <Crown size={17} aria-hidden />
          </Box>
        </Tooltip>
      ) : (
        <Tooltip title="Remove">
          <IconButton
            className="remove-member"
            aria-label={`Remove ${member.discordUsername}`}
            onClick={() => removeMember.mutate()}
            disabled={removeMember.isPending}
            size="small"
            sx={{
              opacity: 0.35,
              color: "var(--loss)",
              transition: "opacity 150ms ease-out",
              "&:focus-visible": { opacity: 1 },
            }}
          >
            <Trash2 size={15} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

export default function Members() {
  const me = useMe();
  const isCommissioner = me.data?.role === "commissioner";
  const members = useQuery({
    queryKey: MEMBERS_QUERY_KEY,
    queryFn: () => apiClient.get<User[]>(API_ROUTES.members),
    enabled: isCommissioner,
  });

  return (
    <Box
      sx={{
        maxWidth: 760,
        mx: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      <Typography variant="display">Members</Typography>
      {isCommissioner && (
        <>
          <AddMemberForm />
          <Pane dense sx={{ p: "6px" }}>
            {members.data?.map((member) => (
              <MemberRow key={member.id} member={member} />
            ))}
          </Pane>
        </>
      )}
    </Box>
  );
}
