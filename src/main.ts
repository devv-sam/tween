import "./core/modules/index";
import { Preview } from "./render/preview";
import { exportMp4 } from "./export/mp4";
import { exportGif } from "./export/gif";
import { exportCode } from "./export/code";
import { downloadBlob, downloadText } from "./export/download";
import { demo } from "./demo";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div class="stage"><canvas id="c"></canvas></div>
  <div class="bar">
    <button id="pp">play</button>
    <input id="seek" type="range" min="0" max="1" step="0.001" value="0" />
    <span id="t">0.00</span>
    <button id="mp4">mp4</button><button id="gif">gif</button><button id="code">code</button>
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

const on = (id: string, fn: () => void) => (document.querySelector<HTMLButtonElement>(id)!.onclick = fn);

on("#mp4", async () => {
  try { downloadBlob(await exportMp4(demo), "tween.mp4"); }
  catch (e) { alert((e as Error).message); }
});
on("#gif", () => downloadBlob(exportGif(demo), "tween.gif"));
on("#code", () => downloadText(exportCode(demo), "tween.html"));
