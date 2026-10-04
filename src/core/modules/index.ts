import { registerModule } from "../registry";
import { move } from "./move";
import { keyframes } from "./keyframes";
import { clonerGraph } from "./clonerGraph";
import { field } from "./field";
import { pulse } from "./pulse";

registerModule("move", move);
registerModule("keyframes", keyframes);
registerModule("clonerGraph", clonerGraph);
registerModule("field", field);
registerModule("pulse", pulse);
