import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";
import "leaflet/dist/leaflet.css";
import { initAuthSafe, startAuthLifecycleRecovery } from "./auth/auth";
import { setupLeafletDefaultIcons } from "./lib/leaflet-icons";

setupLeafletDefaultIcons();

function bootstrap() {
  const isCallbackRoute =
    typeof window !== "undefined" && window.location.pathname === "/auth/callback";

  const app = createApp(App);
  app.use(router);
  app.mount("#app");

  startAuthLifecycleRecovery();

  if (!isCallbackRoute) {
    void initAuthSafe();
  }
}

bootstrap();
