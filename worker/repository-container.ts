import { Container } from "@cloudflare/containers";

/** Short-lived singleton used only to shallow-fetch the public source repository. */
export class WikeloRepositoryContainer extends Container {
  defaultPort = 8787;
  sleepAfter = "5m";
  enableInternet = false;
  allowedHosts = ["github.com", "*.github.com", "objects.githubusercontent.com"];
}
