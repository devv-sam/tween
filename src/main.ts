import "./core/modules/index";
import { Preview } from "./render/preview";
import { demo } from "./demo";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div class="stage"><canvas id="c"></canvas></div>
  <div class="bar">
    <button id="pp">play</button>
    <input id="seek" type="range" min="0" max="1" step="0.001" value="0" />
    <span id="t">0.00</span>
  </div>`;

const canvas = document.querySelector<HTMLCanvasElement>("#c")!;
const preview = new Preview(canvas, demo);

const pp = document.querySelector<HTMLButtonElement>("#pp")!;
const seek = document.querySelector<HTMLInputElement>("#seek")!;
const tlabel = document.querySelector<HTMLSpanElement>("#t")!;

preview.onTick = (t) => { seek.value = String(t); tlabel.textContent = t.toFixed(2); };

pp.onclick = () => {
  if (preview.playing) { preview.pause(); pp.textContent = "play"; }
  else { preview.play(); pp.textContent = "pause"; }
};

seek.oninput = () => { preview.pause(); pp.textContent = "play"; preview.seek(parseFloat(seek.value)); };

addEventListener("resize", () => preview.resize());
