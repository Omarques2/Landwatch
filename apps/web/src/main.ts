import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";
import "leaflet/dist/leaflet.css";
import { initAuthOnce } from "./auth/auth";

async function bootstrap() {
  await initAuthOnce();

  const app = createApp(App);
  app.use(router);

  await router.isReady();
  app.mount("#app");
}

bootstrap();
