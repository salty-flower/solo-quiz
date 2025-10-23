import { mount } from "svelte";
import "./app.postcss";
import App from "./App.svelte";

const target = document.getElementById("app");

if (!target) {
  throw new Error("Failed to locate #app container");
}

const app = mount(App, {
  target,
});

export default app;
