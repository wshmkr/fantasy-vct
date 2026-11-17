import Typography from "@mui/material/Typography";
import { APP_PRODUCT_NAME } from "@shared/branding";
import Pane from "../components/Pane";

export default function Home() {
  return (
    <Pane>
      <Typography variant="display">{APP_PRODUCT_NAME}</Typography>
    </Pane>
  );
}
