import { createApp } from "vue";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";

// NOTE: Leaflet (CSS + default-icon setup) is intentionally NOT imported here.
// It is loaded lazily by the only component that uses it (AnalysisMap.vue) so
// the map library stays out of the initial bundle / boot path.

const app = createApp(App);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

app.use(router);
app.use(VueQueryPlugin, { queryClient });
app.mount("#app");
