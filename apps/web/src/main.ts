import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./assets/main.css";

// NOTE: Leaflet (CSS + default-icon setup) is intentionally NOT imported here.
// It is loaded lazily by the only component that uses it (AnalysisMap.vue) so
// the map library stays out of the initial bundle / boot path.

const app = createApp(App);
app.use(router);
app.mount("#app");
