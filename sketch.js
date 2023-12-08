// init in setup()
let openPainting = undefined;

let dev_mode = false;

const PRESET_TOOLS = [
  {tool: "Brush Tool", texture: "Regular", menuName: "Default"},
  {tool: "Brush Tool", texture: "Rake",    menuName: "Rake" },
  {tool: "Brush Tool", texture: "Round",   menuName: "Round"},
];
let FONT_REGULAR; let FONT_ITALIC; let FONT_MEDIUM;
function preload() {
  FONT_REGULAR = loadFont('assets/IBMPlexSans-Regular.ttf');
  FONT_ITALIC = loadFont('assets/IBMPlexSans-Italic.ttf');
  FONT_MEDIUM = loadFont('assets/IBMPlexSans-Medium.ttf');
}


function setup() {
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.id("myCanvas");

  // Create a graphics buffer for the indicator
  UI.buffer = createGraphics(width, height);
  Interaction.adjustCanvasSize(windowWidth, windowHeight);

  // event listeners on the entire canvas element
  const canvasElement = document.getElementById("myCanvas");
  canvasElement.addEventListener("pointerdown", Interaction.pointerStart);
  canvasElement.addEventListener("pointerup", Interaction.pointerEnd);
  canvasElement.addEventListener("pointercancel", Interaction.pointerCancel);
  canvasElement.addEventListener("pointermove", Interaction.pointerMove);
  canvasElement.addEventListener("wheel", Interaction.wheelScrolled);
  canvasElement.addEventListener("pointerout", (event) => {
    Interaction.pointerCancel(event);
  });

  // event listeners on the document
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { Interaction.lostFocus(); }
  });
  document.addEventListener("keydown", (event) => { 
    if (!event.repeat ) Interaction.keyStart(event.key);
  });
  document.addEventListener("keyup", (event) => Interaction.keyEnd(event.key));
  window.addEventListener("resize", () => Interaction.adjustCanvasSize(windowWidth, windowHeight));

  // initialize new painting
  const INITIAL_CANVAS_COLOR = new HSLColor(0.6, 0.1, 0.15);
  const smaller_side = Math.min(width, height);
  const INITIAL_CANVAS_DIMENSIONS = {
    x: Math.round(smaller_side*0.9), //*(2/3) for vertical, WIP add formats.
    y: Math.round(smaller_side*0.9)
  }
  const INITIAL_BRUSH_SETTINGS = new BrushSettings(
    new HSLColor(0.6, 0.6, 0.7), 
    0.35, 0.5, 
    PRESET_TOOLS[0].tool, PRESET_TOOLS[0].texture
  );
  openPainting = new Painting(INITIAL_CANVAS_DIMENSIONS.x, INITIAL_CANVAS_DIMENSIONS.y, INITIAL_CANVAS_COLOR, INITIAL_BRUSH_SETTINGS);
  document.body.style.backgroundColor = INITIAL_CANVAS_COLOR.behind().hex;
}

function draw() {
  // behind everything
  background(openPainting.canvasColor.behind().hex);

  push();
 
  translate(Interaction.viewTransform.centerPos().x, Interaction.viewTransform.centerPos().y);
  rotate(Interaction.viewTransform.rotation);

  translate(-Interaction.viewTransform.scale * openPainting.width/2, -Interaction.viewTransform.scale * openPainting.height/2);


  // draw the painting buffers

  const scaledSize = {
    x: Math.round(Interaction.viewTransform.scale * openPainting.width),
    y: Math.round(Interaction.viewTransform.scale * openPainting.height)
  };

  // in rounded rectangle area
  drawingContext.save();
  fill(openPainting.canvasColor.hex);
  rect(0, 0, scaledSize.x, scaledSize.y, UI.ELEMENT_RADIUS/2);
  drawingContext.clip();

  drawScaledCanvas(openPainting.oldStrokesBuffer);
  openPainting.usedEditableStrokes.forEach((stroke) => {
    drawScaledCanvas(stroke.buffer);
  });

  drawingContext.restore();
  pop();

  // draw the new UI to the buffer, then show on top of the screen
  UI.redrawInterface(); 
  image(UI.buffer, 0, 0);


  function drawScaledCanvas(buffer) {
    if (Interaction.viewTransform.scale === 1) {
      image(buffer, 0, 0);
      return;
    }
    image(buffer, 0, 0, scaledSize.x, scaledSize.y);
  }
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
    const pxSize = map(easeInCirc(this.size), 0, 1, 4, 600);
    return pxSize;
  }

  finalPxSizeWithPressure(pressure) {
    const size = this.pxSize * (this.texture === "Round" ? 0.7 : 1);
    if (pressure === undefined) return size;
    return size * map(pressure, 0, 1, 0.1, 2.0, true);
  }

  getColorWithVar(seed) {
    return this.color.copy().varyComponents(seed, this.colorVar);
  }
}


class BrushPoint {
  /**
   * Creates an instance of BrushStrokePoint.
   * @param {number} x The x coordinate of the point.
   * @param {number} y The y coordinate of the point.
   * @param {number|undefined} azimuth The angle of the pen at this point.
   * @param {number|undefined} pressure The pen pressure detected at this point.
   * @param {number|undefined} timeStamp The timeStamp of the event that added this point.
   */
  constructor(x, y, azimuth, pressure, timeStamp) {
    this.x = x;
    this.y = y;
    this.azimuth = azimuth;
    this.pressure = pressure;
    this.seed = (timeStamp ? timeStamp/1000000 + (x^y)/1000000 : x * 2 + y * 3);
  }

  move(xDelta, yDelta) {
    if (xDelta === 0 && yDelta === 0) return;
    this.x += xDelta;
    this.y += yDelta;
    // the seed stays the same, doesn't also change with moved position
  }
}


class Brushstroke {
  /**
   * Creates an instance of BrushStroke.
   * Contains an array of points.
   * @param {p5.graphics} buffer A p5 Graphics buffer.
   * @param {BrushSettings} settings The settings for the brush. May be modified later. 
   */
  constructor(buffer, settings) {
    this.buffer = buffer;
    this.points = [];
    this.settings = settings.copy();
    this.brushstrokeSeed = frameCount / 100000;
  }

  get bounds() {
    const margin = this.settings.pxSize*0.5;
    const xmin = this.points.reduce((a, b) => Math.min(a, b.x),  Infinity) - margin;
    const xmax = this.points.reduce((a, b) => Math.max(a, b.x), -Infinity) + margin;
    const ymin = this.points.reduce((a, b) => Math.min(a, b.y),  Infinity) - margin;
    const ymax = this.points.reduce((a, b) => Math.max(a, b.y), -Infinity) + margin;
    return {x: xmin, y:ymin, width: xmax-xmin, height: ymax-ymin};
  }

  averagePressureInLast(n) {
    if (this.points.length === 0) return;
    if (this.points[0].pressure === undefined) return;

    const firstIndexToCheck = Math.max(0, this.points.length - n);
    let totalPressure = 0;
    let count = 0;
    for (let i = firstIndexToCheck; i <  this.points.length; i++) {
      totalPressure += this.points[i].pressure;
      count++;
    }
    
    return totalPressure / count;
  }

  addPoint(point) {
    this.points.push(new BrushPoint(point.x,  point.y,  point.azimuth, point.pressure, point.timeStamp));
  }

  movePoints(xDelta, yDelta) {
    if (xDelta === 0 && yDelta === 0) return;
    this.points.forEach((point) => point.move(xDelta, yDelta));
  }

  reset() {
    this.buffer.clear();
    this.points = [];
    this.settings = undefined;
    this.brushstrokeSeed = frameCount / 100000;
  }

  drawWhole() {
    if(this.points.length < 2) {
      //console.log("can't draw stroke, too short:", strokeData.length, strokeData)
      return;
    }
    // wip, ignores tool for now
    this.points.forEach((point, index) => {
      const lastPoint = this.points[index - 1];
      if (lastPoint !== undefined) { 
        this.drawPart(lastPoint, point);
      }
    });
  }

  // WIP, currently ignores tool
  /**
   * Render two points of the stroke.
   * @param {BrushPoint} start The first point of the stroke segment.
   * @param {BrushPoint} end The second point of the stroke segment.
   * @returns 
   */
  drawPart(start, end) {

    if (start === undefined || end === undefined) {
      console.log("can't draw this stroke part, point(s) missing!");
      return;
    } 
    if (start.x === end.x && start.y === end.y) return;

    start.azimuth ??= end.azimuth;
    start.azimuth ??= p5.Vector.angleBetween(createVector(0, -1), createVector(end.x-start.x, end.y-start.y));
      end.azimuth ??= p5.Vector.angleBetween(createVector(0, -1), createVector(end.x-start.x, end.y-start.y));
    const averageDirection = averageAngle(start.azimuth, end.azimuth);

      //if (start.pressure === 0.5) start.pressure = 0
      end.pressure ??= start.pressure;
      end.pressure ??= (openPainting.averagePressure ?? 0.5);
    start.pressure ??= (openPainting.averagePressure ?? 0.5);
    const avgPressure = (start.pressure + end.pressure) / 2;

    this.buffer.noStroke();

    const rf = 2 * this.settings.colorVar * this.settings.colorVar; // randomness matches increasing variation
    const brushSize = this.settings.pxSize * (this.settings.texture === "Round" ? 0.7 : 1);
    const avgBrushSize = this.settings.finalPxSizeWithPressure(openPainting.averagePressure) ?? brushSize;
    const strips = Math.floor(map(avgBrushSize, 10, 300, 10, 200) * (this.settings.texture === "Round" ? 0.7 : 1));

    // draw background shape
    if (this.settings.texture !== "Rake") {
      const lowSideLerpPart = HSLColor.symmetricalNoise(0 + end.seed) * 0.5 + 0.5;
      const highSideLerpPart = HSLColor.symmetricalNoise(strips-1 + end.seed) * 0.5 + 0.5;
      const lowSideMiddlePos = {x: lerp(start.x, end.x, lowSideLerpPart), y: lerp(start.y, end.y, lowSideLerpPart)};
      const highSideMiddlePos = {x: lerp(start.x, end.x, highSideLerpPart), y: lerp(start.y, end.y, highSideLerpPart)};
  
      const startEdgeVectorLower  = p5.Vector.fromAngle(start.azimuth, -0.5*brushSize*map(start.pressure, 0, 1, 0.1, 2.0, true));
      const startEdgeVectorHigher = p5.Vector.fromAngle(start.azimuth, 0.5*brushSize*map(start.pressure, 0, 1, 0.1, 2.0, true));
      const endEdgeVectorLower    = p5.Vector.fromAngle(end.azimuth, -0.5*brushSize*map(end.pressure, 0, 1, 0.1, 2.0, true));
      const endEdgeVectorHigher   = p5.Vector.fromAngle(end.azimuth, 0.5*brushSize*map(end.pressure, 0, 1, 0.1, 2.0, true));
      const midEdgeVectorLower    = p5.Vector.fromAngle(averageDirection, -0.5*brushSize*map(avgPressure, 0, 1, 0.1, 2.0, true));
      const midEdgeVectorHigher   = p5.Vector.fromAngle(averageDirection, 0.5*brushSize*map(avgPressure, 0, 1, 0.1, 2.0, true));
  
      this.buffer.fill(this.settings.color.hex);
      this.buffer.strokeWeight(1);
      this.buffer.stroke(this.settings.color.toHexWithSetAlpha(0.5));
      this.buffer.beginShape();
      this.buffer.vertex(start.x + startEdgeVectorLower.x , start.y + startEdgeVectorLower.y );
      this.buffer.vertex(start.x + startEdgeVectorHigher.x, start.y + startEdgeVectorHigher.y);
      this.buffer.vertex(highSideMiddlePos.x + midEdgeVectorHigher.x, highSideMiddlePos.y + midEdgeVectorHigher.y);
      this.buffer.vertex(end.x + endEdgeVectorHigher.x, end.y + endEdgeVectorHigher.y);
      this.buffer.vertex(end.x + endEdgeVectorLower.x, end.y + endEdgeVectorLower.y);
      this.buffer.vertex(lowSideMiddlePos.x + midEdgeVectorLower.x,    lowSideMiddlePos.y + midEdgeVectorLower.y);
      this.buffer.vertex(start.x + startEdgeVectorLower.x , start.y + startEdgeVectorLower.y );
      this.buffer.endShape();
      this.buffer.noStroke();
    }

    const sX = lerp(start.x, end.x, -0.02);
    const sY = lerp(start.y, end.y, -0.02);
    const eX = lerp(start.x, end.x, 1.02);
    const eY = lerp(start.y, end.y, 1.02);

    for (let i = 0; i < strips; i++) {

      const drawThisStrip = (this.settings.texture !== "Rake" || i % 3 == 0 || i == strips-1)

      if (drawThisStrip) {
        const lowerSide = i/strips - 0.5; 
        const higherSide = (i+1)/strips - 0.5;

        const lerpPart = HSLColor.symmetricalNoise(i + end.seed) * 0.5 + 0.5;
        const middleX = lerp(start.x, end.x, lerpPart);
        const middleY = lerp(start.y, end.y, lerpPart);

        const startEdgeVectorLower  = p5.Vector.fromAngle(start.azimuth, lowerSide*brushSize*map(start.pressure, 0, 1, 0.1, 2.0, true));
        const startEdgeVectorHigher = p5.Vector.fromAngle(start.azimuth, higherSide*brushSize*map(start.pressure, 0, 1, 0.1, 2.0, true));

        const endEdgeVectorLower    = p5.Vector.fromAngle(end.azimuth, lowerSide*brushSize*map(end.pressure, 0, 1, 0.1, 2.0, true));
        const endEdgeVectorHigher   = p5.Vector.fromAngle(end.azimuth, higherSide*brushSize*map(end.pressure, 0, 1, 0.1, 2.0, true));

        const midEdgeVectorLower    = p5.Vector.fromAngle(averageDirection, lowerSide*brushSize*map(avgPressure, 0, 1, 0.1, 2.0, true));
        const midEdgeVectorHigher   = p5.Vector.fromAngle(averageDirection, higherSide*brushSize*map(avgPressure, 0, 1, 0.1, 2.0, true));

        // if (HSLColor.symmetricalNoise(start.seed + i) < start.pressure * 4) {
          const brushCol = this.settings.getColorWithVar(i + start.seed).varyComponents(i + this.brushstrokeSeed, 0.1 + this.settings.colorVar * 0.3);

          if (this.settings.texture === "Round") {
            this.buffer.stroke(brushCol.hex);
            this.buffer.strokeWeight(2 * brushSize / strips);
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
            //this.buffer.stroke(brushCol.hex);
            this.buffer.beginShape();
            this.randomizedVertex(this.buffer, sX, startEdgeVectorLower.x ,    sY, startEdgeVectorLower.y ,    rf);
            this.randomizedVertex(this.buffer, sX, startEdgeVectorHigher.x,    sY, startEdgeVectorHigher.y,    rf);
            this.randomizedVertex(this.buffer, middleX, midEdgeVectorHigher.x, middleY, midEdgeVectorHigher.y, rf);
            this.randomizedVertex(this.buffer, middleX, midEdgeVectorLower.x,  middleY, midEdgeVectorLower.y,  rf);
            this.buffer.endShape();
          }
        // }

        // if (HSLColor.symmetricalNoise(end.seed + i) < end.pressure * 4) {
          const brushCol2 = this.settings.getColorWithVar(i + end.seed).varyComponents(i + this.brushstrokeSeed, 0.1 + this.settings.colorVar * 0.3);

          if (this.settings.texture === "Round") {
            this.buffer.stroke(brushCol2.hex);
            this.buffer.strokeWeight(2 * brushSize / strips);
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
            //this.buffer.stroke(brushCol2.hex);
            this.buffer.beginShape();
            this.randomizedVertex(this.buffer, middleX, midEdgeVectorLower.x , middleY, midEdgeVectorLower.y , rf);
            this.randomizedVertex(this.buffer, middleX, midEdgeVectorHigher.x, middleY, midEdgeVectorHigher.y, rf);
            this.randomizedVertex(this.buffer, eX  , endEdgeVectorHigher.x, eY  , endEdgeVectorHigher.y, rf);
            this.randomizedVertex(this.buffer, eX  , endEdgeVectorLower.x , eY  , endEdgeVectorLower.y , rf);
            this.buffer.endShape();
          }
        // }
      }
    }
  }

  randomizedVertex(buffer, x, xOff, y, yOff, randomFactor) {
    buffer.vertex(
      x + xOff + HSLColor.symmetricalNoise(x*4 + xOff*2) * randomFactor, 
      y + yOff + HSLColor.symmetricalNoise(y*4 + yOff*2) * randomFactor
    );
  }
}


class Painting {
  /**
   * Creates an instance of Painting.
   * Will contain a main buffer as a set number of temporary strokes that can be undone or edited, with their own methods.
   * @param {number} width The initial width in pixels.
   * @param {number} height The initial height in pixels.
   * @param {HSLColor} backgroundColor The initial background color.
   * @param {BrushSettings} startingBrush The initial brush settings.
   */
  constructor(width, height, backgroundColor, startingBrush) {
    this.width = width;
    this.height = height;
    this.mainBuffer = createGraphics(width, height);
    this.editableStrokesInUse = 0;
    this.editableStrokes = Array.from({ length: 16 }, () => new Brushstroke(createGraphics(width, height), startingBrush));
    this.currentBrush = startingBrush;
    this.previousBrushes = [];
    this.canvasColor = backgroundColor;
    this.hueRotation = 0;
    this.averagePressure = undefined;

    this.clearWithColor(backgroundColor); // WIP, this is currently missing anything for display density
  }

  get previousBrush() {
    return this.previousBrushes[this.previousBrushes.length - 1];
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
    if (Interaction.editingLastStroke) return this.latestStroke.settings;
    return openPainting.currentBrush;
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

  startStroke(brushSettings) {
    if (this.editableStrokesInUse > 0) this.averagePressure = this.latestStroke.averagePressureInLast(20);
    if (this.editableStrokesInUse > this.editableStrokes.length - 1) this.applyOldestStroke();
    this.editableStrokesInUse += 1;
    //console.log("started new stroke:", this.editableStrokesInUse);
    const currentStroke = this.editableStrokes[this.editableStrokesInUse-1];
    currentStroke.reset();
    currentStroke.settings = brushSettings;
  }

  updateStroke(newInteraction) {
    if (this.editableStrokesInUse === 0) {
      console.log("nothing to update!");
      return;
    }

    this.latestStroke.addPoint({
      x: newInteraction.x,
      y: newInteraction.y,
      azimuth: newInteraction.azimuth,
      pressure: newInteraction.pressure,
      timeStamp: newInteraction.timeStamp
    });
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
    this.latestStroke.drawWhole();
  }

  redrawLatestStroke() {
    if (this.editableStrokesInUse === 0) {
      console.log("nothing to redraw!");
      return;
    }
    this.latestStroke.buffer.clear();
    this.latestStroke.drawWhole();
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

    // draw to the stroke buffer immediately
    // wip, some tools would be drawn in interface buffer instead and
    // only added fully when the pen is lifted.

    const lastPoint = this.latestStroke.points[this.latestStroke.points.length-2];
    const newPoint  = this.latestStroke.points[this.latestStroke.points.length-1];

    this.latestStroke.drawPart(lastPoint, newPoint);
  }

  getPointRGB(point) {
    // update eyedropper
    openPainting.applyAllStrokes();
    const buffer = openPainting.oldStrokesBuffer;

    // go through a few pixels
    const addRadiusPx = 2;
    const colorsArr = [];
    for (let x = -addRadiusPx; x <= addRadiusPx; x++) {
      for (let y = -addRadiusPx; y <= addRadiusPx; y++) {
        const rgbaColor = buffer.get(point.x + x, point.y + y);
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

    return accumulatingRGB.map((component) => component / colorsArr.length);
  }
}


// this is where most state should go, besides anything
// that would be saved with the painting.
class Interaction {

  static MAX_BRUSH_HISTORY_LENGTH = 16;

  // WIP, just defaults. these should really adapt
  static viewTransform = {
    scale: 1,
    rotation: 0,
    panX: 0,
    panY: 0,
    centerPos: () => {
      // rotated around center and scaled, where is the corner?
      // const point = rotatePoint(
      //   (-openPainting.width/2)*Interaction.viewTransform.scale, 
      //   (-openPainting.height/2)*Interaction.viewTransform.scale, 
      //   Interaction.viewTransform.rotation
      // );
      // actually translate to center and add panning
      return {
        x: Interaction.viewTransform.panX + width/2, 
        y: Interaction.viewTransform.panY + height/2
      };
    }
  };

  static pressedKeys = new Set();

  // temporary edit mode.
  // if true, sliders and gizmos etc. will modify the last stroke
  // rather than the brush settings for the upcoming one
  static editingLastStroke = false;
  static hueRotationBeforeEditing = null;

  static UI_STATES = {
    nothing_open: 'default',
    eyedropper_open: 'eyedropper',
    clover_open: 'clover',
    hueAndVar_open: 'hueAndVar',
    satAndLum_open: 'satAndLum',
    size_open: 'size',
  }
  static currentUI = Interaction.UI_STATES.nothing_open;

  // store just the current interaction sequence
  // clear array if the type changes or pointers are added/removed
  static currentSequence = [];
  static lastInteractionEnd = null;

  static currentType = null; // actual type of the gesture
  static typeAtCurrentElement = null; // starting/hover type if there is an element at the pointer

  // 'enum' of possible current interactions that gestures belong to
  static TYPES = {
    painting: {
      hover: 'hover',
      initStroke: 'initStroke', // either leads to draw/move or menu opening
      draw: 'draw',
      move: 'move',
      eyedropper: 'eyedropper',
      zoom: 'zoom'
    },
    button: {
      undo: 'undoButton',
      edit: 'editButton',
      clear: 'clearButton',
      save: 'saveButton',
      tool0: '0',
      tool1: '1',
      tool2: '2',
      help: 'helpButton',
      fill: ' fillButton'
    },
    knob: {
      jitter: 'jitterKnob',
      size: 'sizeKnob'
    },
    slider: {
      hue: 'hueSlider',
      saturation: 'saturationSlider',
      lightness: 'lightnessSlider'
    },
    gizmo: {
      hueAndVar: 'hueAndVarGizmo',
      satAndLum: 'satAndLumGizmo',
      size: 'sizeGizmo',
    }
  };

  static get middleUIVisible() {
    return (width > 980);
  }

  static get isAlreadyDown() {
    return (Interaction.currentType !== null && Interaction.currentType !== Interaction.TYPES.painting.hover);
  }

  static adjustCanvasSize(windowWidth, windowHeight) {
    resizeCanvas(windowWidth, windowHeight);
    UI.buffer.resizeCanvas(width, height);
  }

  static lostFocus() {
    Interaction.currentType = null;
    Interaction.currentSequence = [];
    Interaction.currentUI = Interaction.UI_STATES.nothing_open;
  }

  static wheelScrolled(event) {
    event.preventDefault();
    const new_interaction = Interaction.fromEvent(event);

    // check if keys are held
    const pressedKeysArr = Array.from(Interaction.pressedKeys);
    if (pressedKeysArr.length === 1 && pressedKeysArr[0] === 'Shift') {
      // rotate
      Interaction.rotateAround(new_interaction.x, new_interaction.y, 0.001 * -event.deltaY);
      return;
    } 

    // zoom
    const zoomFactor = Math.pow(1.002, -event.deltaY);
    Interaction.zoomTo(new_interaction.x, new_interaction.y, zoomFactor);
  }

  static resetViewTransform() {
    Interaction.viewTransform.scale = 1;
    Interaction.viewTransform.panX = 0;
    Interaction.viewTransform.panY = 0;
    Interaction.viewTransform.rotation = 0;
  }

  static zoomTo(screenX, screenY, factor) {

    // do the zoom
    Interaction.viewTransform.scale *= factor;

    // reset all if the zoom was too far out
    // if (Interaction.viewTransform.scale < 0.3) {
    //   Interaction.resetViewTransform();
    //   return;
    // }

    // add offset - subtract zoom position, scale, then add again.
    const screenXfromCenter = screenX - width / 2;
    const screenYfromCenter = screenY - height / 2;
    Interaction.viewTransform.panX = (Interaction.viewTransform.panX - screenXfromCenter) * factor + screenXfromCenter;
    Interaction.viewTransform.panY = (Interaction.viewTransform.panY - screenYfromCenter) * factor + screenYfromCenter;
  }

  static rotateAround(screenX, screenY, angle) {

    // do the rotation
    Interaction.viewTransform.rotation += angle;

    //add offset - subtract rotation pivot, rotate, then add again.
    const screenXfromCenter = screenX - width / 2 
    const screenYfromCenter = screenY - height / 2; 
    const rotatedPoint = rotatePoint(Interaction.viewTransform.panX - screenXfromCenter, Interaction.viewTransform.panY - screenYfromCenter, angle);
    Interaction.viewTransform.panX = rotatedPoint.x + screenXfromCenter;
    Interaction.viewTransform.panY = rotatedPoint.y + screenYfromCenter;
  }

  static keyStart(key) {

    // if a pointer is currently down, don't even register most keys and just do nothing.
    const validWhileDown = ["Shift"];
    if (!validWhileDown.includes(key) && Interaction.currentType !== Interaction.TYPES.painting.hover && Interaction.currentType !== null) return;

    // otherwise, keep track of which key was pressed and react to the keypress.
    Interaction.pressedKeys.add(key);
    if (dev_mode) console.log('Keys held:', Array.from(Interaction.pressedKeys).join(', '));

    if (key === "f") {
      Interaction.rotateHueAction();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      //console.log('rotate to: '+ openPainting.hueRotation, 'current hue: '+ openPainting.currentBrush.color.hue);
    } else if (key === "s") {
      Interaction.saveAction();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.resetCurrentSequence();
    } else if (key === "u") {
      Interaction.undoAction();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.resetCurrentSequence();
    } else if (key === "e") {
      Interaction.editAction();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.resetCurrentSequence();
    } else if (key === "1") {
      Interaction.addToBrushHistory();
      Interaction.currentUI = Interaction.UI_STATES.satAndLum_open;
      Interaction.resetCurrentSequence();
    } else if (key === "2") {
      Interaction.addToBrushHistory();
      Interaction.currentUI = Interaction.UI_STATES.hueAndVar_open;
      Interaction.resetCurrentSequence();
    } else if (key === "3") {
      Interaction.addToBrushHistory();
      Interaction.currentUI = Interaction.UI_STATES.size_open;
      Interaction.resetCurrentSequence();
    } else if (key === "4") {
      Interaction.addToBrushHistory();
      Interaction.currentUI = Interaction.UI_STATES.eyedropper_open;
    } else if (key === "r") {
      Interaction.resetViewTransform();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.resetCurrentSequence();
    } else if (key === "h") {
      Interaction.toggleHelp();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.resetCurrentSequence();
    }
  }

  static resetCurrentSequence() {
    Interaction.currentType = null;
    if (Interaction.currentSequence.length > 0) {
      Interaction.lastInteractionEnd = Interaction.currentSequence[Interaction.currentSequence.length-1];
    } else {
      if (dev_mode) console.log("last interaction was not overwritten")
    }
    Interaction.currentSequence = [];
  }

  static keyEnd(key) {

    if (!Interaction.pressedKeys.has(key)) return; //key was never doing anything to begin with

    Interaction.pressedKeys.delete(key);

    Interaction.currentUI = Interaction.UI_STATES.nothing_open;

    if (key === "4") {
      //eyedropper keeps hover state
      return; 
    }

    if (key !== "e") {
      Interaction.stopEditing();
    }

    Interaction.currentType = null;
    Interaction.currentSequence = [];
  }

  static addToBrushHistory() {
    // adds a copy of the brush settings that are about to be changed to the
    // brush history. wip: if there was no change, this should be reverted
    openPainting.previousBrushes.push(openPainting.brushSettingsToAdjust.copy());
    if (openPainting.previousBrushes.length > Interaction.MAX_BRUSH_HISTORY_LENGTH) {
      openPainting.previousBrushes.shift();
    }
  }

  static saveAction() {
    // commit strokes to the painting
    openPainting.applyAllStrokes();
    openPainting.download();
  }

  static toggleHelp() {
    UI.showingHelp = !UI.showingHelp;
  }

  static clearAction() {
    Interaction.stopEditing();
    openPainting.clearWithColor(openPainting.canvasColor);
  }

  static fillAction() {
    Interaction.stopEditing();
    openPainting.canvasColor = openPainting.currentBrush.color.copy();
    openPainting.clearWithColor(openPainting.canvasColor);
    document.body.style.backgroundColor = openPainting.canvasColor.behind().hex;
  }

  static undoAction() {
    openPainting.popLatestStroke();
    Interaction.stopEditing();
  }

  static editAction() {
    //toggle off again or prevent turning on because there are no strokes to edit
    if (openPainting.editableStrokesCount === 0) return;
    if (Interaction.stopEditing()) return;
    Interaction.editingLastStroke = true;
    Interaction.hueRotationBeforeEditing = openPainting.hueRotation;
  }

  static stopEditing() {
    if (Interaction.editingLastStroke) {
      Interaction.editingLastStroke = false;
      openPainting.hueRotation = Interaction.hueRotationBeforeEditing;
      return true;
    }
  }

  static pickToolAction(index) {
    const modifyBrush = openPainting.brushSettingsToAdjust;
    modifyBrush.tool = PRESET_TOOLS[index].tool;
    modifyBrush.texture = PRESET_TOOLS[index].texture;

    if (Interaction.editingLastStroke) {
      openPainting.redrawLatestStroke();
      Interaction.stopEditing();
    }
    Interaction.currentUI = Interaction.UI_STATES.nothing_open;
  }

  static rotateHueAction() {
    openPainting.hueRotation += 0.5;
    openPainting.hueRotation %= 1;
    const rotatedHue = openPainting.brushSettingsToAdjust.color.hue + 0.5;
    openPainting.brushSettingsToAdjust.color.setHue(rotatedHue % 1);

    if (Interaction.editingLastStroke) {
      openPainting.redrawLatestStroke();
      Interaction.stopEditing();
    }
  }

  static processSlider(new_interaction) {
    const middle_width = UI.SLIDER_WIDTH * 3 + 120;
    const xInMiddleSection = new_interaction.x - width/2 + middle_width/2;
    const brushToAdjust = openPainting.brushSettingsToAdjust;
    const percentOfSlider = (sliderNumber) => map(xInMiddleSection - 60 - UI.SLIDER_WIDTH * sliderNumber, UI.ELEMENT_MARGIN, UI.SLIDER_WIDTH-UI.ELEMENT_MARGIN, 0, 1);

    if (Interaction.currentType === Interaction.TYPES.slider.lightness) {
      const newValue = constrain(percentOfSlider(0), 0, 1);
      brushToAdjust.color.setLightness(newValue);
    } else if (Interaction.currentType === Interaction.TYPES.slider.saturation) {
      const newValue = constrain(percentOfSlider(1), 0, 1)*2 - 1;
      if (newValue < 0 && openPainting.hueRotation === 0) {
        Interaction.rotateHueAction();
      } else if (newValue >= 0 && openPainting.hueRotation !== 0) {
        Interaction.rotateHueAction();
      }
      brushToAdjust.color.setSaturation(Math.abs(newValue));
    } else if (Interaction.currentType === Interaction.TYPES.slider.hue) {
      let newValue = percentOfSlider(2);
      newValue += openPainting.hueRotation;
      if (newValue > 1) newValue %= 1;
      if (newValue < 0) newValue = 1-(Math.abs(newValue) % 1);
      brushToAdjust.color.setHue(newValue);
    }
  }

  static typeFromCoords(x, y) {
    if (y < UI.BUTTON_HEIGHT) {
      const middle_width = UI.SLIDER_WIDTH * 3 + 120;

      if (x < UI.BUTTON_WIDTH) {
        // first button
        return Interaction.TYPES.button.undo;

      } else if (x < UI.BUTTON_WIDTH * 2) {
        // second button
        return Interaction.TYPES.button.edit;

      } else if (x > width - UI.BUTTON_WIDTH) {
        // rightmost button
        return Interaction.TYPES.button.save;

      } else if (x > width - UI.BUTTON_WIDTH*2) {
        // second to last
        return Interaction.TYPES.button.clear;

      } else if (Interaction.middleUIVisible) {

        const xInMiddleSection = x - width/2 + middle_width/2;
        if (xInMiddleSection > 0) {
          if (xInMiddleSection < 60) {
            //var
            return Interaction.TYPES.knob.size;

          } else if (xInMiddleSection < 60 + UI.SLIDER_WIDTH) {
            // lightness
            return Interaction.TYPES.slider.lightness;

          } else if (xInMiddleSection < 60 + UI.SLIDER_WIDTH * 2) {
            // lightness
            return Interaction.TYPES.slider.saturation;

          } else if (xInMiddleSection < 60 + UI.SLIDER_WIDTH * 3) {
            // hue
            return Interaction.TYPES.slider.hue;

          } else if (xInMiddleSection < 120 + UI.SLIDER_WIDTH * 3) {
            // size
            return Interaction.TYPES.knob.jitter;

          }
        }
      }
    }

    if ((x < 100 || x > width-100) && Interaction.currentUI === Interaction.UI_STATES.clover_open) {
      const toolsY = y - UI.BUTTON_WIDTH * 2; // how far down these buttons start
      const toolIndex = Math.floor(toolsY / UI.BUTTON_HEIGHT);

      if (x<100) {
        // left side
        if (toolIndex === 0) {
          return Interaction.TYPES.button.tool0;
        } else if (toolIndex === 1) {
          return Interaction.TYPES.button.tool1;
        } else if (toolIndex === 2) {
          return Interaction.TYPES.button.tool2;
        }
      } else {
        // right side
        if (toolIndex === 0) {
          return Interaction.TYPES.button.fill;
        }
      }
      
    }

    if (x > width - UI.BUTTON_WIDTH && y > height - UI.BUTTON_HEIGHT && width > UI.MOBILE_WIDTH_BREAKPOINT) {
      return Interaction.TYPES.button.help;
    }

    return null;
  }

  static pointerStart(event) {

    event.preventDefault();
    const new_interaction = Interaction.fromEvent(event);

    if (!event.isPrimary && event.pointerType === "touch") {
      if (Interaction.currentType === Interaction.TYPES.painting.initStroke) {
        Interaction.currentType = Interaction.TYPES.painting.zoom;
        Interaction.currentSequence.push(new_interaction);
      } else if (Interaction.currentType === Interaction.TYPES.painting.zoom) {
        // third finger resets al transforms.
        Interaction.resetViewTransform();
        Interaction.currentSequence = [];
      }
      return;
    }

    // tapped on an element?
    Interaction.typeAtCurrentElement = Interaction.typeFromCoords(new_interaction.x, new_interaction.y) ?? null;
    
    // when no second pointer was already down
    if (Interaction.typeAtCurrentElement !== null && !Interaction.isAlreadyDown) {

      Interaction.currentType = Interaction.typeAtCurrentElement;
      if (Object.values(Interaction.TYPES.knob).includes(Interaction.currentType)) {
        // started on a knob
        Interaction.addToBrushHistory();
        Interaction.currentSequence = [new_interaction];
      } else if (Object.values(Interaction.TYPES.slider).includes(Interaction.currentType)) {
        // started on a slider
        Interaction.addToBrushHistory();
        Interaction.currentSequence = [new_interaction];
        Interaction.currentUI = Interaction.UI_STATES.nothing_open;
        Interaction.processSlider(new_interaction); // change the color
      } else {
        Interaction.currentSequence = [new_interaction];
      }
      return;
    }

    if (!Interaction.isAlreadyDown) {
      // new pointer down! no existing mode.

      if (Interaction.currentUI === Interaction.UI_STATES.satAndLum_open) {

        Interaction.currentSequence = [new_interaction];
        Interaction.currentType = Interaction.TYPES.gizmo.satAndLum;

      } else if (Interaction.currentUI === Interaction.UI_STATES.hueAndVar_open) {

        Interaction.currentSequence = [new_interaction];
        Interaction.currentType = Interaction.TYPES.gizmo.hueAndVar;
        
      } else if (Interaction.currentUI === Interaction.UI_STATES.size_open) {

        Interaction.currentSequence = [new_interaction];
        Interaction.currentType = Interaction.TYPES.gizmo.size;
        
      } else if (Interaction.currentUI === Interaction.UI_STATES.eyedropper_open) {

        Interaction.currentSequence = [new_interaction];
        Interaction.currentType = Interaction.TYPES.painting.eyedropper;
        
      } else {

        // brushstroke
        Interaction.currentSequence = [new_interaction];
        Interaction.currentType = Interaction.TYPES.painting.initStroke;
      }

    } else {

      // WIP...
      console.log('something was already pressed, weird');

    }
  }

  static pointerMove(event) {

    event.preventDefault();
    const new_interaction = Interaction.fromEvent(event);

    if (Interaction.currentType === Interaction.TYPES.painting.zoom) {
      // either pointer moving produces a result
      if (Interaction.currentSequence.length !== 2) {
        console.log("wrong number of starting points for zoom...");
        return;
      }

      // get distance, pre move position and angle through the points.
      const previousDistance = Interaction.distance2d(Interaction.currentSequence[0], Interaction.currentSequence[1]);
      //const previousPosition = {x: Interaction.currentSequence[movedPoint].x, y: Interaction.currentSequence[movedPoint].y};
      const previousAngle = pointsToAngle(
        Interaction.currentSequence[0].x, Interaction.currentSequence[0].y,
        Interaction.currentSequence[1].x, Interaction.currentSequence[1].y
      );
      const previousAverage = {
        x: (Interaction.currentSequence[0].x + Interaction.currentSequence[1].x) / 2,
        y: (Interaction.currentSequence[0].y + Interaction.currentSequence[1].y) / 2,
      }

      // update the point that changed
      // which point moved?
      let movedPoint = null;
      if (Interaction.currentSequence[0].id === event.pointerId) {
        movedPoint = 0;
      } else if (Interaction.currentSequence[1].id === event.pointerId) {
        movedPoint = 1;
      } else {
        console.log("could not find a point that corredsponds to one of the zoom touches!")
        return;
      }
      Interaction.currentSequence[movedPoint] = new_interaction;

      // get distance, average position and angle through the new points.
      const newDistance = Interaction.distance2d(Interaction.currentSequence[0], Interaction.currentSequence[1]);
      //const newPosition = {x: Interaction.currentSequence[movedPoint].x, y: Interaction.currentSequence[movedPoint].y};
      const newAngle = pointsToAngle(
        Interaction.currentSequence[0].x, Interaction.currentSequence[0].y,
        Interaction.currentSequence[1].x, Interaction.currentSequence[1].y
      );
      const newAverage = {
        x: (Interaction.currentSequence[0].x + Interaction.currentSequence[1].x) / 2,
        y: (Interaction.currentSequence[0].y + Interaction.currentSequence[1].y) / 2,
      }

      // zoom on new center
      Interaction.zoomTo(newAverage.x, newAverage.y,  newDistance / previousDistance);
      // rotate around new center
      Interaction.rotateAround(newAverage.x, newAverage.y,  newAngle - previousAngle);
      // pan.
      Interaction.viewTransform.panX += newAverage.x - previousAverage.x;
      Interaction.viewTransform.panY += newAverage.y - previousAverage.y;
      return;
    }

    if (!event.isPrimary && event.pointerType === "touch") return;


    // single pointer
    // check if currently over an element, and return which.
    Interaction.typeAtCurrentElement = Interaction.typeFromCoords(new_interaction.x, new_interaction.y);

    if (Object.values(Interaction.TYPES.button).includes(Interaction.currentType)) {

      // started on a button
      if (Interaction.typeAtCurrentElement !== Interaction.currentType) {
        // if no longer on the button, reset 
        console.log("left the button")
        Interaction.currentType = null;
        Interaction.currentSequence = [new_interaction];
        Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      }

    } else if (Object.values(Interaction.TYPES.knob).includes(Interaction.currentType)) {

      // started on a knob
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.currentSequence[1] = new_interaction;
      const deltaX = Interaction.currentSequence[1].x - Interaction.currentSequence[0].x;

      if (deltaX === 0) return;
      const brushToAdjust = openPainting.brushSettingsToAdjust;
      const deltaValue = deltaX * 0.002;
      if (Interaction.currentType === Interaction.TYPES.knob.jitter) {
        brushToAdjust.colorVar = constrain(openPainting.previousBrush.colorVar + deltaValue, 0, 1);
      } else if (Interaction.currentType === Interaction.TYPES.knob.size) {
        brushToAdjust.size = constrain(openPainting.previousBrush.size + deltaValue, 0, 1);
      }
      if (Interaction.editingLastStroke) openPainting.redrawLatestStroke();

    } else if (Object.values(Interaction.TYPES.slider).includes(Interaction.currentType)) {

      // started on a slider
      Interaction.currentSequence[1] = new_interaction;
      Interaction.processSlider(new_interaction);

      if (Interaction.editingLastStroke) openPainting.redrawLatestStroke();

    } else if (Interaction.currentType === null) {

      // default, because no pointer down or last interaction was cancelled.
      // if pointerMove happens in this state, it starts the hover interaction which leaves a trace behind

      // only if not over an element
      if (Interaction.typeAtCurrentElement !== null) {
        return;
      }

      // start hover
      Interaction.currentType = Interaction.TYPES.painting.hover;
      if (Interaction.currentUI !== Interaction.UI_STATES.nothing_open) return; // no hover preview in menus anyway, so don't even record
      Interaction.currentSequence.push(new_interaction);

    } else if (Interaction.currentType === Interaction.TYPES.painting.hover) {

      // stop if hover goes over an element
      if (Interaction.typeAtCurrentElement !== null) {
        Interaction.currentType = null;
        Interaction.currentSequence = [];
        return;
      }

      if (Interaction.currentUI !== Interaction.UI_STATES.nothing_open) {
        // in menus, just keep one point
        Interaction.currentSequence = [new_interaction];
        return; 
      } 

      // continue hover sequence if beyond minimum distance travelled from last point.
      const last_interaction = Interaction.currentSequence[Interaction.currentSequence.length-1];
      if (Interaction.distance2d(last_interaction, new_interaction) > 2) {

        if (Interaction.currentSequence.length >= 64) Interaction.currentSequence.shift();
        Interaction.currentSequence.push(new_interaction);
      }


    } else if (Interaction.currentType === Interaction.TYPES.painting.initStroke) { 

      // dragging over the canvas first starts this mode.
      // switch to brushstroke/move/gizmo if moved far enough.
      // otherwise, the interaction counts as a click: the clover gizmo will open/ close when the interaction ends.

      const totalDeltaTime = new_interaction.timeStamp - Interaction.currentSequence[0].timeStamp;
      const boxDistance = Interaction.distance2d(new_interaction, Interaction.currentSequence[0]);
      const totalDistance = Interaction.currentSequence.reduce((sum, currentPoint, index, arr) => {
        if (index < arr.length - 1) {
          return sum + Interaction.distance2d(currentPoint, arr[index + 1]);
        }
        return sum;
      }, 0);

      // WIP, this needs tweaking
      // and maybe putting elsewhere as a special constant
      if (totalDeltaTime > 200 || totalDistance > 10 || boxDistance > 4) {
        // was a drag, not a click

        // dragging inside the clover menu starts a new interaction depending on the delta position
        if (Interaction.currentUI === Interaction.UI_STATES.clover_open) {

          // open specific gizmo
          const deltaPos = {
            x: new_interaction.x - Interaction.lastInteractionEnd.x,
            y: new_interaction.y - Interaction.lastInteractionEnd.y
          }
          if (Math.abs(deltaPos.x) > 10 || Math.abs(deltaPos.y) > 10) {
            if (Math.abs(deltaPos.x) > Math.abs(deltaPos.y)) {
              // horizontal
              if (deltaPos.x < 0) {
                // start size gizmo
                Interaction.addToBrushHistory();
                Interaction.currentUI = Interaction.UI_STATES.size_open;
                Interaction.currentType = Interaction.TYPES.gizmo.size;
                Interaction.currentSequence = [Interaction.currentSequence[0]]; //start with just the last point as reference
              } else {
                // start hue and var
                Interaction.addToBrushHistory();
                Interaction.currentUI = Interaction.UI_STATES.hueAndVar_open;
                Interaction.currentType = Interaction.TYPES.gizmo.hueAndVar;
                Interaction.currentSequence = [Interaction.currentSequence[0]]; //start with just the last point as reference
              }
            } else {
              // vertical
              if (deltaPos.y < 0) {
                // start eyedropper
                Interaction.addToBrushHistory();
                Interaction.currentType = Interaction.TYPES.painting.eyedropper;
                Interaction.currentUI = Interaction.UI_STATES.eyedropper_open;
                Interaction.currentSequence = [Interaction.currentSequence[0]]; //start with just the last point as reference
              } else {
                // start lum and sat
                Interaction.addToBrushHistory();
                Interaction.currentUI = Interaction.UI_STATES.satAndLum_open;
                Interaction.currentType = Interaction.TYPES.gizmo.satAndLum;
                Interaction.currentSequence = [Interaction.currentSequence[0]]; //start with just the last point as reference
              }
            }  
          } 
          // in pointerEnd, an initStroke while the clover menu is open can be processed.
          // that would mean the cursor remained in the middle the whole time.

        } else if (Interaction.editingLastStroke) {
          // move brushstroke
          Interaction.currentType = Interaction.TYPES.painting.move;
          // WIP, should this already lead to movement in this first interaction?

        } else {
          // start brushstroke
          Interaction.currentType = Interaction.TYPES.painting.draw;
          openPainting.startStroke(openPainting.currentBrush.copy());

          // draw the existing segments that have not been drawn yet all at once
          // this code isn't pretty but seems to works
          const segmentsToAddImmediately = [...Interaction.currentSequence, new_interaction];
          let lastIndex = 0;
          segmentsToAddImmediately.forEach((step, index) => {
            if (index > 0) {
              const lastStep = segmentsToAddImmediately[lastIndex];

              if (Interaction.distance2d(lastStep, step) > 2) {
                lastIndex = index - 1;
                
                openPainting.updateStroke(step.addPaintingTransform());
                openPainting.continueDrawing();
              }
            } else {
              openPainting.updateStroke(step.addPaintingTransform());
              openPainting.continueDrawing();
            }
          })
        }
      }

      Interaction.currentSequence.push(new_interaction);


    } else if (Interaction.currentType === Interaction.TYPES.painting.draw) { 

      // continue drag gesture
      const last_interaction = Interaction.currentSequence[Interaction.currentSequence.length-1];
      if (Interaction.distance2d(last_interaction, new_interaction) > 2) {
        Interaction.currentSequence.push(new_interaction);
        openPainting.updateStroke(new_interaction.addPaintingTransform());
        openPainting.continueDrawing();
      }

    } else if (Interaction.currentType === Interaction.TYPES.painting.move) { 

      const last_interaction = Interaction.currentSequence[Interaction.currentSequence.length-1];
      const deltaMove = {
        x: new_interaction.addPaintingTransform().x - last_interaction.addPaintingTransform().x,
        y: new_interaction.addPaintingTransform().y - last_interaction.addPaintingTransform().y
      }
      openPainting.moveLatestStroke(deltaMove.x, deltaMove.y);
      Interaction.currentSequence.push(new_interaction);

    } else if (Interaction.currentType === Interaction.TYPES.painting.eyedropper) {

      Interaction.currentSequence = [new_interaction];
      const brushToAdjust = openPainting.brushSettingsToAdjust;
      const combinedRGB = openPainting.getPointRGB(new_interaction.addPaintingTransform());
      brushToAdjust.color = HSLColor.fromRGBwithFallback(combinedRGB[0], combinedRGB[1], combinedRGB[2], brushToAdjust.color);
      if (Interaction.editingLastStroke) openPainting.redrawLatestStroke();

    } else if (Interaction.currentType === Interaction.TYPES.gizmo.satAndLum) { 

      Interaction.currentSequence[1] = new_interaction;
      const brushToAdjust = openPainting.brushSettingsToAdjust;
      const brushToReference = openPainting.previousBrush;

      const deltaX = Interaction.currentSequence[1].x - Interaction.currentSequence[0].x;
      const deltaY = Interaction.currentSequence[1].y - Interaction.currentSequence[0].y;
      const rangeX = UI.GIZMO_SIZE * 2;
      const rangeY = UI.GIZMO_SIZE * 2;

      // Map to chroma and lightness
      brushToAdjust.color.setSaturation(map( deltaX + rangeX * brushToReference.color.saturation, 0, rangeX, 0, 1, true));
      brushToAdjust.color.setLightness(map(-deltaY + rangeY * brushToReference.color.lightness, 0, rangeY, 0, 1, true));
      if (Interaction.editingLastStroke) openPainting.redrawLatestStroke();

    } else if (Interaction.currentType === Interaction.TYPES.gizmo.hueAndVar) { 

      Interaction.currentSequence[1] = new_interaction;
      const brushToAdjust = openPainting.brushSettingsToAdjust;
      const brushToReference = openPainting.previousBrush;

      const deltaX = Interaction.currentSequence[1].x - Interaction.currentSequence[0].x;
      const deltaY = Interaction.currentSequence[1].y - Interaction.currentSequence[0].y;
      const rangeX = UI.GIZMO_SIZE * 2;
      const rangeY = UI.GIZMO_SIZE * 2;

      let newHue = map(deltaX + rangeX * brushToReference.color.hue, 0, rangeX, 0, 1);
      if (newHue > 1) newHue %= 1;
      if (newHue < 0) newHue = 1-(Math.abs(newHue) % 1);
      brushToAdjust.color.setHue(newHue);
      brushToAdjust.colorVar = map(-deltaY + rangeY * brushToReference.colorVar, 0, rangeY, 0, 1, true);
      if (Interaction.editingLastStroke) openPainting.redrawLatestStroke();
      
    } else if (Interaction.currentType === Interaction.TYPES.gizmo.size) { 

      Interaction.currentSequence[1] = new_interaction;
      const brushToAdjust = openPainting.brushSettingsToAdjust;
      const brushToReference = openPainting.previousBrush;

      const deltaY = Interaction.currentSequence[1].y - Interaction.currentSequence[0].y;
      const rangeY = UI.GIZMO_SIZE * 2;
      
      brushToAdjust.size = map(-deltaY + rangeY * brushToReference.size, 0, rangeY, 0, 1, true);
      if (Interaction.editingLastStroke) openPainting.redrawLatestStroke();
    }
  }

  static pointerEnd(event) {

    event.preventDefault();
    if (Interaction.currentType === Interaction.TYPES.painting.zoom) {
      Interaction.currentType = null;
      Interaction.currentSequence = [];
      // other pointer end will be ignored
    }

    if (!event.isPrimary && event.pointerType === "touch") return;

    const new_interaction = Interaction.fromEvent(event);
    Interaction.typeAtCurrentElement = null;

    if (Object.values(Interaction.TYPES.button).includes(Interaction.currentType)) {

      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      // ended on button
      if (Interaction.currentType === Interaction.TYPES.button.undo) {
        Interaction.undoAction();
      } else if (Interaction.currentType === Interaction.TYPES.button.edit) {
        Interaction.editAction();
      } else if (Interaction.currentType === Interaction.TYPES.button.clear) {
        Interaction.clearAction();
      } else if (Interaction.currentType === Interaction.TYPES.button.save) {
        Interaction.saveAction();
      } else if (Interaction.currentType === Interaction.TYPES.button.help) {
        Interaction.toggleHelp();
      } else if (Interaction.currentType === Interaction.TYPES.button.tool0) {
        Interaction.pickToolAction(0);
      } else if (Interaction.currentType === Interaction.TYPES.button.tool1) {
        Interaction.pickToolAction(1);
      } else if (Interaction.currentType === Interaction.TYPES.button.tool2) {
        Interaction.pickToolAction(2);
      } else if (Interaction.currentType === Interaction.TYPES.button.fill) {
        Interaction.fillAction();
      }
      Interaction.resetCurrentSequence();
    } 
    
    if (Object.values(Interaction.TYPES.knob).includes(Interaction.currentType)) {

      // started on a knob
      Interaction.resetCurrentSequence();
      Interaction.stopEditing();

    } else if (Object.values(Interaction.TYPES.slider).includes(Interaction.currentType)) {

      // started on a slider
      Interaction.resetCurrentSequence();
      Interaction.stopEditing();

    } else if (Interaction.currentType === Interaction.TYPES.painting.draw) {

      // try drawing here still,wip?
      Interaction.resetCurrentSequence();

    } else if (Interaction.currentType === Interaction.TYPES.painting.move) {

      // try moving here still,wip?
      Interaction.resetCurrentSequence();
      Interaction.stopEditing();

    } else if (Interaction.currentType === Interaction.TYPES.painting.initStroke) {

      // open menu
      if (Interaction.currentUI === Interaction.UI_STATES.nothing_open) {
        Interaction.currentUI = Interaction.UI_STATES.clover_open;
      } else {
        // close clover
        Interaction.currentUI = Interaction.UI_STATES.nothing_open;
        Interaction.stopEditing();
      }

      Interaction.resetCurrentSequence();

    } else if (Interaction.currentType === Interaction.TYPES.gizmo.size) {

      Interaction.resetCurrentSequence();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.stopEditing();

    } else if (Interaction.currentType === Interaction.TYPES.gizmo.hueAndVar) {

      Interaction.resetCurrentSequence();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.stopEditing();

    } else if (Interaction.currentType === Interaction.TYPES.gizmo.satAndLum) {

      Interaction.resetCurrentSequence();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.stopEditing();

    } else if (Interaction.currentType === Interaction.TYPES.painting.eyedropper) {

      // actually pick the color again, wip?
      Interaction.resetCurrentSequence();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.stopEditing();

    } else {
      // was hover or none
      if (dev_mode) console.log("pointerEnd with unknown type: " + Interaction.currentType);
      Interaction.resetCurrentSequence();
    }
  }

  static pointerCancel(event) {

    event.preventDefault();
    if (!event.isPrimary && event.pointerType === "touch") return;

    if (Interaction.currentType !== null && Interaction.currentType !== Interaction.TYPES.painting.hover) {
      console.log('pointer event cancelled.')
    }

    Interaction.currentType = null;
    Interaction.currentSequence = [];
  }

  static fromEvent(event) {
    if (event.pointerType === 'mouse' || event.pointerType === 'touch') {
      // don't trust angle and pressure data. just send undefined, since it might default to a value like 0.5.
      return new Interaction(
        event.clientX,
        event.clientY,
        undefined,
        undefined,
        undefined,
        event.timeStamp,
        event.pointerId
      );
    }
    // this is a pen, probably. if angles aren't directly provided, calculate from tilt.
    return new Interaction(
      event.clientX,
      event.clientY,
      event.azimuthAngle ?? Interaction.tiltToAngle(event.tiltX, event.tiltY),
      event.altitudeAngle,
      event.pressure,
      event.timeStamp,
      event.pointerId
    );
  }

  static tiltToAngle(tiltX, tiltY) {
    // perpendicular
    if (tiltX === 0 && tiltY === 0) return undefined;
    if (tiltX === undefined || tiltY === undefined) return undefined;
  
    //converts to radians
    const radX = map(tiltX, -90, 90, -Math.PI/2, +Math.PI/2);
    const radY = map(tiltY, -90, 90, +Math.PI/2, -Math.PI/2);
  
    // from https://gist.github.com/k3a/2903719bb42b48c9198d20c2d6f73ac1
    const y =  Math.cos(radX) * Math.sin(radY); 
    const x = -Math.sin(radX) * -Math.cos(radY); 
    //const z = -Math.cos(radX) * -Math.cos(radY); 
    let azimuthRad = -Math.atan2(y, x);
  
    // to range 0 to 2xPI
    if (azimuthRad < 0) azimuthRad += Math.PI * 2;
    return azimuthRad;
  }

  static distance2d(interaction1, interaction2) {
    const dx = interaction2.x - interaction1.x;
    const dy = interaction2.y - interaction1.y;
    return Math.hypot(dx, dy);
  }

  constructor(x, y, azimuth, altitude, pressure, timeStamp, id) {
    this.x = x;
    this.y = y;
    this.azimuth = azimuth;
    this.altitude = altitude;
    this.pressure = pressure;
    this.timeStamp = timeStamp;
    this.id = id;
  }

  copy() {
    return new Interaction(
      this.x,
      this.y,
      this.azimuth,
      this.altitude,
      this.pressure,
      this.timeStamp
    );
  }

  addPaintingTransform() {
    const modifiedInteraction = this.copy();

    const positionFromCenter = {
      x: modifiedInteraction.x - Interaction.viewTransform.centerPos().x, 
      y: modifiedInteraction.y - Interaction.viewTransform.centerPos().y
    };
    const rotatedPosition = rotatePoint(positionFromCenter.x, positionFromCenter.y, -Interaction.viewTransform.rotation);
    const scaledPosition = {x: rotatedPosition.x / Interaction.viewTransform.scale, y: rotatedPosition.y / Interaction.viewTransform.scale};
    const fromPaintingCornerPosition = {x: scaledPosition.x + openPainting.width/2, y: scaledPosition.y + openPainting.height/2};

    modifiedInteraction.x = fromPaintingCornerPosition.x;
    modifiedInteraction.y = fromPaintingCornerPosition.y;
    return modifiedInteraction;
  }
}


// Main color representation in OKHSL. Converted to hex color using the helper file.
class HSLColor {

  static symmetricalNoise(seed) {
    return (noise(seed * 10000)) * 2 - 1
  }

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
    return okhsl_to_srgb(this.hue, this.saturation, this.lightness); // from conversion helpers file
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
   * @param {number} value - The new lightness value (between 0 and 1).
   */
  setLightness(value) {
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
    return new HSLColor(this.h, Math.min(this.s, 0.5), this.l * 0.7, this.a);
  }

  brighter() {
    return new HSLColor(this.h, this.s, Math.min(this.l + 0.2, 1), this.a);
  }

  varyComponents(seed, chaos = 0.5) {
    if (chaos === 0) return this;

    const lowCurve = (x) => (x * x * x) * 0.5;
    const highCurve = (x) => 1 - Math.pow(1 - x, 3);
    const customColorEasing = (value, chaos) => lerp(lowCurve(value), highCurve(value), chaos * chaos);

    // OLD
    //const easedRandomNoise = (value, chaos) => ((1-chaos)*value**3) / 8 + lerp(value**3, value, 0.5)*chaos;

    // get [-1, 1] value from seed for each color parameter
    const lNoiseValue = HSLColor.symmetricalNoise(seed);
    const hNoiseValue = HSLColor.symmetricalNoise(seed*1.1);
    const sNoiseValue = HSLColor.symmetricalNoise(seed*0.9);

    // each can max vary by +-0.5
    this.l += 0.4 * customColorEasing(lNoiseValue, chaos*0.6);
    this.h += 0.5 * customColorEasing(hNoiseValue, chaos*lerp(0.9, 0.6, easeOutCubic(this.s)));
    this.s += 0.4 * customColorEasing(sNoiseValue, chaos*0.5);
    // make sure the components are still in range
    this.l = Math.max(0, Math.min(1, this.l));
    this.s = Math.max(0, Math.min(1, this.s));

    return this;
  }

  get hex() {
    const rgbArray = this.#toRGBArray();
    const rgbHexString = rgb_to_hex(rgbArray[0], rgbArray[1], rgbArray[2]); // from conversion helpers file
    return rgbHexString + this.#alphaToHex(); 
  }

  get hue() {
    return this.h;
    // if (value < 0) return 1 + (value % 1);
    // if (value > 1) return value % 1;
  }
  get saturation() {
    return this.s;
  }
  get lightness() {
    return this.l;
  }

  toHexWithSetAlpha(a) {
    const rgbArray = this.#toRGBArray();
    const rgbHexString = rgb_to_hex(rgbArray[0], rgbArray[1], rgbArray[2]); // from conversion helpers file
    return rgbHexString + this.#alphaToHex(a); 
  }
}

// This class is really just for namespacing and contains some general constants for the interface as well as methods to draw everything.
// Buttons etc. are drawn entirely with canvas, not in HTML/CSS for extra control.
class UI {

  // constants
  static GIZMO_SIZE = 120; 
  static MOBILE_WIDTH_BREAKPOINT = 576;

  static ELEMENT_MARGIN = 4;
  static ELEMENT_RADIUS = 16;

  static BUTTON_WIDTH = 80;
  static BUTTON_HEIGHT = 60;
  static SLIDER_WIDTH = 200 + UI.ELEMENT_MARGIN * 2;

  // state
  static showingHelp = false;
  static buffer = undefined; // from createGraphics in setup()
  static palette = {
    bg: undefined,
    fg: undefined,
    fgDisabled: undefined,
    constrastBg: undefined,
    onBrush: undefined,
    warning: undefined
  };

  static redrawInterface() {
    // reset
    UI.buffer.clear();
    UI.buffer.textFont(FONT_MEDIUM);
    UI.buffer.textAlign(LEFT, CENTER);
    UI.buffer.textSize(16);
    UI.buffer.noStroke();
  
    // Interface Colors
    UI.palette.bg = openPainting.canvasColor.behind();
    UI.palette.fg = UI.palette.bg.copy()
      .setLightness(lerp(openPainting.canvasColor.lightness, (openPainting.canvasColor.lightness>0.5) ? 0 : 1, 0.8)); 
    UI.palette.fgDisabled = UI.palette.fg.copy().setAlpha(0.4);
    UI.palette.constrastBg = UI.palette.fg.copy()
      .setLightness(lerp(openPainting.canvasColor.lightness, openPainting.canvasColor.lightness > 0.5 ? 1 : 0, 0.7)); 
    UI.palette.onBrush = openPainting.currentBrush.color.copy()
      .setLightness(lerp(openPainting.currentBrush.color.lightness, (openPainting.currentBrush.color.lightness>0.5) ? 0:1, 0.7))
      .setSaturation(openPainting.currentBrush.color.saturation * 0.5);
    UI.palette.warning = new HSLColor(0.1, 0.8, (UI.palette.fg.lightness > 0.5) ? 0.7 : 0.4);
    
    // MENUS
    // when clover open
    if (Interaction.currentUI === Interaction.UI_STATES.clover_open) {
      // tool buttons on left
      PRESET_TOOLS.forEach((preset, index) => {
        const x = 0;
        const y = UI.BUTTON_HEIGHT * index + 2 * UI.BUTTON_WIDTH; // lower by two button widths
        UI.displayTool(preset.tool, preset.texture, x, y, preset.menuName);
      });

      // menu on right
      UI.drawRightButton("fill all", UI.BUTTON_HEIGHT * 0 + 2*UI.BUTTON_WIDTH, UI.palette.warning);
    }
  
    // top menu buttons
    UI.buffer.textAlign(CENTER);
    UI.buffer.textFont(FONT_MEDIUM);
  
    const noEditableStrokes = (openPainting.editableStrokesCount === 0);
    UI.drawButton("undo" ,       UI.BUTTON_WIDTH*0, 0, Interaction.TYPES.button.undo , noEditableStrokes ? UI.palette.fgDisabled : UI.palette.fg);
    UI.drawButton("edit" ,       UI.BUTTON_WIDTH*1, 0, Interaction.TYPES.button.edit , Interaction.editingLastStroke || noEditableStrokes ? UI.palette.fgDisabled : UI.palette.fg);
    UI.drawButton("clear", width-UI.BUTTON_WIDTH*2, 0, Interaction.TYPES.button.clear, noEditableStrokes ? UI.palette.fgDisabled : UI.palette.warning);
    UI.drawButton("save" , width-UI.BUTTON_WIDTH*1, 0, Interaction.TYPES.button.save , UI.palette.fg);

    if (width > UI.MOBILE_WIDTH_BREAKPOINT) {
      UI.drawButton("help" , width-UI.BUTTON_WIDTH, height-UI.BUTTON_HEIGHT, Interaction.TYPES.button.help, UI.showingHelp ? UI.palette.fgDisabled : UI.palette.fg);
    }
    
    UI.buffer.textAlign(LEFT);
    UI.buffer.textFont(FONT_MEDIUM);
  
    // draw the sliders and knobs at the top
    const sliderStart = width/2 - UI.SLIDER_WIDTH * 1.5;
    if (Interaction.middleUIVisible) {

      // bg
      UI.buffer.fill(UI.palette.constrastBg.hex);
      UI.buffer.rect(sliderStart-60, 0,  UI.SLIDER_WIDTH * 3 + 120, UI.BUTTON_HEIGHT, UI.ELEMENT_RADIUS + UI.ELEMENT_MARGIN);

      // show current pressure
      let pressureForSizeIndicator = undefined;
      if (Interaction.currentSequence.length > 0 && Interaction.isAlreadyDown) {
        const last_interaction = Interaction.currentSequence[Interaction.currentSequence.length-1];
        if (last_interaction.pressure !== undefined) {
          pressureForSizeIndicator = last_interaction.pressure;
        }
      } else if (openPainting.averagePressure !== undefined) {
        pressureForSizeIndicator = openPainting.averagePressure;
      }

      // draw the size knob
      UI.buffer.drawingContext.save();
      UI.buffer.fill(UI.palette.fg.toHexWithSetAlpha(0.2));
      UI.buffer.rect(sliderStart - 60 + UI.ELEMENT_MARGIN, UI.ELEMENT_MARGIN, 60 - UI.ELEMENT_MARGIN*2, UI.BUTTON_HEIGHT - UI.ELEMENT_MARGIN*2, UI.ELEMENT_RADIUS);
      UI.buffer.drawingContext.clip();
      UI.drawSizeIndicator(sliderStart - 30, UI.BUTTON_HEIGHT / 2, pressureForSizeIndicator);
      UI.buffer.drawingContext.restore();
      // outline
      UI.buffer.noFill();
      UI.buffer.strokeWeight(1);
      UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
      UI.buffer.rect(sliderStart - 60 + UI.ELEMENT_MARGIN, UI.ELEMENT_MARGIN, 60 - UI.ELEMENT_MARGIN*2, UI.BUTTON_HEIGHT - UI.ELEMENT_MARGIN*2, UI.ELEMENT_RADIUS);
      UI.buffer.noStroke();

      // show average pressure
      const indicatorSize = openPainting.brushSettingsToAdjust.finalPxSizeWithPressure(openPainting.averagePressure);

      // circle overlay
      UI.buffer.noFill();
      UI.buffer.strokeWeight(4);
      UI.buffer.stroke(UI.palette.constrastBg.toHexWithSetAlpha(0.2));
      UI.buffer.ellipse(sliderStart - 30, UI.BUTTON_HEIGHT / 2, indicatorSize-2, indicatorSize-2);
      UI.buffer.strokeWeight(2);
      UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.5));
      UI.buffer.ellipse(sliderStart - 30, UI.BUTTON_HEIGHT / 2, indicatorSize, indicatorSize);
      UI.buffer.noStroke();

      // sliders
      let baseColor = openPainting.brushSettingsToAdjust.color;
      const rotatedBaseHue = (baseColor.hue+openPainting.hueRotation) % 1;
      const correctlyFlippedSaturation = (openPainting.hueRotation === 0) ? (1 + baseColor.saturation)/2 : (1 - baseColor.saturation)/2;
      UI.drawGradientSlider(sliderStart                  , 0, UI.SLIDER_WIDTH, UI.BUTTON_HEIGHT, baseColor.copy().setLightness(0), baseColor.copy().setLightness(1), baseColor.lightness);
      UI.drawGradientSlider(sliderStart+UI.SLIDER_WIDTH  , 0, UI.SLIDER_WIDTH, UI.BUTTON_HEIGHT, baseColor.copy().setSaturation(0), baseColor.copy().setSaturation(1), correctlyFlippedSaturation, "double");
      UI.drawGradientSlider(sliderStart+UI.SLIDER_WIDTH*2, 0, UI.SLIDER_WIDTH, UI.BUTTON_HEIGHT, baseColor.copy().setHue(0+openPainting.hueRotation), baseColor.copy().setHue(1+openPainting.hueRotation), rotatedBaseHue, "wrap");
  
      // show tooltip
      const relevantElements = [...Object.values(Interaction.TYPES.knob),...Object.values(Interaction.TYPES.slider)];
      // display the hover for whichever slider is currently interacted with. If none, show regular hover state.
      const currentElement = relevantElements.includes(Interaction.currentType) ? Interaction.currentType : Interaction.typeAtCurrentElement;

      if (currentElement === Interaction.TYPES.slider.lightness) {

        const x = sliderStart + baseColor.lightness * UI.SLIDER_WIDTH;
        const text = "L " + Math.floor(baseColor.lightness * 100) + "%";
        UI.drawTooltipBelow(x, UI.BUTTON_HEIGHT, text);

      } else if (currentElement === Interaction.TYPES.slider.saturation) {

        const horizontalOfSlider = (openPainting.hueRotation === 0) ? (1 + baseColor.saturation)/2 : (1 - baseColor.saturation)/2;
        const x = sliderStart + horizontalOfSlider * UI.SLIDER_WIDTH + UI.SLIDER_WIDTH;
        const text = "S " + ((openPainting.hueRotation === 0) ? "" : "-") +  Math.floor(baseColor.saturation * 100) + "%";
        UI.drawTooltipBelow(x, UI.BUTTON_HEIGHT, text);


      } if (currentElement === Interaction.TYPES.slider.hue) {

        const horizontalOfSlider = (baseColor.hue+openPainting.hueRotation) % 1;
        const x = sliderStart + horizontalOfSlider * UI.SLIDER_WIDTH + UI.SLIDER_WIDTH * 2;
        const text = "H " + Math.floor(baseColor.hue * 360) + "°";
        UI.drawTooltipBelow(x, UI.BUTTON_HEIGHT, text);

      } else if (currentElement === Interaction.TYPES.knob.jitter) {

        UI.drawTooltipBelow(sliderStart + UI.SLIDER_WIDTH*3+30, UI.BUTTON_HEIGHT, Math.round(openPainting.brushSettingsToAdjust.colorVar * 100) + "%");

      } else if (currentElement === Interaction.TYPES.knob.size) {

        UI.drawTooltipBelow(sliderStart - 30, UI.BUTTON_HEIGHT, Math.round(openPainting.brushSettingsToAdjust.pxSize) + "px");

      }
      

      // draw the variation knob
      UI.buffer.drawingContext.save();
      UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(0.5));
      UI.buffer.rect(sliderStart + UI.SLIDER_WIDTH*3 + UI.ELEMENT_MARGIN, UI.ELEMENT_MARGIN, 60 - UI.ELEMENT_MARGIN*2, UI.BUTTON_HEIGHT - UI.ELEMENT_MARGIN*2, UI.ELEMENT_RADIUS);
      UI.buffer.drawingContext.clip();
      UI.drawVariedColorCircle(openPainting.brushSettingsToAdjust, 80, sliderStart + UI.SLIDER_WIDTH*3 + 30, UI.BUTTON_HEIGHT / 2);
      UI.buffer.drawingContext.restore();
      // outline
      UI.buffer.noFill();
      UI.buffer.strokeWeight(1);
      UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
      UI.buffer.rect(sliderStart + UI.SLIDER_WIDTH*3 + UI.ELEMENT_MARGIN, UI.ELEMENT_MARGIN, 60 - UI.ELEMENT_MARGIN*2, UI.BUTTON_HEIGHT - UI.ELEMENT_MARGIN*2, UI.ELEMENT_RADIUS);
      UI.buffer.noStroke();
    }

    if (Interaction.currentUI === Interaction.UI_STATES.clover_open) {
      UI.drawPalette(openPainting.previousBrushes, width/2, UI.BUTTON_HEIGHT + 10, 30, 10);
    }
  
    // bottom left/ top middle text
    UI.buffer.textAlign(LEFT);

    if (UI.showingHelp) {
      UI.buffer.fill(UI.palette.bg.hex);
      UI.buffer.stroke(UI.palette.constrastBg.hex);
      const helpShortcuts = {
        "H ": "Toggle shortcuts help",
        "1 ": "Lightness and Saturation",
        "2 ": "Hue and Variation",
        "3 ": "Brush size",
        "4 ": "Eyedropper",
        "U ": "Undo last",
        "E ": "Edit last",
        "S ": "Save image",
        "R ": "Reset view",
        "F ": "Flip hue",
        "Click to toggle menu": "",
        "Scroll to zoom": "",
        "Shift + scroll to rotate": ""
      }
      const helpWindowWidth = 240;
      const helpWindowHeight = 30 * Object.keys(helpShortcuts).length;
      UI.buffer.rect(width - helpWindowWidth - UI.ELEMENT_MARGIN*3, height - UI.BUTTON_HEIGHT - helpWindowHeight - UI.ELEMENT_MARGIN*3, 
        helpWindowWidth + UI.ELEMENT_MARGIN*2, helpWindowHeight + UI.ELEMENT_MARGIN*2, UI.ELEMENT_RADIUS);
      UI.buffer.fill(UI.palette.fg.hex);
      Object.keys(helpShortcuts).forEach((keyString, index) => {
        UI.buffer.text(keyString, width - helpWindowWidth, 4 + height - UI.BUTTON_HEIGHT - helpWindowHeight + index * 30);
        UI.buffer.text(helpShortcuts[keyString], width - helpWindowWidth + 20, 4 + height - UI.BUTTON_HEIGHT - helpWindowHeight + index * 30);
      });
    }
  
    // draw rectangle around stroke being edited
    if (Interaction.editingLastStroke) {
      UI.drawBounds(openPainting.latestStroke.bounds);
    }
  
    // draw the right gadget
    if (Interaction.currentUI !== Interaction.UI_STATES.nothing_open) {
      UI.drawCurrentGizmo();
    }
    
    // DEV STUFF, WIP
    if (dev_mode) {
      UI.buffer.strokeWeight(2);
      UI.buffer.fill(UI.palette.fg.hex)
      UI.buffer.textAlign(LEFT);
      UI.buffer.text('ui: '         + (Interaction.currentUI ?? 'none'),              20,  80);
      UI.buffer.text('gesture: '    + (Interaction.currentType ?? 'none'),            20, 100);
      UI.buffer.text('points: '     + (Interaction.currentSequence.length ?? 'none'), 20, 120);
      UI.buffer.text('on ui: '      + (Interaction.typeAtCurrentElement ?? 'none'),   20, 140);
      UI.buffer.text('zoom: '       + (Interaction.viewTransform.scale ?? 'none'),    20, 160);
      UI.buffer.text('rotation: '   + (Interaction.viewTransform.rotation ?? 'none'), 20, 180);
      //UI.buffer.text('fps: '        + Math.round(frameRate()) + ", " + frameCount,    20, 180);

      UI.buffer.text('scaleX: '+ Math.round(Interaction.viewTransform.scale * openPainting.width),  300, 80);
      UI.buffer.text('scaleY: '+ Math.round(Interaction.viewTransform.scale * openPainting.height), 300,100);
      UI.buffer.text('posX: '+ Interaction.viewTransform.centerPos().x, 300, 120);
      UI.buffer.text('posY: '+ Interaction.viewTransform.centerPos().y, 300, 140);
    
      if (Interaction.lastInteractionEnd !== null) {
        UI.buffer.stroke(new HSLColor(0.1, 1, 1.0).hex);
        UI.buffer.push();
        UI.buffer.translate(Interaction.lastInteractionEnd.x, Interaction.lastInteractionEnd.y);
        UI.buffer.line(-6, -6, 6,  6);
        UI.buffer.line(-6,  6, 6, -6);
        UI.buffer.pop();
      }
      
      UI.buffer.strokeWeight(2);
      Interaction.currentSequence.forEach((point) => {
        
        UI.buffer.stroke(new HSLColor(0.1, 1, 1.0).hex);
        UI.buffer.rect(point.x, point.y, 2, 2)
        UI.buffer.fill(new HSLColor(0.1, 1, 0.4).hex);
        UI.buffer.noStroke()
        UI.buffer.rect(point.x, point.y, 2, 2)
      })
    }
  
    // hover indicator
    if (Interaction.currentType === Interaction.TYPES.painting.hover 
      && Interaction.currentSequence.length > 1
      && !Interaction.editingLastStroke
      && Interaction.currentUI === Interaction.UI_STATES.nothing_open) {
      
      UI.drawHoverDisplay()
    }
  }

  static drawHoverDisplay() {
    const startInteraction = Interaction.currentSequence[Interaction.currentSequence.length-2];
    const endInteraction = Interaction.currentSequence[Interaction.currentSequence.length-1];

    const start = new BrushPoint(startInteraction.x, startInteraction.y, startInteraction.angle);
    const end = new BrushPoint(endInteraction.x, endInteraction.y, endInteraction.angle);

    new Brushstroke(UI.buffer, openPainting.currentBrush.copy()).drawPart(start, end);
  }

  static displayTool(menuBrushTool, menuTexture, x, y, menuName) {
    
    const settings = openPainting.brushSettingsToAdjust.copy();
    settings.size = constrain(settings.size, 0.1, 0.3);
    settings.tool = menuBrushTool;
    settings.texture = menuTexture;
    const isSelected = (openPainting.currentBrush.tool === settings.tool && openPainting.currentBrush.texture === settings.texture);

    UI.buffer.push();
    UI.buffer.translate(x, y);

    UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(isSelected ? 0.2 : 1));
    UI.buffer.rect(0, UI.ELEMENT_MARGIN, 100, UI.BUTTON_HEIGHT-UI.ELEMENT_MARGIN*2, 0, UI.ELEMENT_RADIUS, UI.ELEMENT_RADIUS, 0);

    // draw example
    // wip, not sure why the angle 86 even makes sense.
    const start = new BrushPoint(-20, 30, 86, undefined);
    const end = new BrushPoint(80, 30, 86, undefined);
    
    new Brushstroke(UI.buffer, settings).drawPart(start, end);

    UI.buffer.noStroke();
    UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(isSelected ? 0.8 : 0.3));
    UI.buffer.rect(0, UI.ELEMENT_MARGIN, 100, UI.BUTTON_HEIGHT-UI.ELEMENT_MARGIN*2, 0, UI.ELEMENT_RADIUS, UI.ELEMENT_RADIUS, 0);

    UI.buffer.textAlign(CENTER);
    UI.buffer.fill(isSelected ? UI.palette.fgDisabled.hex : UI.palette.fg.hex);
    UI.buffer.text(menuName, 40, 30-4);
    UI.buffer.textFont(FONT_MEDIUM);
    
  
    UI.buffer.pop();

    UI.buffer.textAlign(LEFT);
  }

  static drawRightButton(text, y, textColor) {
    UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(0.5));
    UI.buffer.rect(
      width - 100, y+UI.ELEMENT_MARGIN, 
      100, UI.BUTTON_HEIGHT-UI.ELEMENT_MARGIN*2, 
      UI.ELEMENT_RADIUS, 0, 0, UI.ELEMENT_RADIUS
    );
    UI.buffer.fill(textColor.hex);
    UI.buffer.textAlign(CENTER);
    UI.buffer.text(text, width - 100, y, 100, UI.BUTTON_HEIGHT - 8);
    UI.buffer.textAlign(LEFT);
  }

  static drawButton(text, x, y, type, textColor) {
    const isHover = (type === Interaction.typeAtCurrentElement);
    const bgColor = UI.palette.constrastBg
    UI.buffer.fill(isHover ? bgColor.brighter().toHexWithSetAlpha(0.5) : bgColor.toHexWithSetAlpha(0.5));
    UI.buffer.rect(
      x+UI.ELEMENT_MARGIN, y+UI.ELEMENT_MARGIN, 
      UI.BUTTON_WIDTH-UI.ELEMENT_MARGIN*2, UI.BUTTON_HEIGHT-UI.ELEMENT_MARGIN*2, 
      UI.ELEMENT_RADIUS,
    );
    UI.buffer.fill(textColor.hex);
    UI.buffer.text(text, x, y, UI.BUTTON_WIDTH, UI.BUTTON_HEIGHT - 8);
  }

  static drawPalette(settingsArray, x, y, tileWidth, tileHeight) {
    
    if (settingsArray.length <= 1) return;
    const totalWidth = tileWidth * settingsArray.length;
    const topLeft = {
      x: x - totalWidth / 2,
      y: y
    }

    UI.buffer.drawingContext.save();
    UI.buffer.rect(topLeft.x, topLeft.y, totalWidth, tileHeight, UI.ELEMENT_RADIUS);
    UI.buffer.drawingContext.clip();

    settingsArray.forEach((setting, index) => {
      UI.buffer.fill(setting.color.hex);
      UI.buffer.rect(topLeft.x + index * tileWidth, topLeft.y, tileWidth, tileHeight);
    });

    UI.buffer.drawingContext.restore();
  }

  static drawVariedColorCircle(brush, size, x, y) {
    UI.buffer.push();
    UI.buffer.translate(x, y);
    const intensityAngle = brush.colorVar * Math.PI * 2;
    if (intensityAngle !== undefined) UI.buffer.rotate(intensityAngle);

    UI.buffer.fill(brush.color.hex);
    UI.buffer.ellipse(0, 0, size);

    const varSegments = 48;
    for (let i = 0; i < varSegments; i++) {
      const start = (TWO_PI / varSegments) * i;
      const stop = start + TWO_PI / varSegments; 
      UI.buffer.fill(brush.getColorWithVar(i).hex);
      UI.buffer.arc(0, 0, size, size, start, stop);
    }

    // if (size > 50) {
    //   //UI.buffer.rotate(Math.PI * 2 * -0.4);
    //   UI.buffer.noFill();
    //   UI.buffer.stroke(UI.palette.onBrush.toHexWithSetAlpha(0.6));
    //   UI.buffer.strokeWeight(size/4);
    //   UI.buffer.arc(0, 0, size*0.8, size*0.8, -intensityAngle-Math.PI*0.5, -Math.PI*0.5);
    // }

    UI.buffer.pop();
  }

  static drawSizeIndicator(x, y, pressure) {
    UI.buffer.push();
    UI.buffer.translate(x, y);
    //UI.buffer.rotate(-Math.PI * 0.25);

    // draw example
    // not sure why the angle 86 even makes sense.
    const start = new BrushPoint(-40, 0, 86, pressure);
    const end = new BrushPoint(40, 0, 86, pressure);
    new Brushstroke(UI.buffer, openPainting.brushSettingsToAdjust).drawPart(start, end);
    
    UI.buffer.pop();
  }

  static drawColorAxis(thickness, xStart, yStart, xEnd, yEnd, startColor, endColor, radius, startVar = 0, endVar = 0) {
    UI.buffer.strokeWeight(thickness);

    // round end caps first
    UI.buffer.stroke(startColor.hex);
    UI.buffer.line(xStart, yStart, (xStart+xEnd)/2, (yStart+yEnd)/2);
    UI.buffer.stroke(endColor.hex);
    UI.buffer.line((xStart+xEnd)/2, (yStart+yEnd)/2, xEnd, yEnd);

    UI.buffer.strokeCap(SQUARE);
    const segments = Math.floor(radius);
    let lastX = xStart;
    let lastY = yStart;
    for (let i = 1; i < segments + 1; i++) {
      const toX = lerp(xStart, xEnd, i / segments);
      const toY = lerp(yStart, yEnd, i / segments);
      const colorLerpAmt = (i - 0.5) / segments;
      const lerpedVar = lerp(startVar, endVar, colorLerpAmt);
      const lerpedColor = HSLColor.lerpColorInHSL(startColor, endColor, colorLerpAmt).varyComponents(i, lerpedVar);
      
      UI.buffer.stroke(lerpedColor.hex);
      UI.buffer.line(lastX, lastY, toX, toY);
  
      lastX = toX;
      lastY = toY;
    }
    UI.buffer.strokeCap(ROUND);
  }

  static drawSliderChange(x, y, w, h, start, end, componentBefore, componentAfter, componentName, sliderType) {
    //UI.drawGradientSlider(x, y, w, h/6, start, end, componentBefore, gradientType);
    UI.drawTooltipBelow(x + componentAfter * w, h, componentName, sliderType);
  }

  static drawGradientSlider(x, y, width, height, startColor, endColor, sliderPercent, sliderType) {

    width -= UI.ELEMENT_MARGIN * 2;
    height -= UI.ELEMENT_MARGIN * 2;
    x += UI.ELEMENT_MARGIN;
    y += UI.ELEMENT_MARGIN;

    if (sliderPercent !== 1) sliderPercent = sliderPercent % 1;

    UI.buffer.drawingContext.save();
    UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(0.5));
    UI.buffer.rect(x, y, width, height, UI.ELEMENT_RADIUS);
    UI.buffer.drawingContext.clip();
      
    const segments = width / 2;

    if (sliderType === "double") {
      for (let i = 0; i < segments; i++) {
        const colorLerpAmt = ((i + 0.5) / segments) * 2 - 1;
        const lerpedColor = ((colorLerpAmt * (openPainting.hueRotation === 0 ? 1 : -1)) > 0) 
          ? HSLColor.lerpColorInHSL(startColor, endColor, Math.abs(colorLerpAmt))
          : HSLColor.lerpColorInHSL(startColor.copy().setHue((startColor.hue + 0.5) % 1), endColor.copy().setHue((endColor.hue + 0.5) % 1), Math.abs(colorLerpAmt));

        UI.buffer.fill(lerpedColor.hex);
        UI.buffer.rect(x + (i/segments) * width, y, width/segments, height);
      }  
    } else {
      for (let i = 0; i < segments; i++) {
        const colorLerpAmt = (i + 0.5) / segments;
        const lerpedColor = HSLColor.lerpColorInHSL(startColor, endColor, colorLerpAmt);
    
        UI.buffer.fill(lerpedColor.hex);
        UI.buffer.rect(x + (i/segments) * width, y, width/segments, height);
      }  
    }

    // circle
    UI.buffer.noFill();

    UI.buffer.strokeWeight(4);
    UI.buffer.stroke(new HSLColor(0,0,0,0.8).hex);
    UI.buffer.ellipse(x + width * sliderPercent, y + height / 2, 32, 32);
    UI.buffer.strokeWeight(2);
    UI.buffer.stroke(new HSLColor(0,0,1,0.8).hex);
    UI.buffer.ellipse(x + width * sliderPercent, y + height / 2, 30, 30);

    if (sliderType === "wrap") {
      const wrapPos = x + width * sliderPercent + (sliderPercent < 0.5 ? width : - width);
      UI.buffer.strokeWeight(4);
      UI.buffer.stroke(new HSLColor(0,0,0,0.8).hex);
      UI.buffer.ellipse(wrapPos, y + height / 2, 32, 32);
      UI.buffer.strokeWeight(2);
      UI.buffer.stroke(new HSLColor(0,0,1,0.8).hex);
      UI.buffer.ellipse(wrapPos, y + height / 2, 30, 30);
    }

    UI.buffer.drawingContext.restore();

    UI.buffer.strokeWeight(1);
    UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
    UI.buffer.rect(x, y, width, height, UI.ELEMENT_RADIUS);
    UI.buffer.noStroke();
  }

  static drawTooltipBelow(x, y, text) {
    UI.buffer.textAlign(CENTER);
    const textPos = {
      x: x,
      y: y + 14
    }
    let bbox = FONT_MEDIUM.textBounds(text, textPos.x, textPos.y);
    UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(0.5));
    UI.buffer.rect(bbox.x - bbox.w/2 - 13, bbox.y + bbox.h/2 - 4, bbox.w+26, bbox.h+12, UI.ELEMENT_RADIUS);
    UI.buffer.fill(UI.palette.fg.hex);
    UI.buffer.text(text, textPos.x, textPos.y);
  }

  static drawCurrentGizmo() {
  
    if (Interaction.currentUI === Interaction.UI_STATES.eyedropper_open) {

      if (Interaction.currentSequence.length === 0) return;

      UI.buffer.fill(openPainting.currentBrush.color.hex);
      const position = Interaction.currentSequence[Interaction.currentSequence.length-1];
      const size = UI.GIZMO_SIZE*0.3;

      // when actually eyedropping
      if (Interaction.currentType === Interaction.TYPES.painting.eyedropper) {
        UI.drawVariedColorCircle(openPainting.currentBrush, size, position.x, position.y - size*1.2);
      }
      
      UI.drawCrosshair(size * 0.5, position.x, position.y);

    }

    // draw the brush setting gadgets
    const basePosition = Interaction.lastInteractionEnd;

    if (basePosition === undefined) return;

    const brushToVisualize = openPainting.brushSettingsToAdjust;

    UI.buffer.noStroke();
    UI.buffer.fill(brushToVisualize.color.hex);

    const sideDist = UI.GIZMO_SIZE; //(Math.max(width, height) > 4* gadgetRadius) ? gadgetRadius : gadgetRadius*0.5;
    const ankerX = constrain(basePosition.x, sideDist, width - sideDist);
    const ankerY = constrain(basePosition.y, sideDist, height - sideDist);

    if (Interaction.currentUI === Interaction.UI_STATES.clover_open) {

      const outerSize = 140;

      // draw background shape
      //const gradient = UI.buffer.drawingContext.createRadialGradient(basePosition.x, basePosition.y, 0, basePosition.x, basePosition.y, outerSize/2);
      //gradient.addColorStop(0.95, UI.palette.constrastBg.hex); //center
      //gradient.addColorStop(1, 'transparent'); //edge

      UI.buffer.drawingContext.save();
      //UI.buffer.drawingContext.fillStyle = gradient;
      UI.buffer.fill(UI.palette.constrastBg.hex);
      UI.buffer.ellipse(basePosition.x, basePosition.y, outerSize, outerSize);
      UI.buffer.drawingContext.clip();
      UI.buffer.strokeWeight(1);
      UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
      UI.buffer.line(basePosition.x - outerSize/2, basePosition.y - outerSize/2, basePosition.x + outerSize/2, basePosition.y + outerSize/2);
      UI.buffer.line(basePosition.x - outerSize/2, basePosition.y + outerSize/2, basePosition.x + outerSize/2, basePosition.y - outerSize/2);
      UI.buffer.noStroke();
      UI.buffer.drawingContext.restore();

      UI.buffer.drawingContext.save();
      UI.buffer.drawingContext.beginPath();
      UI.buffer.drawingContext.arc(basePosition.x, basePosition.y, 10, 0, 2 * Math.PI);
      UI.buffer.drawingContext.clip();
      UI.buffer.drawingContext.clearRect(0, 0, width, height);
      UI.buffer.drawingContext.restore();



      function drawGadgetDirection(x, y, xDir, yDir, isActive, text) {
        const size = 54;
        const centerOffset = 40;

        // if (isActive) {
        //   UI.buffer.fill(UI.palette.fg.hex);
        //   UI.buffer.ellipse(x+centerOffset*xDir, y+centerOffset*yDir, size, size);
        //   UI.buffer.fill(UI.palette.constrastBg.hex);
        // } else {
        //   UI.buffer.fill(UI.palette.constrastBg.hex);
        //   UI.buffer.ellipse(x+centerOffset*xDir, y+centerOffset*yDir, size, size);
        //   UI.buffer.fill(UI.palette.fg.hex);
        // }

        const posX = x+centerOffset*xDir;
        const posY = y+centerOffset*yDir;
        // icons or text
        if (text === "H") {
          UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
          UI.buffer.strokeWeight(8);
          UI.buffer.line(posX, posY - size/3, posX, posY + size/3);
          UI.drawColorAxis(6, posX, posY - size/3, posX, posY + size/3, brushToVisualize.color, brushToVisualize.color, size, 1.0, 0.0);

          UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
          UI.buffer.strokeWeight(8);
          UI.buffer.line(posX - size/3, posY, posX + size/3, posY);
          const startColorHue = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue - 0.5); 
          const endColorHue   = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue + 0.5);
          UI.drawColorAxis(6, posX - size/3, posY, posX + size/3, posY, startColorHue, endColorHue, size);

        } else if (text === "LC") {
          UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
          UI.buffer.strokeWeight(8);
          UI.buffer.line(posX, posY - size/3, posX, posY + size/3);
          const startColorSat = brushToVisualize.color.copy().setSaturation(0);
          const endColorSat   = brushToVisualize.color.copy().setSaturation(1);
          UI.drawColorAxis(6, posX - size/3, posY, posX + size/3, posY, startColorSat, endColorSat, size);
          
          UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
          UI.buffer.strokeWeight(8);
          UI.buffer.line(posX - size/3, posY, posX + size/3, posY);
          const startColorLum = brushToVisualize.color.copy().setLightness(1);
          const endColorLum   = brushToVisualize.color.copy().setLightness(0);
          UI.drawColorAxis(6, posX, posY - size/3, posX, posY + size/3, startColorLum, endColorLum, size);

        } else if (text === "S") {

          UI.buffer.noStroke();
          UI.buffer.fill(UI.palette.fg.toHexWithSetAlpha(0.7));
          UI.buffer.ellipse(posX, posY - (size/3) * 0.8, size/6, size/6);
          UI.buffer.ellipse(posX, posY + (size/3) * 0.8, size/9, size/9);

        } else if (text === "I") {
          
          UI.buffer.strokeWeight(4);
          UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.7));
          UI.buffer.line(posX, posY - size/3, posX, posY - (size/3) * 0.6);
          UI.buffer.line(posX, posY + size/3, posX, posY + (size/3) * 0.6);
          UI.buffer.line(posX - size/3, posY, posX - (size/3) * 0.6, posY);
          UI.buffer.line(posX + size/3, posY, posX + (size/3) * 0.6, posY);

        } 

        UI.buffer.noStroke();
        UI.buffer.fill(brushToVisualize.color.hex);
        UI.buffer.ellipse(posX, posY, size/5, size/5);
      }

      // WIP: the false means none of these will be highlighted.
      // hover state and default behavior could be re-added...
      drawGadgetDirection(basePosition.x, basePosition.y, -1,  0, false, "S");
      drawGadgetDirection(basePosition.x, basePosition.y,  1,  0, false, "H");
      drawGadgetDirection(basePosition.x, basePosition.y,  0, -1, false, "I");
      drawGadgetDirection(basePosition.x, basePosition.y,  0,  1, false, "LC");
    
    } else if (Interaction.currentUI === Interaction.UI_STATES.hueAndVar_open) {

      const radius = UI.GIZMO_SIZE;
      UI.buffer.push();
      UI.buffer.translate(ankerX, ankerY);

      UI.buffer.fill("black")
      UI.buffer.ellipse(0, 0, constrain(brushToVisualize.pxSize, 8, UI.GIZMO_SIZE/3)+2)

      // var
      UI.buffer.stroke("black");
      UI.buffer.strokeWeight(16);
      UI.buffer.line(0, radius*2 * (brushToVisualize.colorVar - 1), 0, radius*2 * brushToVisualize.colorVar);
      UI.drawColorAxis(14, 0, radius*2 * (brushToVisualize.colorVar - 1), 0, radius*2 * brushToVisualize.colorVar, brushToVisualize.color, brushToVisualize.color, UI.GIZMO_SIZE, 1.0, 0.0);

      // hue
      // stay centered since hue is a circle anyway
      UI.buffer.stroke("black");
      UI.buffer.strokeWeight(16);
      UI.buffer.line(radius*2 * -0.5, 0, radius*2 * (1-0.5), 0);

      const startColorHue = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue - 0.5); 
      const endColorHue   = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue + 0.5);
      UI.drawColorAxis(14, radius*2 * -0.5, 0, radius*2 * (1-0.5), 0, startColorHue, endColorHue, UI.GIZMO_SIZE);

      UI.buffer.pop();

      // Show color at reference position
      //const currentColorSize = constrain(brushToVisualize.pxSize, 8, gadgetRadius/3);
      UI.drawVariedColorCircle(brushToVisualize, 40, ankerX, ankerY);

    } else if (Interaction.currentUI === Interaction.UI_STATES.satAndLum_open) {

      const radius = UI.GIZMO_SIZE;
      UI.buffer.push();
      UI.buffer.translate(ankerX, ankerY);

      UI.buffer.fill("black")
      UI.buffer.ellipse(0, 0, constrain(brushToVisualize.pxSize, 8, UI.GIZMO_SIZE/3)+2)

      const startColorLum = brushToVisualize.color.copy().setLightness(1);
      const endColorLum   = brushToVisualize.color.copy().setLightness(0);
      UI.buffer.stroke("black");
      UI.buffer.strokeWeight(16);
      UI.buffer.line(0, radius*2 * (-1 + brushToVisualize.color.lightness), 0, radius*2 * brushToVisualize.color.lightness);
      UI.drawColorAxis(14, 0, radius*2 * (-1 + brushToVisualize.color.lightness), 0, radius*2 * brushToVisualize.color.lightness, startColorLum, endColorLum, UI.GIZMO_SIZE);

      const startColorSat = brushToVisualize.color.copy().setSaturation(0);
      const endColorSat   = brushToVisualize.color.copy().setSaturation(1);
      UI.buffer.stroke("black");
      UI.buffer.strokeWeight(16);
      UI.buffer.line(radius*2 * -brushToVisualize.color.saturation, 0, radius*2 * (1-brushToVisualize.color.saturation), 0);
      UI.drawColorAxis(14, radius*2 * -brushToVisualize.color.saturation, 0, radius*2 * (1-brushToVisualize.color.saturation), 0, startColorSat, endColorSat, UI.GIZMO_SIZE);
      
      UI.buffer.pop();

      UI.drawVariedColorCircle(brushToVisualize, 40, ankerX, ankerY);

    } else if (Interaction.currentUI === Interaction.UI_STATES.size_open) {

      const posX = ankerX;
      const posY = ankerY - UI.GIZMO_SIZE;
      const lineAddY = UI.GIZMO_SIZE * 2 * brushToVisualize.size;
      const lineTranslateY = posY + lineAddY;

      UI.buffer.stroke(UI.palette.constrastBg.toHexWithSetAlpha(0.3));
      UI.buffer.strokeWeight(12);
      UI.buffer.line(posX, lineTranslateY - UI.GIZMO_SIZE,posX, lineTranslateY + UI.GIZMO_SIZE);
      UI.buffer.strokeWeight(10);
      UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.3));
      UI.buffer.line(posX, lineTranslateY - UI.GIZMO_SIZE,posX, lineTranslateY + UI.GIZMO_SIZE);
      UI.buffer.noStroke();

      const indicatorSize = brushToVisualize.finalPxSizeWithPressure(openPainting.averagePressure);

      UI.buffer.fill(brushToVisualize.color.toHexWithSetAlpha(0.5));
      UI.buffer.ellipse(posX, ankerY, indicatorSize);
      UI.buffer.fill(brushToVisualize.color.hex);
      UI.drawCrosshair(indicatorSize, posX, ankerY);
    }
  }

  static drawCrosshair(size, x, y) {
    const expand_size = Math.min(25, size * 0.4);

    //shadow ver
    UI.buffer.strokeWeight(4);
    UI.buffer.stroke(UI.palette.constrastBg.hex);
    UI.buffer.line(x, y - size*0.5, x, y - size*0.5 - expand_size);
    UI.buffer.line(x, y + size*0.5, x, y + size*0.5 + expand_size);
    UI.buffer.line(x - size*0.5, y, x - size*0.5 - expand_size, y);
    UI.buffer.line(x + size*0.5, y, x + size*0.5 + expand_size, y);

    // draw the crosshair
    UI.buffer.strokeWeight(2);
    UI.buffer.stroke(UI.palette.fg.hex);
    UI.buffer.line(x, y - size*0.5, x, y - size*0.5 - expand_size);
    UI.buffer.line(x, y + size*0.5, x, y + size*0.5 + expand_size);
    UI.buffer.line(x - size*0.5, y, x - size*0.5 - expand_size, y);
    UI.buffer.line(x + size*0.5, y, x + size*0.5 + expand_size, y);
  
    // reset
    UI.buffer.strokeWeight(6);
    UI.buffer.noStroke();
  }

  static screenToViewTransform() {
    // WIP. consider that this could be done by actually changing the coords, not using scale.
    // then these UI elements would stay crisp and lines equally sized on screen.
    UI.buffer.translate(Interaction.viewTransform.centerPos().x, Interaction.viewTransform.centerPos().y);
    UI.buffer.scale(Interaction.viewTransform.scale)
    UI.buffer.rotate(Interaction.viewTransform.rotation)
    UI.buffer.translate(-openPainting.width/2, -openPainting.height/2);
  }

  static drawBounds(bounds) {
    if (bounds.width === 0 || bounds.height === 0) return;

    const topLeft = {x: bounds.x, y: bounds.y};
    const botRight = {x: bounds.x + bounds.width, y: bounds.y + bounds.height};

    UI.buffer.push();
    UI.screenToViewTransform();
    UI.buffer.stroke(UI.palette.constrastBg.hex);
    UI.buffer.strokeWeight(3);
    UI.buffer.line(topLeft.x, topLeft.y, botRight.x, topLeft.y);
    UI.buffer.line(topLeft.x, topLeft.y, topLeft.x, botRight.y);
    UI.buffer.line(topLeft.x, botRight.y, botRight.x, botRight.y);
    UI.buffer.line(botRight.x, topLeft.y, botRight.x, botRight.y);
    UI.buffer.stroke(UI.palette.fg.hex);
    UI.buffer.strokeWeight(1);
    UI.buffer.line(topLeft.x, topLeft.y, botRight.x, topLeft.y);
    UI.buffer.line(topLeft.x, topLeft.y, topLeft.x, botRight.y);
    UI.buffer.line(topLeft.x, botRight.y, botRight.x, botRight.y);
    UI.buffer.line(botRight.x, topLeft.y, botRight.x, botRight.y);
    UI.buffer.strokeWeight(6);
    UI.buffer.noStroke();

    UI.buffer.pop();
  }
}


// math utils
const pointsToAngle = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
const averageAngle = (first, second) => Math.atan2(Math.sin(first)+Math.sin(second), Math.cos(first)+Math.cos(second));
const rotatePoint = (x, y, angle) => ({
  x: x * Math.cos(angle) - y * Math.sin(angle),
  y: x * Math.sin(angle) + y * Math.cos(angle)
});
const easeInCirc = (x) => 1 - Math.sqrt(1 - Math.pow(x, 2));
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const xorshift = (seed) => {
  seed ^= (seed << 21);
  seed ^= (seed >>> 35);
  seed ^= (seed << 4);
  return seed;
}
