// defined in setup() once
let cnv;
let interfaceBuffer = undefined; // in setup()
let currentPainting = undefined; // in setup()

// initially set in setup()
let canvasColor = undefined;
let currentBrush = undefined;
let previousBrush = undefined;

const paintingState = {
  width: () => Math.min(width, height)-150,
  height: () => Math.min(width, height)-150,
  x: () => Math.floor((width - paintingState.width())/2),
  y: () => Math.floor((height - paintingState.height())/2),
}
let gadgetRadius; // based on canvas size

// menu
let toolPresets = [
  {brush: "Brush Tool", texture: "Regular", menuName: "Brush"},
  {brush: "Brush Tool", texture: "Rake",    menuName: "Rake" },
  {brush: "Brush Tool", texture: "Round",   menuName: "Round"},
];

// control
let isTouchControl = undefined;
let ongoingTouches = []; 
let pointerDown = false;

const pen = {
  x: undefined,
  y: undefined,
  startX: undefined,
  startY: undefined,
  startAngle: undefined,
  startPressure: undefined,
  startTimeStamp: undefined,
  lastX: undefined,
  lastY: undefined,
  lastAngle: undefined,
  lastPressure: undefined,
  started: false,
  wasDown: false,
  isDown: false,
  angle: undefined,
  altitude: undefined,
  pressure: undefined
};
const hover = {
  x: undefined,
  y: undefined,
  angle: undefined,
  lastX: undefined,
  lastY: undefined
};
// state
let currentInputMode;
let editMode = false;

// touch control state
const menuState = {
  onPage: 0,
  hoverPage: null,
  lastGadgetPage: undefined,
  topSliderStartX: undefined,
  topSliderDeltaX: undefined,
  startedEventOnMenu: false,
  screenPointerX: null,
  screenPointerY: null,
  screenHoverX: undefined,
  screenHoverY: undefined
};
let gadgetStartX;
let gadgetStartY;

const editState = {
  lastX: undefined,
  lastY: undefined
}

let drawSliders = true;

let fontRegular; let fontItalic; let fontMedium;
function preload() {
  fontRegular = loadFont('assets/IBMPlexSans-Regular.ttf');
  fontItalic = loadFont('assets/IBMPlexSans-Italic.ttf');
  fontMedium = loadFont('assets/IBMPlexSans-Medium.ttf');
}



class BrushSettings {
  /**
   * Creates an instance of BrushSettings.
   * @param {HSLColor} color The base color of the brush.
   * @param {number} size The size of the brush, in the range [0-1].
   * @param {number} colorVar The color variation strength, in the range [0-1].
   * @param {string} tool The name of the tool.
   * @param {string} texture The name of the texture.
   */
  constructor(color, size, colorVar, tool, texture) {
    this.color = color.copy();
    this.size = size;
    this.colorVar = colorVar;
    this.tool = tool;
    this.texture = texture;
  }

  copy() {
    return new BrushSettings(this.color, this.size, this.colorVar, this.tool, this.texture);
  }

  /**
   * Get the actual size in pixels from the abstract 0-1 size value. Not linear.
   */
  get pxSize() {
    const pxSize = map(easeInCirc(this.size, 0, 1), 0, 1, 4, 600);
    return pxSize;
  }

  getColorWithVar(seed) {
    return this.color.copy().varyComponents(seed, this.colorVar);
  }
}


class BrushStrokePoint {
  /**
   * Creates an instance of BrushStrokePoint.
   * @param {number} x The x coordinate of the point.
   * @param {number} y The y coordinate of the point.
   * @param {number|undefined} azimuthAngle The angle of the pen at this point.
   * @param {number|undefined} force The pen pressure detected at this point.
   */
  constructor(x, y, azimuthAngle, force) {
    this.x = x;
    this.y = y;
    this.azimuthAngle = azimuthAngle;
    this.force = force;
    this.seed = x * y;
  }

  move(xDelta, yDelta) {
    if (xDelta === 0 && yDelta === 0) return;
    this.x += xDelta;
    this.y += yDelta;
    // the seed stays the same, doesn't also change with moved position
  }
}


class BrushStroke {
  /**
   * Creates an instance of BrushStroke.
   * Contains an array of points.
   * @param {p5.graphics} buffer A p5 Graphics buffer.
   * @param {BrushSettings} settings The settings for the brush. May be modified later. 
   */
  constructor(buffer, settings = currentBrush.copy()) {
    this.buffer = buffer;
    this.points = [];
    this.settings = settings;
  }

  get bounds() {
    const margin = this.settings.pxSize*0.5;
    const xmin = this.points.reduce((a, b) => Math.min(a, b.x),  Infinity) - margin;
    const xmax = this.points.reduce((a, b) => Math.max(a, b.x), -Infinity) + margin;
    const ymin = this.points.reduce((a, b) => Math.min(a, b.y),  Infinity) - margin;
    const ymax = this.points.reduce((a, b) => Math.max(a, b.y), -Infinity) + margin;
    return {x: xmin, y:ymin, width: xmax-xmin, height: ymax-ymin};
  }

  addPoint(point) {
    this.points.push(new BrushStrokePoint(point.x,  point.y,  point.azimuthAngle, point.force));
  }

  movePoints(xDelta, yDelta) {
    if (xDelta === 0 && yDelta === 0) return;
    this.points.forEach((point) => point.move(xDelta, yDelta));
  }

  reset() {
    this.buffer.clear();
    this.points = [];
    this.settings = currentBrush.copy();
  }

  renderWholeStroke() {
    if(this.points.length < 2) {
      //console.log("can't draw stroke, too short:", strokeData.length, strokeData)
      return;
    }
    // wip, ignores tool for now
    this.points.forEach((point, index) => {
      const lastPoint = this.points[index - 1];
      if (lastPoint !== undefined) { 
        this.renderStrokePart(lastPoint, point);
      }
    });
  }

  // WIP, currently ignores tool
  /**
   * Render two points of the stroke.
   * @param {BrushStrokePoint} start The first point of the stroke segment.
   * @param {BrushStrokePoint} end The second point of the stroke segment.
   * @returns 
   */
  renderStrokePart(start, end) {

    if (start === undefined || end === undefined) {
      console.log("can't draw this stroke part, point(s) missing!");
      return;
    } 
    if (start.x === end.x && start.y === end.y) return;

    start.azimuthAngle ??= end.azimuthAngle;
    start.azimuthAngle ??= p5.Vector.angleBetween(createVector(0, -1), createVector(end.x-start.x, end.y-start.y));
      end.azimuthAngle ??= p5.Vector.angleBetween(createVector(0, -1), createVector(end.x-start.x, end.y-start.y));

      end.force ??= start.force;
    start.force ??= 0.1;
      end.force ??= 0.1;

    const avgPressure = (start.force + end.force) / 2;

    this.buffer.noStroke();

    const brushSize = this.settings.pxSize * (this.settings.texture === "Round" ? 0.7 : 1);
    const steps = Math.floor(map(brushSize, 10, 300, 10, 200) * (this.settings.texture === "Round" ? 0.3 : 1));

    for (let i = 0; i < steps; i++) {

      const drawStep = (this.settings.texture !== "Rake" || i % 3 == 0 || i == steps-1)

      if (drawStep) {
        const lowerSide = i/steps - 0.5;
        const higherSide = (i+1)/steps - 0.5;
    
        const rf = (i !== 0 && i !== steps-1) ? 0.1 * brushSize * this.settings.colorVar : 0; // randomness matches increasing variation

        const lerpPart = HSLColor.noiseValue(i + (start.x !== undefined ? start.x + start.y : 0));
        const middleX = lerp(start.x, end.x, lerpPart);
        const middleY = lerp(start.y, end.y, lerpPart);

        const startEdgeVectorLower  = p5.Vector.fromAngle(start.azimuthAngle, lowerSide*brushSize*map(start.force, 0, 0.3, 0.3, 2.0, true));
        const startEdgeVectorHigher = p5.Vector.fromAngle(start.azimuthAngle, higherSide*brushSize*map(start.force, 0, 0.3, 0.3, 2.0, true));

        const endEdgeVectorLower    = p5.Vector.fromAngle(end.azimuthAngle, lowerSide*brushSize*map(end.force, 0, 0.3, 0.3, 2.0, true));
        const endEdgeVectorHigher   = p5.Vector.fromAngle(end.azimuthAngle, higherSide*brushSize*map(end.force, 0, 0.3, 0.3, 2.0, true));

        let avgAngle = lerp(start.azimuthAngle, end.azimuthAngle, lerpPart);
        const midEdgeVectorLower    = p5.Vector.fromAngle(avgAngle, lowerSide*brushSize*map(avgPressure, 0, 0.3, 0.3, 2.0, true));
        const midEdgeVectorHigher   = p5.Vector.fromAngle(avgAngle, higherSide*brushSize*map(avgPressure, 0, 0.3, 0.3, 2.0, true));


        if (HSLColor.noiseValue(start.seed * i) < start.force * 4) {
          const brushCol = this.settings.getColorWithVar(i + start.seed);

          if (this.settings.texture === "Round") {
            this.buffer.stroke(brushCol.hex);
            this.buffer.strokeWeight(2 * brushSize / steps);
            this.buffer.line(
              start.x + startEdgeVectorLower.x, start.y + startEdgeVectorLower.y, 
              middleX + midEdgeVectorLower.x, middleY + midEdgeVectorLower.y
            );
            this.buffer.line(
              start.x + startEdgeVectorHigher.x, start.y + startEdgeVectorHigher.y, 
              middleX + midEdgeVectorHigher.x, middleY + midEdgeVectorHigher.y
            );
          } else {
            this.buffer.fill(brushCol.hex);
            this.buffer.beginShape();
            randomizedVertex(this.buffer, start.x, startEdgeVectorLower.x , start.y, startEdgeVectorLower.y , rf);
            randomizedVertex(this.buffer, start.x, startEdgeVectorHigher.x, start.y, startEdgeVectorHigher.y, rf);
            randomizedVertex(this.buffer, middleX, midEdgeVectorHigher.x, middleY, midEdgeVectorHigher.y, rf);
            randomizedVertex(this.buffer, middleX, midEdgeVectorLower.x, middleY, midEdgeVectorLower.y, rf);
            this.buffer.endShape();
          }
        }

        if (HSLColor.noiseValue(end.seed * i) < end.force * 4) {
          const brushCol2 = this.settings.getColorWithVar(i + end.seed);

          if (this.settings.texture === "Round") {
            this.buffer.stroke(brushCol2.hex);
            this.buffer.strokeWeight(2 * brushSize / steps);
            this.buffer.line(
              middleX + midEdgeVectorLower.x, middleY + midEdgeVectorLower.y, 
              end.x + endEdgeVectorLower.x, end.y + endEdgeVectorLower.y
            );
            this.buffer.line(
              middleX + midEdgeVectorHigher.x, middleY + midEdgeVectorHigher.y, 
              end.x + endEdgeVectorHigher.x, end.y + endEdgeVectorHigher.y
            );
          } else {
            this.buffer.fill(brushCol2.hex);
            this.buffer.beginShape();
            randomizedVertex(this.buffer, middleX, midEdgeVectorLower.x , middleY, midEdgeVectorLower.y , rf);
            randomizedVertex(this.buffer, middleX, midEdgeVectorHigher.x, middleY, midEdgeVectorHigher.y, rf);
            randomizedVertex(this.buffer, end.x  , endEdgeVectorHigher.x, end.y  , endEdgeVectorHigher.y, rf);
            randomizedVertex(this.buffer, end.x  , endEdgeVectorLower.x , end.y  , endEdgeVectorLower.y , rf);
            this.buffer.endShape();
          }
        }
      }
    }

    function randomizedVertex(buffer, x, xOff, y, yOff, randomFactor) {
      buffer.vertex(
        x + xOff + HSLColor.noiseValue(x) * randomFactor, 
        y + yOff + HSLColor.noiseValue(y) * randomFactor
      );
    }
  }
}


class Painting {
  /**
   * Creates an instance of Painting.
   * Will contain a main buffer as a set number of temporary strokes that can be undone or edited, with their own methods.
   * @param {number} width The initial width in pixels.
   * @param {number} height The initial height in pixels.
   * @param {HSLColor} backgroundColor The initial background color.
   */
  constructor(width, height, backgroundColor) {
    this.width = width;
    this.height = height;
    this.mainBuffer = createGraphics(width, height);
    this.editableStrokesInUse = 0;
    this.editableStrokes = Array.from({ length: 16 }, () => new BrushStroke(createGraphics(width, height), currentBrush.copy()));

    this.clearWithColor(backgroundColor); // WIP, this is currently missing anything for display density
  }

  get editableStrokesCount() {
    return this.editableStrokesInUse;
  }

  get usedEditableStrokes() {
    return this.editableStrokes.slice(0, this.editableStrokesInUse);
  }

  get oldStrokesBuffer() {
    return this.mainBuffer;
  }

  get latestStroke() {
    if (this.editableStrokesInUse === 0) {
      console.log("no stroke to get!");
      return;
    }
    return this.editableStrokes[this.editableStrokesInUse-1];
  }

  get brushSettingsToAdjust() {
    return editMode ? this.latestStroke.settings : currentBrush;
  }

  clearWithColor(color) {
    this.mainBuffer.background(color.hex);
    this.editableStrokes.forEach((stroke) => {
      stroke.reset();
    });
    this.editableStrokesInUse = 0;
  }

  applyOldestStroke() {
    // remove oldest, draw image
    const oldestStroke = this.editableStrokes.shift();
    this.mainBuffer.image(oldestStroke.buffer, 0, 0);

    // add again to the end after clearing
    oldestStroke.reset();
    this.editableStrokes.push(oldestStroke);
    this.editableStrokesInUse -= 1;
  }

  applyAllStrokes() {
    console.log("cleared undo stack, added all strokes to painting.");
    while(this.editableStrokesInUse > 0) {
      this.applyOldestStroke();
    }
  }

  startStroke() {
    if (this.editableStrokesInUse > this.editableStrokes.length - 1) this.applyOldestStroke();
    this.editableStrokesInUse += 1;
    //console.log("started new stroke:", this.editableStrokesInUse);
    const currentStroke = this.editableStrokes[this.editableStrokesInUse-1];
    currentStroke.reset();
  }

  updateStroke(newPoint) {
    if (this.editableStrokesInUse === 0) {
      console.log("nothing to update!");
      return;
    }
    this.latestStroke.addPoint(newPoint);
  }

  popLatestStroke() {
    if (this.editableStrokesInUse === 0) {
      console.log("nothing to undo!");
      return;
    }
    this.latestStroke.reset();
    this.editableStrokesInUse--;
    console.log(this.editableStrokesInUse, "editable strokes still present.")
  }

  download() {
    const timestamp = new Date().toLocaleString().replace(/[-:T.]/g, "-").replace(/, /g, "_");
    saveCanvas(this.mainBuffer, "drawlab-canvas_" + timestamp, "png");
  }

  moveLatestStroke(x, y) {
    if (this.editableStrokesInUse === 0) {
      console.log("nothing to move!");
      return;
    }
    this.latestStroke.buffer.clear();
    this.latestStroke.movePoints(x, y);
    this.latestStroke.renderWholeStroke();
  }

  redrawLatestStroke() {
    if (this.editableStrokesInUse === 0) {
      console.log("nothing to redraw!");
      return;
    }
    this.latestStroke.buffer.clear();
    this.latestStroke.renderWholeStroke();
  }

  continueDrawing() {
    if (this.editableStrokesInUse === 0) {
      console.log("nowhere to draw in, stroke was never initialized!");
      return;
    }

    if(this.latestStroke.points.length < 2) {
      //console.log("nothing to draw yet, only contains:", this.latestStroke.points.length, this.latestStroke)
      return;
    }
    const start = this.latestStroke.points[0];
    const newPoint = this.latestStroke.points[this.latestStroke.points.length-1];

    //draw to the stroke buffer immediately
    if (["Stamp Tool", "Fan Line Tool", "Brush Tool"].includes(this.latestStroke.settings.tool)) {
    
      const lastPoint = this.latestStroke.points[this.latestStroke.points.length - 2];
      this.latestStroke.renderStrokePart(lastPoint, newPoint);

    } else if (!pen.isDown && pen.wasDown) {
      
      // drawn when pen lifted
      this.latestStroke.buffer.clear();
      this.latestStroke.renderStrokePart(start, newPoint);
    }
  }
}

// Main color representation in OKHSL. Converted to hex color using the helper file.
class HSLColor {
  static RANDOM_VALUES = Array.from({ length: 256 }, () => Math.random() * 2 - 1);

  static lerpColorInHSL(color1, color2, lerpAmount) {
    const lerpedH = lerp(color1.h, color2.h, lerpAmount);
    const lerpedS = lerp(color1.s, color2.s, lerpAmount);
    const lerpedL = lerp(color1.l, color2.l, lerpAmount);
    // don't lerp alpha. if needed, could be a separate function.
    return new HSLColor(lerpedH, lerpedS, lerpedL);
  }

  static fromRGBwithFallback(r, g, b, fallbackColor) {
    const result_array = srgb_to_okhsl(r, g, b);
    // default to fallback hue if gray
    if (result_array[1] < 0.01) result_array[2] = fallbackColor.h;
    return new HSLColor(result_array[0], result_array[1], result_array[2]);
  }

  static noiseValue(seed) {
    seed = Math.floor(Math.abs(seed));
    return this.RANDOM_VALUES[seed % this.RANDOM_VALUES.length];
  }

  /**
   * Creates an instance of HSLColor.
   *
   * @param {number} h - The hue component, in the range [0, 1].
   * @param {number} s - The saturation component, in the range [0, 1].
   * @param {number} l - The lightness component, in the range [0, 1].
   * @param {number} [a=1] - The alpha (opacity) component, in the range [0, 1]. Defaults to 1.
   */
  constructor(h, s, l, a = 1) {
    this.h = h;
    this.s = s;
    this.l = l;
    this.a = a;
  }

  #toRGBArray() {
    return okhsl_to_srgb(this.h, this.s, this.l); // from conversion helpers file
  }

  #alphaToHex(a = this.a) {
    if (a === 1) return "";
    const hex = Math.round(a * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }

  /**
   * Create a copy of the current color.
   * @returns {HSLColor} A new HSLColor instance with the same components.
   */
  copy() {
    return new HSLColor(this.h, this.s, this.l, this.a);
  }

  /**
   * @param {number} value - The new hue value (between 0 and 1).
   */
  setHue(value) {
    // if (value < -1) {
    //   value = 1 + (value % 1);
    // } else if (value > 2) {
    //   value %= 1;
    // }

    this.h = value;
    return this;
  }
  /**
   * @param {number} value - The new saturation value (between 0 and 1).
   */
  setSaturation(value) {
    this.s = value;
    return this;
  }
  /**
   * @param {number} value - The new luminance value (between 0 and 1).
   */
  setLuminance(value) {
    this.l = value;
    return this;
  }
  /**
   * @param {number} value - The new alpha value (between 0 and 1).
   */
  setAlpha(value) {
    this.a = value;
    return this;
  }

  /**
   * Create a copy of the current color that is darker and limited in saturation.
   */
  behind() {
    return new HSLColor(this.h, Math.min(this.s, 0.2), this.l * 0.8, this.a);
  }

  varyComponents(seed, strength = 0.5) {
    if (strength === 0) return this;
    seed = Math.abs(seed);
    //seed += this.h*this.s*this.l*100;

    // add noise
    const lNoiseValue = HSLColor.RANDOM_VALUES[Math.floor(seed*300   ) % HSLColor.RANDOM_VALUES.length];
    const hNoiseValue = HSLColor.RANDOM_VALUES[Math.floor(seed*400+50) % HSLColor.RANDOM_VALUES.length];
    this.l += lNoiseValue * lerp(easeInCirc(strength), strength, 0.1);
    this.h += hNoiseValue * lerp(strength, easeInCirc(strength), easeOutCubic(this.s));
    
    // make sure the components are still in range
    this.l = Math.max(0, Math.min(1, this.l));
    this.s = Math.min(1, this.s);

    return this;
  }

  get hex() {
    const rgbArray = this.#toRGBArray();
    const rgbHexString = rgb_to_hex(rgbArray[0], rgbArray[1], rgbArray[2]); // from conversion helpers file
    return rgbHexString + this.#alphaToHex(); 
  }

  get hue() {
    return this.h;
  }
  get saturation() {
    return this.s;
  }
  get luminance() {
    return this.l;
  }

  toHexWithSetAlpha(a) {
    const rgbArray = this.#toRGBArray();
    const rgbHexString = rgb_to_hex(rgbArray[0], rgbArray[1], rgbArray[2]); // from conversion helpers file
    return rgbHexString + this.#alphaToHex(a); 
  }
}


function setup() {
  canvasColor = new HSLColor(0.6, 0.1, 0.15);

  currentBrush = new BrushSettings(
    new HSLColor(0.6, 0.6, 0.7), 
    0.35, 0.5, 
    toolPresets[0].brush, toolPresets[0].texture
  );

  cnv = createCanvas(windowWidth - 10, windowHeight - 10);
  newCanvasSize();
  cnv.id("myCanvas");
  const el = document.getElementById("myCanvas");
  el.addEventListener("touchstart", handleTouchStart);
  el.addEventListener("touchmove", handleTouchMove);
  el.addEventListener("touchend", handleTouchEnd);
  el.addEventListener("pointerdown", handlePointerChangeEvent);
  el.addEventListener("pointerup", handlePointerChangeEvent);
  el.addEventListener("pointercancel", handlePointerChangeEvent);
  el.addEventListener("pointermove", handlePointerMoveEvent);
  noLoop();
  
  pen.x = width/2;
  pen.y = height/2;
  gadgetStartX = pen.x;
  gadgetStartY = pen.y;

  currentPainting = new Painting(paintingState.width(), paintingState.height(), canvasColor);

  document.body.style.backgroundColor = canvasColor.behind().hex;

  // Create a graphics buffer for the indicator
  interfaceBuffer = createGraphics(width, height);
  interfaceBuffer.strokeWeight(6);
  interfaceBuffer.textFont(fontMedium);
  interfaceBuffer.textAlign(LEFT, CENTER);
  newInterfaceSize();
  
  draw();
}

function windowResized() {
  newCanvasSize();
  newInterfaceSize();
  draw();
}

function newCanvasSize() {
  const scrollBarMargin = (isTouchControl === false) ? 10 : 0;
  resizeCanvas(windowWidth - scrollBarMargin, windowHeight - 0);
  gadgetRadius = (width > 300) ? 120 : 60;
  print("Window size now", width, height, "Canvas size", paintingState.width(), paintingState.height());
}

function newInterfaceSize() {
  interfaceBuffer.resizeCanvas(width, height);
  interfaceBuffer.textSize((width < height) ? 13 : 16);
}

function handleTouchStart(event) {
  event.preventDefault();
  if (isTouchControl === undefined) {
    isTouchControl = true;
    print("Device detected as touch-screen (use pencil and fingers if enabled)");
  }
  event.changedTouches.forEach((touch) => {
    ongoingTouches.push(copyTouch(touch));
  });
  updateInput(event);
  draw();
}

function handleTouchMove(event) { 
  event.preventDefault();
  event.changedTouches.forEach((touch) => {
    let idx = ongoingTouchIndexById(touch.identifier);
    if (idx >= 0) {
      ongoingTouches.splice(idx, 1, copyTouch(touch)); // swap in the new touch record
    }
  });
  updateInput(event);
  draw();
}
function handleTouchEnd(event) { 
  event.preventDefault();
  event.changedTouches.forEach((touch) => {
    let idx = ongoingTouchIndexById(touch.identifier);
    ongoingTouches.splice(idx, 1); // remove it; we're done
  });
  if (event.touches.length === 0) {
    ongoingTouches = [];
  }
  updateInput(event);
  draw();
}
function copyTouch({identifier, clientX, clientY, force, touchType, azimuthAngle, altitudeAngle}) {
  return {identifier, clientX, clientY, force, touchType, azimuthAngle, altitudeAngle};
}

function ongoingTouchIndexById(idToFind) {
  for (let i = 0; i < ongoingTouches.length; i++) {
    const id = ongoingTouches[i].identifier;

    if (id === idToFind) {
      return i;
    }
  }
  return -1; // not found
}

function handlePointerChangeEvent(event) {
  event.preventDefault();
  if (isTouchControl === undefined) {
    if (event.pointerType === "pen" || event.pointerType === "touch") {
      isTouchControl = true;
      print("Device detected as touch-screen (use pencil and fingers if enabled)");
    }
  }
  if (isTouchControl) return;
  updateInput(event);
  draw();
}

function handlePointerMoveEvent(event) {
  event.preventDefault();
  if (event.pointerType === "mouse" && isTouchControl !== false) {
    isTouchControl = false;
    newCanvasSize();
    newInterfaceSize();
    print("Device detected as desktop due to pointer move");
  }
  if (event.pointerType === "pen" && isTouchControl === undefined) {
    isTouchControl = false;
    newCanvasSize();
    newInterfaceSize();
    print("Device detected as desktop due to pen move");
  }
  if (isTouchControl) return;
  updateInput(event);
  draw();
}

function updateInput(event) {

  const startEventTypes = ["pointerdown", "touchstart"];
  const endEventTypes = ["pointerup", "pointercancel", "touchend", "touchcancel"];

  // menu first
  const menuW = 80;
  const menuH = 60 + ((inputMode() === "cloverMenu") ? 60 * toolPresets.length : 0);
  
  function tappedInMenu(x, y) {
    if (!startEventTypes.includes(event.type)) return;

    if (x < menuW && y < menuH && y > 60) {
      const spot = Math.floor(y/60) - 1;
      if (spot >= 0) {
        const modifyBrush = currentPainting.brushSettingsToAdjust;
        modifyBrush.tool = toolPresets[spot].brush;
        modifyBrush.texture = toolPresets[spot].texture;
        if (editMode) {
          pen.lastX = undefined;
          pen.lastY = undefined;
          editMode = false;
          currentPainting.redrawLatestStroke();
        }
      }
      menuState.startedEventOnMenu = true;
      menuState.onPage = 0;
      return true;
    }

    // anything besides tools menu
    if (y < 60) {
      if (x > menuW*0 && x < menuW*1) {
        doAction("undo");
      } else if (x > menuW*1 && x < menuW*2) {
        doAction("edit");
      } else if (x > width-menuW*1 && x < width-menuW*0) {
        doAction("save");
      } else if (x > width-menuW*2 && x < width-menuW*1) {
        doAction("clear");
      } else if (x > width/2 - 360 && x < width/2 + 360) {
        menuState.topSliderStartX = x;
        updateBrushReferenceFromInput();
      }
      menuState.startedEventOnMenu = true;
      return true;
    }
  }

  if (!isTouchControl && ["touchstart", "touchmove", "touchend"].includes(event.type)) return;

  // process touch/pen/mouse events on the canvas

  pen.wasDown = pen.isDown;
  pen.started = false;
  //print(event.type + event.changedTouches[0].identifier + " ");

  // desktop device could have a pen pointer device or mouse, also hover
  if (isTouchControl === false) {

    if (startEventTypes.includes(event.type)) {
      pointerDown = true;
    } else if (endEventTypes.includes(event.type)) {
      pointerDown = false;
    }

    if (tappedInMenu(event.clientX, event.clientY)) return;
    if (menuState.startedEventOnMenu && pointerDown) {
      if (menuState.topSliderStartX !== undefined) {
        menuState.topSliderDeltaX = event.clientX - menuState.topSliderStartX;
      }
      return;
    }

    if (startEventTypes.includes(event.type)) {
      pen.isDown = true;
    } else if (endEventTypes.includes(event.type)) {
      pen.isDown = false;
    }

    pen.lastX = pen.x;
    pen.lastY = pen.y;
    pen.lastAngle = pen.angle;
    pen.lastPressure = pen.pressure;
    
    hover.lastX = hover.x;
    hover.lastY = hover.y;
    hover.x = undefined;
    hover.y = undefined;

    if (pen.isDown) {
      menuState.screenPointerX = event.clientX;
      menuState.screenPointerY = event.clientY;
      pen.x = event.clientX - paintingState.x();
      pen.y = event.clientY - paintingState.y();
  
      // update pressure and angle
      if (event.pointerType === "pen") {
        if (event.pressure > 0) pen.pressure = event.pressure;
        pen.angle = tiltToAngle(event.tiltX, event.tiltY);
        // altitude, wip
      }
    } else if (!pointerDown) {
      menuState.screenHoverX = event.clientX;
      menuState.screenHoverY = event.clientY;
      hover.x = event.clientX - paintingState.x();
      hover.y = event.clientY - paintingState.y();
      if (event.pointerType === "pen") {
        
        hover.angle = tiltToAngle(event.tiltX, event.tiltY);
        // altitude, wip
      }
    }

  } else {

    // assume touch device without hover, look for stylus (apple pencil) pointer type

    let containedPen = false;
    ongoingTouches.forEach((touch) => {
      if (tappedInMenu(touch.clientX, touch.clientY)) return;
      if (menuState.startedEventOnMenu) {
        if (menuState.topSliderStartX !== undefined) {
          menuState.topSliderDeltaX = touch.clientX - menuState.topSliderStartX;
        }
        return;
      }
      if (touch.touchType === "stylus") {
        // must be Pencil
        pen.lastX = pen.x;
        pen.lastY = pen.y;
        pen.lastAngle = pen.angle;
        pen.lastPressure = pen.pressure;
        menuState.screenPointerX = touch.clientX;
        menuState.screenPointerY = touch.clientY;
        pen.x = touch.clientX - paintingState.x();
        pen.y = touch.clientY - paintingState.y();
        containedPen = true;
        pen.angle = touch.azimuthAngle;
        pen.altitude = touch.altitudeAngle;
        pen.pressure = touch.force;
      }
    });
    pen.isDown = containedPen;

  }
    

  if (event === undefined) return;

  // update state based on the result

  if (endEventTypes.includes(event.type)) {
    if (menuState.topSliderDeltaX !== undefined && editMode) editMode = false; // exit edit mode after using the slider
    menuState.topSliderDeltaX = undefined;
    menuState.topSliderStartX = undefined;
    menuState.startedEventOnMenu = false;
  }

  // pen down
  if (startEventTypes.includes(event.type) && pen.isDown) {
    pen.startX = pen.x;
    pen.startY = pen.y;
    pen.startAngle = pen.angle;
    pen.startPressure = pen.pressure;
    pen.started = true;
    pen.startTimeStamp = event.timeStamp;
    if (!editMode && inputMode() === "draw") {
      currentPainting.startStroke();
    }
    return;
  }

  // record
  if (pen.isDown && !editMode && inputMode() === "draw") {
    const addedPoint = {
      x: pen.x,
      y: pen.y,
      azimuthAngle: pen.angle,
      force: pen.pressure
    }
    currentPainting.updateStroke(addedPoint);
  }

  // pen lifted
  if (pen.wasDown && !pen.isDown) {

    pen.lastX = undefined;
    pen.lastY = undefined;

    const penDownDuration = event.timeStamp - pen.startTimeStamp;
    const penDownBounds = dist(pen.startX, pen.startY, pen.x, pen.y);

    const didNotDraw = (penDownDuration < 200 && penDownBounds < 20) || (penDownDuration < 400 && penDownBounds < 2);

    // was drawing, but only short
    if (inputMode() === 'draw' && didNotDraw) {

      // this currently eats the undo. maybe bad...
      if (!editMode) {
        doAction("undo");
      }
      
      menuState.onPage = 1;
    } else if (inputMode() !== 'draw') {
      if (menuState.onPage > 1) menuState.lastGadgetPage = menuState.onPage;
      menuState.onPage = 0;
    }
    
    if (!didNotDraw && editMode) {
      // leave edit mode
      // don't even send this as a confirm to draw
      editMode = false;
      pen.wasDown = false;
    }

    return;
  }
}

function keyPressed() {
  if (key === "c") {
    //doAction("clear");
  } else if (key === "s") {
    doAction("save");
  } else if (key === "u") {
    doAction("undo");
  } else if (key === "e") {
    doAction("edit");
  }
  if (key !== undefined) draw();
}

function doAction(action) {

  if (action === "undo") {

    currentPainting.popLatestStroke();
    editMode = false;

  } else if (action === "clear") {

    const prevCanvasColor = canvasColor.copy();
    canvasColor = currentBrush.color.copy();
    currentBrush.color = prevCanvasColor.copy();

    currentPainting.clearWithColor(canvasColor);
    document.body.style.backgroundColor = canvasColor.behind().hex;

  } else if (action === "save") {

    // commit strokes to the painting
    currentPainting.applyAllStrokes();
    currentPainting.download();

  } else if (action === "edit") {

    editMode = !editMode;
    if (currentPainting.editableStrokesCount === 0) editMode = false;
  }
}

function keyReleased() {
  draw();
}

function inputMode() {
  if (menuState.onPage === 1) {
    return "cloverMenu";
  }
  //'1'
  if (keyIsDown(49) || menuState.onPage === 2) {
    return "satAndLum";
  }
  //'2'
  if (keyIsDown(50) || menuState.onPage === 3) {
    return "hue";
  }
  //'3'
  if (keyIsDown(51) || menuState.onPage === 4) {
    return "size";
  }
  //'4'
  if (keyIsDown(52) || menuState.onPage === 5) {
    return "eyedropper";
  }

  return "draw";
}


function draw() {

  background(canvasColor.behind().hex);

  const wasInMenu = (currentInputMode !== "draw");
  currentInputMode = inputMode();

  if (currentInputMode !== "draw") { // menu opened

    // save the old brush values as a reference when opening a menu
    updateBrushReferenceFromInput();
    // get the new changed brush values
    updateBrushSettingsFromInput(currentInputMode);

    if (editMode) currentPainting.redrawLatestStroke();

  } else {
    // clear the reference values so they could be changed again when opening a menu
    if (menuState.startedEventOnMenu !== true) clearBrushReference();

    if (!editMode && !wasInMenu) {
      if (!pen.started && pen.isDown) {
        
        // draw brushstroke
        currentPainting.continueDrawing();
        // WIP
        // or
        // currentPainting.redrawLatestStroke();

      }
    } else if (editMode && pen.isDown) {
      editState.lastX ??= pen.x;
      editState.lastY ??= pen.y;

      const deltaX = pen.x-editState.lastX;
      const deltaY = pen.y-editState.lastY;

      editState.lastX = pen.x;
      editState.lastY = pen.y;

      currentPainting.moveLatestStroke(deltaX, deltaY);

    } else if (editMode) {
      editState.lastX = undefined;
      editState.lastY = undefined;
    }
  }

  // draw the UI to the ui buffer
  redrawInterface(interfaceBuffer, currentInputMode); 

  // draw the painting buffer
  image(currentPainting.oldStrokesBuffer, paintingState.x(), paintingState.y());

  // draw the still editable brushstrokes
  currentPainting.usedEditableStrokes.forEach((stroke) => {
    image(stroke.buffer, paintingState.x(), paintingState.y());
  });
  
  // draw the indicator buffer in the top left corner
  image(interfaceBuffer, 0, 0);
}

function clearBrushReference() {
  gadgetStartX = undefined;
  gadgetStartY = undefined;

  previousBrush = undefined;

  refHoverX = undefined;
  refHoverY = undefined;
  refScreenPointerX = undefined;
  refScreenPointerY = undefined;
  refScreenHoverX = undefined;
  refScreenHoverY = undefined;
}

function updateBrushReferenceFromInput() {
  // starting position
  gadgetStartX ??= pen.x;
  gadgetStartY ??= pen.y;
  refHoverX ??= hover.x;
  refHoverY ??= hover.y;
  refScreenPointerX ??= menuState.screenPointerX;
  refScreenPointerY ??= menuState.screenPointerY;
  refScreenHoverX ??= menuState.screenHoverX;
  refScreenHoverY ??= menuState.screenHoverY;

  previousBrush ??= currentBrush.copy();
}


function updateBrushSettingsFromInput(currentInputMode) {

  const penMode = (pen.startX !== undefined && pen.startY !== undefined)

  if (currentInputMode === "cloverMenu") {

    const affectedPageType = (pen.isDown) ? "onPage" : "hoverPage";

    // Get positions
    const deltaX = (pen.isDown ? pen.x : hover.x) - gadgetStartX;
    const deltaY = (pen.isDown ? pen.y : hover.y) - gadgetStartY;

    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // horizontal
        menuState[affectedPageType] = (deltaX < 0) ? 4 : 3;
      } else {
        // vertical
        menuState[affectedPageType] = (deltaY < 0) ? 5 : 2;
      }  
    } else if ((Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) && menuState.lastGadgetPage > 1) {
      menuState[affectedPageType] = menuState.lastGadgetPage;
    }
    return;
  } 
  
  if (!pen.isDown) return;

  // which brush settings to take as the reference/starting point and which to write to
  const brushToAdjust = currentPainting.brushSettingsToAdjust;
  const brushToReference = previousBrush;

  if (currentInputMode === "satAndLum") {

    // Get positions
    let deltaX = pen.x - (penMode ? pen.startX : gadgetStartX);
    let deltaY = pen.y - (penMode ? pen.startY : gadgetStartY);

    let rangeX = gadgetRadius * 2;
    let rangeY = gadgetRadius * 2;

    // Map to chroma and luminance
    brushToAdjust.color.setSaturation(map( deltaX + rangeX * brushToReference.color.saturation, 0, rangeX, 0, 1, true));
    brushToAdjust.color.setLuminance(map(-deltaY + rangeY * brushToReference.color.luminance, 0, rangeY, 0, 1, true));

  } else if (currentInputMode === "hue") { // '1', hue and hue variation

    // Get positions
    let deltaX = pen.x - (penMode ? pen.startX : gadgetStartX);
    let deltaY = pen.y - (penMode ? pen.startY : gadgetStartY);

    let rangeX = gadgetRadius * 2;
    let rangeY = gadgetRadius * 2;

    brushToAdjust.color.setHue(map(deltaX + rangeX * brushToReference.color.hue, 0, rangeX, 0, 1));
    brushToAdjust.colorVar = map(-deltaY + rangeY * brushToReference.colorVar, 0, rangeY, 0, 1, true);

  } else if (currentInputMode === "size") {

    const deltaY = pen.y - (penMode ? pen.startY : gadgetStartY);
    const rangeY = gadgetRadius * 2;
    
    brushToAdjust.size = map(-deltaY + rangeY * brushToReference.size, 0, rangeY, 0, 1, true);
  
  } else if (currentInputMode === "eyedropper") {
    currentPainting.applyAllStrokes();
    const buffer = currentPainting.oldStrokesBuffer;

    // go through a few pixels
    const addRadiusPx = 2;
    const colorsArr = [];
    for (x = -addRadiusPx; x <= addRadiusPx; x++) {
      for (y = -addRadiusPx; y <= addRadiusPx; y++) {
        const rgbaColor = buffer.get(pen.x + x, pen.y + y);
        if (rgbaColor[3] !==0) colorsArr.push(rgbaColor);
      }
    }
    if (colorsArr.length === 0) return;

    let accumulatingRGB = [0, 0, 0];
    for (const rgb of colorsArr) {
      accumulatingRGB[0] += rgb[0];
      accumulatingRGB[1] += rgb[1];
      accumulatingRGB[2] += rgb[2];
    }

    // set new color
    brushToAdjust.color = HSLColor.fromRGBwithFallback(
      accumulatingRGB[0] / colorsArr.length, 
      accumulatingRGB[1] / colorsArr.length, 
      accumulatingRGB[2] / colorsArr.length, 
      brushToAdjust.color
    );
  }
}


// function drawWithPlaceholder(buffer, xa, ya, xb, yb, size) {
//   if (xa === undefined || ya === undefined || xb === undefined || yb === undefined) return;

//   // draw the line rect
//   buffer.strokeWeight(size);
//   buffer.strokeCap(SQUARE);
//   buffer.line(xa, ya, xb, yb);

//   buffer.strokeCap(ROUND);
//   buffer.strokeWeight(6);
//   buffer.noStroke();
// }



function redrawInterface(buffer, activeInputGadget) {
  if (buffer === undefined) return;

  // Clear the UI buffer
  buffer.clear();

  // Interface Colors
  const uiColors = {};
  uiColors.bg = canvasColor.behind();
  uiColors.fg = uiColors.bg.copy()
    .setLuminance(lerp(canvasColor.luminance, (canvasColor.luminance>0.5) ? 0 : 1, 0.7)); 
  uiColors.fgDisabled = uiColors.fg.copy().setAlpha(0.2);
  uiColors.constrastBg = uiColors.fg.copy()
    .setLuminance(lerp(canvasColor.luminance, canvasColor.luminance > 0.5 ? 1 : 0, 0.7)); 
  uiColors.onBrush = currentBrush.color.copy()
    .setLuminance(lerp(currentBrush.color.luminance, (currentBrush.color.luminance>0.5) ? 0:1, 0.7))
    .setSaturation(currentBrush.color.saturation * 0.5);

  // Background borders
  buffer.fill(uiColors.bg.hex);
  buffer.rect(0, 0, width, 60);
  
  // MENUS
  // Corner brush preview
  buffer.noStroke();
  displayTool(currentBrush.tool, currentBrush.texture, 0, 0)

  if (inputMode() === "cloverMenu") {
    toolPresets.forEach((tool, index) => {
      displayTool(tool.brush, tool.texture, 0, index+1, tool.menuName);
    });
  }

  function displayTool(menuBrushTool, menuTexture, spotX, spotY, menuName) {

    buffer.push();
    buffer.translate(30 + 80*spotX, 30 + 60*spotY);

    if (spotY !== 0) {
      // draw example
      // wip, not sure why the angle 86 even makes sense.
      const start = new BrushStrokePoint(-20, 0, 86, undefined);
      const end = new BrushStrokePoint(60, 0, 86, undefined);
      const settings = currentBrush.copy();
      settings.size = constrain(settings.size, 0.1, 0.3);
      settings.tool = menuBrushTool;
      settings.texture = menuTexture;
      
      new BrushStroke(buffer, settings).renderStrokePart(start, end);
    }

    buffer.pop();

    if (spotY > 0) {
      buffer.textAlign(CENTER);
      buffer.stroke(currentBrush.color.hex);
      buffer.strokeWeight(3);
      buffer.fill(uiColors.onBrush.hex);
      buffer.text(menuName, 0, 0 + 60*spotY, 80, 60 - 6);
      buffer.textFont(fontMedium);
      buffer.noStroke();
      buffer.strokeWeight(6);
    }
    buffer.textAlign(LEFT);
  }


  function topButton(text, x, textColor) {
    buffer.fill(uiColors.constrastBg.toHexWithSetAlpha(0.5));
    buffer.rect(x+3, 0, topButtonWidth-6, 60, 0, 0, 20, 20);
    buffer.fill(textColor.hex);
    buffer.text(text, x, 0, topButtonWidth, 60 - 8);
  }

  // top menu buttons
  buffer.textAlign(CENTER);
  buffer.textFont(fontMedium);

  const topButtonWidth = 80;

  const noEditableStrokes = (currentPainting.editableStrokesCount === 0);
  topButton("undo" , topButtonWidth*0,             noEditableStrokes ? uiColors.fgDisabled : uiColors.fg);
  topButton("edit" , topButtonWidth*1, editMode || noEditableStrokes ? uiColors.fgDisabled : uiColors.fg);
  topButton("clear", width-topButtonWidth*2, uiColors.fg.copy().setHue(0.1).setSaturation(0.8));
  topButton("save" , width-topButtonWidth*1, uiColors.fg);
  
  buffer.fill(uiColors.fg.hex);
  buffer.textAlign(LEFT);
  buffer.textFont(fontMedium);


  // draw the sliders at the top
  const drawSliders = (width > 980);
  const sliderStart = width/2 - 300;

  if (drawSliders) {
    let baseColor = currentPainting.brushSettingsToAdjust.color;
    drawGradientSlider(sliderStart, 0, 200, 60,     baseColor.copy().setLuminance(0), baseColor.copy().setLuminance(1), baseColor.luminance);
    drawGradientSlider(sliderStart+200, 0, 200, 60, baseColor.copy().setSaturation(0), baseColor.copy().setSaturation(1), baseColor.saturation);
    drawGradientSlider(sliderStart+400, 0, 200, 60, baseColor.copy().setHue(0), baseColor.copy().setHue(1), baseColor.hue);
    if (previousBrush !== undefined) {
      baseColor = previousBrush.color;
      drawGradientSlider(sliderStart, 0, 200, 10,     baseColor.copy().setLuminance(0), baseColor.copy().setLuminance(1), baseColor.luminance);
      drawGradientSlider(sliderStart+200, 0, 200, 10, baseColor.copy().setSaturation(0), baseColor.copy().setSaturation(1), baseColor.saturation);
      drawGradientSlider(sliderStart+400, 0, 200, 10, baseColor.copy().setHue(0), baseColor.copy().setHue(1), baseColor.hue);
    }
    drawRoundColorExampleWithVariation(currentBrush, 55, sliderStart - 30, 30);
  }


  // bottom left/ top middle text
  buffer.fill(uiColors.fg.hex);

  // set new values
  if (menuState.topSliderDeltaX !== undefined) {
    const xFromLeftEdgeOfSliders = menuState.topSliderStartX + 360 - width/2;
    const xFromLeftWithDelta = xFromLeftEdgeOfSliders + menuState.topSliderDeltaX;
    let section = undefined;
    let sectionValue = undefined;
    let sectionValueText = "";

    const brushToAdjust = currentPainting.brushSettingsToAdjust;

    if (xFromLeftEdgeOfSliders < 60) {
      section = "var";
      sectionValue = constrain(previousBrush.colorVar + menuState.topSliderDeltaX * 0.002, 0, 1);
      if (!isNaN(sectionValue)) brushToAdjust.colorVar = sectionValue;
      sectionValueText = Math.floor(brushToAdjust.colorVar * 100) + "%";
    } else if (xFromLeftEdgeOfSliders < 260) {
      section = "luminance";
      sectionValue = map(xFromLeftWithDelta, 60, 260, 0, 1.0, true);
      brushToAdjust.color.setLuminance(sectionValue);
      sectionValueText = Math.floor(brushToAdjust.color.luminance * 100) + "%";
    } else if (xFromLeftEdgeOfSliders < 460) {
      section = "saturation";
      sectionValue = map(xFromLeftWithDelta, 260, 460, 0, 1.0, true);
      brushToAdjust.color.setSaturation(sectionValue);
      sectionValueText = Math.floor(brushToAdjust.color.saturation * 100) + "%";
    } else if (xFromLeftEdgeOfSliders < 660) {
      section = "hue";
      sectionValue = map(xFromLeftWithDelta, 460, 660, 0, 1.0);
      if (sectionValue > 1) sectionValue %= 1;
      if (sectionValue < 0) sectionValue = 1-(Math.abs(sectionValue) % 1);
      brushToAdjust.color.setHue(sectionValue);
      sectionValueText = Math.floor(brushToAdjust.color.hue*360);
    } else {
      section = "size";
      sectionValue = constrain(previousBrush.size + menuState.topSliderDeltaX * 0.002, 0, 1);
      if (!isNaN(sectionValue)) brushToAdjust.size = sectionValue;
      sectionValueText = Math.round(brushToAdjust.pxSize);
    }

    if (editMode) currentPainting.redrawLatestStroke();

    buffer.textAlign(CENTER);
    const textContent = section + ": " + sectionValueText;
    const textPos = {
      x: menuState.topSliderStartX + menuState.topSliderDeltaX,
      y: 60 + 14
    }
    let bbox = fontMedium.textBounds(textContent, textPos.x, textPos.y);
    buffer.fill(uiColors.constrastBg.toHexWithSetAlpha(0.5));
    buffer.rect(bbox.x - bbox.w/2 - 13, bbox.y + bbox.h/2 - 4, bbox.w+26, bbox.h+12, 20);
    buffer.fill(uiColors.fg.hex);
    buffer.text(textContent, textPos.x, textPos.y);
  }

  buffer.textAlign(LEFT);
  buffer.fill(uiColors.fg.hex);
  const controlsInfo = (isTouchControl !== false) ? "pen required!" : "SHORTCUTS: 1-[Value] 2-[Hue] 3-[Size] 4-[Eyedrop] U-[Undo] E-[Edit] S-[Save]";
  buffer.text(controlsInfo, 20, height - 20 - 12);

  // draw the size indicator
  if (drawSliders) {
    buffer.drawingContext.save();
    buffer.fill(uiColors.constrastBg.toHexWithSetAlpha(0.5));
    buffer.rect(sliderStart + 600, 0, 60, 60, 20, 20, 20, 20);
    buffer.drawingContext.clip();

    drawSizeIndicator(buffer, currentBrush.pxSize, sliderStart + 630, 30);

    buffer.drawingContext.restore();
    buffer.noStroke();
  }

  //reset text size
  buffer.textSize((width < height) ? 13 : 16);

  // draw rectangle around stroke being edited
  if (editMode) {
    const bounds = currentPainting.latestStroke.bounds;
    if (bounds.width > 0 && bounds.height > 0) {
      const topLeft = {x: bounds.x, y: bounds.y};
      const botRight = {x: bounds.x + bounds.width, y: bounds.y + bounds.height};

      buffer.push();
      buffer.translate(paintingState.x(), paintingState.y());

      buffer.stroke(uiColors.constrastBg.hex);
      buffer.strokeWeight(3);
      buffer.line(topLeft.x, topLeft.y, botRight.x, topLeft.y);
      buffer.line(topLeft.x, topLeft.y, topLeft.x, botRight.y);
      buffer.line(topLeft.x, botRight.y, botRight.x, botRight.y);
      buffer.line(botRight.x, topLeft.y, botRight.x, botRight.y);
      buffer.stroke(uiColors.fg.hex);
      buffer.strokeWeight(1);
      buffer.line(topLeft.x, topLeft.y, botRight.x, topLeft.y);
      buffer.line(topLeft.x, topLeft.y, topLeft.x, botRight.y);
      buffer.line(topLeft.x, botRight.y, botRight.x, botRight.y);
      buffer.line(botRight.x, topLeft.y, botRight.x, botRight.y);
      buffer.strokeWeight(6);
      buffer.noStroke();
  
      buffer.pop();
    }
  }

  // depending on input mode, draw the right gadget
  drawActiveGadget();

  // draw the hover preview
  if ((activeInputGadget === "draw") && (isTouchControl === false) && !pen.isDown && !editMode && !pointerDown
    && hover.x > 0 && hover.x < paintingState.width() && hover.y > 0 && hover.y < paintingState.height()
  ) {
    drawHoverBrushStroke(buffer);
  }

  // end of redrawInterface

  function drawHoverBrushStroke(buffer) {
    if (hover.lastX === undefined || hover.lastY === undefined) return;

    // change from canvas to screen space
    buffer.push();
    buffer.translate(paintingState.x(), paintingState.y());

    // draw hover stamp at the pen position

    const start = new BrushStrokePoint(hover.lastX, hover.lastY, hover.angle);
    const end = new BrushStrokePoint(hover.x, hover.y, hover.angle);

    new BrushStroke(buffer, currentBrush.copy()).renderStrokePart(start, end);
    
    buffer.pop();
  }

  function drawActiveGadget() {

    if (activeInputGadget === "eyedropper") {
      buffer.fill(currentBrush.color.hex);
      const screenX = (!pen.isDown) ? menuState.screenHoverX : menuState.screenPointerX;
      const screenY = (!pen.isDown) ? menuState.screenHoverY : menuState.screenPointerY;
      if (pen.isDown) drawRoundColorExampleWithVariation(currentBrush, currentBrush.pxSize, screenX, screenY);
      drawCrosshair(currentBrush.pxSize, screenX, screenY);
    }

    // draw the brush setting gadgets
    const useBaseX = (refScreenHoverX !== undefined) ? refScreenHoverX : refScreenPointerX;
    const useBaseY = (refScreenHoverY !== undefined) ? refScreenHoverY : refScreenPointerY;

    if (useBaseX === undefined || useBaseY === undefined) return;

    const brushToVisualize = currentPainting.brushSettingsToAdjust;

    buffer.noStroke();
    buffer.fill(brushToVisualize.color.hex);

    const sideDist = gadgetRadius; //(Math.max(width, height) > 4* gadgetRadius) ? gadgetRadius : gadgetRadius*0.5;
    const ankerX = constrain(useBaseX, sideDist, width - sideDist);
    const ankerY = constrain(useBaseY, sideDist, height - sideDist);

    if (activeInputGadget === "cloverMenu") {

      // buffer.stroke(visHex);
      // buffer.strokeWeight(2);
      // buffer.line(ankerX-10, ankerY, ankerX+10, ankerY);
      // buffer.line(ankerX, ankerY-10, ankerX, ankerY+10);

      buffer.textAlign(CENTER);
      buffer.textStyle(BOLD);
      buffer.noStroke();

      function drawGadgetDirection(x, y, xDir, yDir, isActive, text) {
        const size = 54;
        const centerOffset = 40;
        if (isActive) {
          buffer.fill(uiColors.fg.hex);
          buffer.ellipse(x+centerOffset*xDir, y+centerOffset*yDir, size, size);
          buffer.fill(uiColors.constrastBg.hex);
        } else {
          buffer.fill(uiColors.constrastBg.hex);
          buffer.ellipse(x+centerOffset*xDir, y+centerOffset*yDir, size, size);
          buffer.fill(uiColors.fg.hex);
        }
        

        const posX = x+centerOffset*xDir;
        const posY = y+centerOffset*yDir;
        // icons or text
        if (text === "H") {
          buffer.strokeWeight(8);

          drawColorAxis(posX, posY - size/3, posX, posY + size/3, brushToVisualize.color, brushToVisualize.color, size, 1.0, 0.0);

          const startColorHue = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue - 0.5); 
          const endColorHue   = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue + 0.5);
          drawColorAxis(posX - size/3, posY, posX + size/3, posY, startColorHue, endColorHue, size);
          
          buffer.noStroke();

        } else if (text === "LC") {
          buffer.strokeWeight(8);

          const startColorSat = brushToVisualize.color.copy().setSaturation(0);
          const endColorSat   = brushToVisualize.color.copy().setSaturation(1);
          drawColorAxis(posX - size/3, posY, posX + size/3, posY, startColorSat, endColorSat, size);
          
          const startColorLum = brushToVisualize.color.copy().setLuminance(1);
          const endColorLum   = brushToVisualize.color.copy().setLuminance(0);
          drawColorAxis(posX, posY - size/3, posX, posY + size/3, startColorLum, endColorLum, size);

          buffer.noStroke();

        } else {
          buffer.textSize(22);
          buffer.text(text, posX, posY - 4);
          //reset text size
          buffer.textSize((width < height) ? 13 : 16);
        }
      }

      const highlightedGadget = (menuState.hoverPage === null) ? menuState.lastGadgetPage : menuState.hoverPage;

      drawGadgetDirection(useBaseX, useBaseY, -1,  0, highlightedGadget === 4, "S");
      drawGadgetDirection(useBaseX, useBaseY,  1,  0, highlightedGadget === 3, "H");
      drawGadgetDirection(useBaseX, useBaseY,  0, -1, highlightedGadget === 5, "I");
      drawGadgetDirection(useBaseX, useBaseY,  0,  1, highlightedGadget === 2, "LC");
    
    } else if (activeInputGadget === "hue") {

      const radius = gadgetRadius;
      buffer.push();
      buffer.translate(ankerX, ankerY);

      buffer.fill("black")
      buffer.ellipse(0, 0, constrain(brushToVisualize.pxSize, 8, gadgetRadius/3)+2)

      // var
      buffer.stroke("black");
      buffer.strokeWeight(16);
      buffer.line(0, radius*2 * (brushToVisualize.colorVar - 1), 0, radius*2 * brushToVisualize.colorVar);

      buffer.strokeWeight(14);
      drawColorAxis(0, radius*2 * (brushToVisualize.colorVar - 1), 0, radius*2 * brushToVisualize.colorVar, brushToVisualize.color, brushToVisualize.color, gadgetRadius, 1.0, 0.0);

      // hue
      // stay centered since hue is a circle anyway
      buffer.stroke("black");
      buffer.strokeWeight(16);
      buffer.line(radius*2 * -0.5, 0, radius*2 * (1-0.5), 0);

      const startColorHue = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue - 0.5); 
      const endColorHue   = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue + 0.5);
      buffer.strokeWeight(14);
      drawColorAxis(radius*2 * -0.5, 0, radius*2 * (1-0.5), 0, startColorHue, endColorHue, gadgetRadius);

      buffer.pop();

      // Show color at reference position
      //const currentColorSize = constrain(brushToVisualize.pxSize, 8, gadgetRadius/3);
      drawRoundColorExampleWithVariation(brushToVisualize, 40, ankerX, ankerY);

    } else if (activeInputGadget === "satAndLum") {

      const radius = gadgetRadius;
      buffer.push();
      buffer.translate(ankerX, ankerY);

      buffer.fill("black")
      buffer.ellipse(0, 0, constrain(brushToVisualize.pxSize, 8, gadgetRadius/3)+2)

      const startColorLum = brushToVisualize.color.copy().setLuminance(1);
      const endColorLum   = brushToVisualize.color.copy().setLuminance(0);
      buffer.stroke("black");
      buffer.strokeWeight(16);
      buffer.line(0, radius*2 * (-1 + brushToVisualize.color.luminance), 0, radius*2 * brushToVisualize.color.luminance);
      buffer.strokeWeight(14);
      drawColorAxis(0, radius*2 * (-1 + brushToVisualize.color.luminance), 0, radius*2 * brushToVisualize.color.luminance, startColorLum, endColorLum, gadgetRadius);

      const startColorSat = brushToVisualize.color.copy().setSaturation(0);
      const endColorSat   = brushToVisualize.color.copy().setSaturation(1);
      buffer.stroke("black");
      buffer.strokeWeight(16);
      buffer.line(radius*2 * -brushToVisualize.color.saturation, 0, radius*2 * (1-brushToVisualize.color.saturation), 0);
      buffer.strokeWeight(14);
      drawColorAxis(radius*2 * -brushToVisualize.color.saturation, 0, radius*2 * (1-brushToVisualize.color.saturation), 0, startColorSat, endColorSat, gadgetRadius);
      
      buffer.pop();

      // Show color at reference position
      //const currentColorSize = constrain(brushToVisualize.pxSize, 8, gadgetRadius/3);
      drawRoundColorExampleWithVariation(brushToVisualize, 40, ankerX, ankerY);

    } else if (activeInputGadget === "size") {


      const posX = ankerX;
      const posY = ankerY - gadgetRadius;
      const lineAddY = gadgetRadius * 2 * brushToVisualize.size;
      const lineTranslateY = posY + lineAddY;

      buffer.stroke(uiColors.constrastBg.toHexWithSetAlpha(0.3));
      buffer.strokeWeight(12);
      buffer.line(posX, lineTranslateY - gadgetRadius,posX, lineTranslateY + gadgetRadius);
      buffer.strokeWeight(10);
      buffer.stroke(uiColors.fg.toHexWithSetAlpha(0.3));
      buffer.line(posX, lineTranslateY - gadgetRadius,posX, lineTranslateY + gadgetRadius);
      buffer.noStroke();

      buffer.fill(brushToVisualize.color.toHexWithSetAlpha(0.5));
      buffer.ellipse(posX, ankerY, brushToVisualize.pxSize);
      buffer.fill(brushToVisualize.color.hex);
      drawCrosshair(brushToVisualize.pxSize, posX, ankerY);
    }
  }

  function drawRoundColorExampleWithVariation(brush, size, x, y) {
    buffer.fill(brush.color.hex);
    buffer.ellipse(x, y, size);

    const varSegments = 48;
    for (let i = 0; i < varSegments; i++) {
      const start = (TWO_PI / varSegments) * i;
      const stop = start + TWO_PI / varSegments; 
      buffer.fill(brush.getColorWithVar(i).hex);
      buffer.arc(x, y, size, size, start, stop);
    }
  }

  function drawSizeIndicator(buffer, size, x, y) {
    buffer.fill(uiColors.fg.toHexWithSetAlpha(0.4));
    buffer.ellipse(x, y, size, size)
    buffer.fill(uiColors.constrastBg.toHexWithSetAlpha(0.3));
    buffer.ellipse(x, y, size*0.66, size*0.66)
    buffer.ellipse(x, y, size*0.33, size*0.33)
  }

  function drawCrosshair(size, x, y) {
    const expand_size = Math.min(25, size * 0.4);

    //shadow ver
    buffer.strokeWeight(4);
    buffer.stroke(uiColors.constrastBg.hex);
    buffer.line(x, y - size*0.5, x, y - size*0.5 - expand_size);
    buffer.line(x, y + size*0.5, x, y + size*0.5 + expand_size);
    buffer.line(x - size*0.5, y, x - size*0.5 - expand_size, y);
    buffer.line(x + size*0.5, y, x + size*0.5 + expand_size, y);

    // draw the crosshair
    buffer.strokeWeight(2);
    buffer.stroke(uiColors.fg.hex);
    buffer.line(x, y - size*0.5, x, y - size*0.5 - expand_size);
    buffer.line(x, y + size*0.5, x, y + size*0.5 + expand_size);
    buffer.line(x - size*0.5, y, x - size*0.5 - expand_size, y);
    buffer.line(x + size*0.5, y, x + size*0.5 + expand_size, y);
  
    // reset
    buffer.strokeWeight(6);
    buffer.noStroke();
  }

  function drawColorAxis(xStart, yStart, xEnd, yEnd, startColor, endColor, radius, startVar = 0, endVar = 0) {
    const segments = Math.floor(radius);
    let lastX = xStart;
    let lastY = yStart;
    for (let i = 1; i < segments + 1; i++) {
      const toX = lerp(xStart, xEnd, i / segments);
      const toY = lerp(yStart, yEnd, i / segments);
      const colorLerpAmt = (i - 0.5) / segments;
      const lerpedVar = lerp(startVar, endVar, colorLerpAmt);
      const lerpedColor = HSLColor.lerpColorInHSL(startColor, endColor, colorLerpAmt).varyComponents(i, lerpedVar);
      
      buffer.stroke(lerpedColor.hex);
      buffer.line(lastX, lastY, toX, toY);
  
      lastX = toX;
      lastY = toY;
    }
  }

  function drawGradientSlider(x, y, width, height, startColor, endColor, sliderPercent) {
    const segments = width;
    const currentSegment = Math.round(segments * sliderPercent);

    for (let i = 0; i < segments; i++) {
      const colorLerpAmt = (i + 0.5) / segments;
      const lerpedColor = HSLColor.lerpColorInHSL(startColor, endColor, colorLerpAmt);

      const curvedHeight = height * Math.min((1 - Math.abs((i/segments)-0.5) * 2) * 6, 1) ** 0.12
  
      buffer.fill(lerpedColor.hex);
      buffer.rect(x + (i/segments) * width, y, width/segments, curvedHeight);

      if (i === currentSegment) {
        buffer.fill(new HSLColor(0,0,1,0.8).hex);
        buffer.rect(x + (i/segments) * width, y, width/segments, curvedHeight);
      }
      if (i+1 === currentSegment) {
        buffer.fill(new HSLColor(0,0,0,0.8).hex);
        buffer.rect(x + (i/segments) * width, y, width/segments, curvedHeight);
      }
    }
  }
}

function easeInCirc(x, from, to) {
  if (from === undefined) {
    return 1 - Math.sqrt(1 - Math.pow(x, 2));
  }
  return ((1 - Math.sqrt(1 - Math.pow((x - from) / (to - from), 2))) * (to - from) +from);
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

function tiltToAngle(tiltX, tiltY) {
  // perpendicular
  if (tiltX === 0 && tiltY === 0) return undefined;

  //converts to radians
  radX = map(tiltX, -90, 90, -HALF_PI, HALF_PI)
  radY = map(tiltY, -90, 90,  HALF_PI, -HALF_PI)

  // from https://gist.github.com/k3a/2903719bb42b48c9198d20c2d6f73ac1
  const y =  Math.cos(radX) * Math.sin(radY); 
  const x = -Math.sin(radX) * -Math.cos(radY); 
  //const z = -Math.cos(radX) * -Math.cos(radY); 
  let azimuthRad = -Math.atan2(y, x); //+ HALF_PI;

  // to range 0 to TWO_PI
  if (azimuthRad < 0) azimuthRad += TWO_PI;

  return azimuthRad;
}
