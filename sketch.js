// init in setup()
let openPainting = undefined;

// constants
const GIZMO_SIZE = 120; 
const MOBILE_WIDTH_BREAKPOINT = 576;

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
    x: Math.round(smaller_side*0.9),
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

  // draw the painting buffers
  drawCenteredCanvas(openPainting.oldStrokesBuffer);
  openPainting.usedEditableStrokes.forEach((stroke) => {
    drawCenteredCanvas(stroke.buffer);
  });

  // draw the new UI to the buffer, then show on top of the screen
  UI.redrawInterface(); 
  image(UI.buffer, 0, 0);


  function drawCenteredCanvas(buffer) {
    if (Interaction.viewTransform.scale === 1) {
      image(buffer, Interaction.viewTransform.flooredCornerX(), Interaction.viewTransform.flooredCornerY());
      return;
    }
    const scaledSize = {
      x: Math.round(Interaction.viewTransform.scale * openPainting.width),
      y: Math.round(Interaction.viewTransform.scale * openPainting.height)
    };
    image(buffer, Interaction.viewTransform.flooredCornerX(), Interaction.viewTransform.flooredCornerY(), 
      scaledSize.x, scaledSize.y
    );
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

  getColorWithVar(seed) {
    return this.color.copy().varyComponents(seed, this.colorVar);
  }
}


class BrushStrokePoint {
  /**
   * Creates an instance of BrushStrokePoint.
   * @param {number} x The x coordinate of the point.
   * @param {number} y The y coordinate of the point.
   * @param {number|undefined} azimuth The angle of the pen at this point.
   * @param {number|undefined} pressure The pen pressure detected at this point.
   */
  constructor(x, y, azimuth, pressure) {
    this.x = x;
    this.y = y;
    this.azimuth = azimuth;
    this.pressure = pressure;
    this.seed = x * 2 + y * 3;
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
  constructor(buffer, settings) {
    this.buffer = buffer;
    this.points = [];
    this.settings = settings.copy();
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
    this.points.push(new BrushStrokePoint(point.x,  point.y,  point.azimuth, point.pressure));
  }

  movePoints(xDelta, yDelta) {
    if (xDelta === 0 && yDelta === 0) return;
    this.points.forEach((point) => point.move(xDelta, yDelta));
  }

  reset() {
    this.buffer.clear();
    this.points = [];
    this.settings = undefined;
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
   * @param {BrushStrokePoint} start The first point of the stroke segment.
   * @param {BrushStrokePoint} end The second point of the stroke segment.
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

      end.pressure ??= start.pressure;
      end.pressure ??= 0.5;
    start.pressure ??= 0.5;
    const avgPressure = (start.pressure + end.pressure) / 2;

    this.buffer.noStroke();

    const brushSize = this.settings.pxSize * (this.settings.texture === "Round" ? 0.7 : 1);
    const strips = Math.floor(map(brushSize, 10, 300, 10, 200) * (this.settings.texture === "Round" ? 0.3 : 1));

    for (let i = 0; i < strips; i++) {

      const drawThisStrip = (this.settings.texture !== "Rake" || i % 3 == 0 || i == strips-1)

      if (drawThisStrip) {
        const lowerSide = i/strips - 0.5;
        const higherSide = (i+1)/strips - 0.5;
    
        const rf = 0.1 * brushSize * map(avgPressure, 0, 1, 0.1, 2.0, true) * this.settings.colorVar; // randomness matches increasing variation

        const lerpPart = HSLColor.pseudoRandomSymmetricNumber(i) * 0.5 + 0.5;
        const middleX = lerp(start.x, end.x, lerpPart);
        const middleY = lerp(start.y, end.y, lerpPart);

        const startEdgeVectorLower  = p5.Vector.fromAngle(start.azimuth, lowerSide*brushSize*map(start.pressure, 0, 1, 0.1, 2.0, true));
        const startEdgeVectorHigher = p5.Vector.fromAngle(start.azimuth, higherSide*brushSize*map(start.pressure, 0, 1, 0.1, 2.0, true));

        const endEdgeVectorLower    = p5.Vector.fromAngle(end.azimuth, lowerSide*brushSize*map(end.pressure, 0, 1, 0.1, 2.0, true));
        const endEdgeVectorHigher   = p5.Vector.fromAngle(end.azimuth, higherSide*brushSize*map(end.pressure, 0, 1, 0.1, 2.0, true));

        const averageDirection = atan2(sin(start.azimuth)+sin(end.azimuth), cos(start.azimuth)+cos(end.azimuth));

        const midEdgeVectorLower    = p5.Vector.fromAngle(averageDirection, lowerSide*brushSize*map(avgPressure, 0, 1, 0.1, 2.0, true));
        const midEdgeVectorHigher   = p5.Vector.fromAngle(averageDirection, higherSide*brushSize*map(avgPressure, 0, 1, 0.1, 2.0, true));

        if (HSLColor.pseudoRandomSymmetricNumber(start.seed + i) < start.pressure * 4) {
          const brushCol = this.settings.getColorWithVar(i + start.seed);

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
            this.buffer.beginShape();
            randomizedVertex(this.buffer, start.x, startEdgeVectorLower.x , start.y, startEdgeVectorLower.y , i, rf);
            randomizedVertex(this.buffer, start.x, startEdgeVectorHigher.x, start.y, startEdgeVectorHigher.y, i, rf);
            randomizedVertex(this.buffer, middleX, midEdgeVectorHigher.x,   middleY, midEdgeVectorHigher.y,   i, rf);
            randomizedVertex(this.buffer, middleX, midEdgeVectorLower.x,    middleY, midEdgeVectorLower.y,    i, rf);
            this.buffer.endShape();
          }
        }

        if (HSLColor.pseudoRandomSymmetricNumber(end.seed + i) < end.pressure * 4) {
          const brushCol2 = this.settings.getColorWithVar(i + end.seed);

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
            this.buffer.beginShape();
            randomizedVertex(this.buffer, middleX, midEdgeVectorLower.x , middleY, midEdgeVectorLower.y , i, rf);
            randomizedVertex(this.buffer, middleX, midEdgeVectorHigher.x, middleY, midEdgeVectorHigher.y, i, rf);
            randomizedVertex(this.buffer, end.x  , endEdgeVectorHigher.x, end.y  , endEdgeVectorHigher.y, i, rf);
            randomizedVertex(this.buffer, end.x  , endEdgeVectorLower.x , end.y  , endEdgeVectorLower.y , i, rf);
            this.buffer.endShape();
          }
        }
      }
    }

    function randomizedVertex(buffer, x, xOff, y, yOff, randomI, randomFactor) {
      buffer.vertex(
        x + xOff + HSLColor.pseudoRandomSymmetricNumber(x+y*2+randomI) * randomFactor, 
        y + yOff + HSLColor.pseudoRandomSymmetricNumber(x*2+y+randomI) * randomFactor
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
   * @param {BrushSettings} startingBrush The initial brush settings.
   */
  constructor(width, height, backgroundColor, startingBrush) {
    this.width = width;
    this.height = height;
    this.mainBuffer = createGraphics(width, height);
    this.editableStrokesInUse = 0;
    this.editableStrokes = Array.from({ length: 16 }, () => new BrushStroke(createGraphics(width, height), startingBrush));
    this.currentBrush = startingBrush;
    this.previousBrushes = [];
    this.canvasColor = backgroundColor;
    this.hueRotation = 0;

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
      pressure: newInteraction.pressure
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
    panX: 0,
    panY: 0,
    flooredCornerX: () => Math.floor(Interaction.viewTransform.panX + width /2 - (Math.round(openPainting.width*Interaction.viewTransform.scale))/2),
    flooredCornerY: () => Math.floor(Interaction.viewTransform.panY + height/2 - (Math.round(openPainting.height*Interaction.viewTransform.scale))/2)
  };

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
  static currentType = null;
  static currentSequence = [];
  static lastInteractionEnd = null;

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
      help: 'helpButton'
    },
    knob: {
      jitter: 'jitterKnob',
      size: 'sizeKnob'
    },
    slider: {
      hue: 'hueSlider',
      saturation: 'saturationSlider',
      luminance: 'luminanceSlider'
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

    const zoomFactor = Math.pow(1.002, -event.deltaY);

    Interaction.zoomTo(new_interaction.x, new_interaction.y, zoomFactor);
  }

  static zoomTo(screenX, screenY, factor) {

    // do the zoom
    Interaction.viewTransform.scale *= factor;

    // reset all if the zoom was too far out
    if (Interaction.viewTransform.scale < 0.3) {
      Interaction.viewTransform.scale = 1;
      Interaction.viewTransform.panX = 0;
      Interaction.viewTransform.panY = 0;
      return;
    }

    // add offset - subtract zoom position, scale, then add again.
    const screenXfromCenter = screenX - width / 2;
    const screenYfromCenter = screenY - height / 2;
    Interaction.viewTransform.panX = (Interaction.viewTransform.panX - screenXfromCenter) * factor + screenXfromCenter;
    Interaction.viewTransform.panY = (Interaction.viewTransform.panY - screenYfromCenter) * factor + screenYfromCenter;
  }

  static keyStart(key) {
    console.log("pressed " + key);

    //Interaction.clearAction();
    if (key === "r") {
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
    }
  }

  static resetCurrentSequence() {
    Interaction.currentType = null;
    if (Interaction.currentSequence.length > 0) {
      Interaction.lastInteractionEnd = Interaction.currentSequence[Interaction.currentSequence.length-1];
    } else {
      console.log("no current point, so nothing to keep")
    }
    Interaction.currentSequence = [];
  }

  static keyEnd(key) {
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
    const prevCanvasColor = openPainting.canvasColor.copy();
    openPainting.canvasColor = openPainting.currentBrush.color.copy();
    openPainting.currentBrush.color = prevCanvasColor.copy();

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
  }

  static wasSurfaceType(x, y) {
    if (y < 60) {
      const button_width = 80;
      const middle_width = 720;

      if (x < button_width) {
        // first button
        return Interaction.TYPES.button.undo;

      } else if (x < button_width * 2) {
        // second button
        return Interaction.TYPES.button.edit;

      } else if (x > width - button_width) {
        // rightmost button
        return Interaction.TYPES.button.save;

      } else if (x > width - button_width*2) {
        // second to last
        return Interaction.TYPES.button.clear;

      } else if (Interaction.middleUIVisible) {

        const xInMiddleSection = x - width/2 + middle_width/2;
        if (xInMiddleSection > 0) {

          if (xInMiddleSection < 60) {
            //var
            return Interaction.TYPES.knob.size;

          } else if (xInMiddleSection < 260) {
            // luminance
            return Interaction.TYPES.slider.luminance;

          } else if (xInMiddleSection < 460) {
            // luminance
            return Interaction.TYPES.slider.saturation;

          } else if (xInMiddleSection < 660) {
            // hue
            return Interaction.TYPES.slider.hue;

          } else if (xInMiddleSection < 720) {
            // size
            return Interaction.TYPES.knob.jitter;

          }
        }
      }
    }

    if (x < 80 && Interaction.currentUI === Interaction.UI_STATES.clover_open) {
      const toolsY = y - height/2 + (PRESET_TOOLS.length * 60)/2;
      const toolIndex = Math.floor(toolsY / 60);

      if (toolIndex === 0) {
        return Interaction.TYPES.button.tool0;
      } else if (toolIndex === 1) {
        return Interaction.TYPES.button.tool1;
      } else if (toolIndex === 2) {
        return Interaction.TYPES.button.tool2;
      }
    }

    if (x > width - UI.BUTTON_WIDTH && y > height - 60 && width > MOBILE_WIDTH_BREAKPOINT) {
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
      }
      return;
    }

    // tapped menu buttons
    const surfaceType = Interaction.wasSurfaceType(new_interaction.x, new_interaction.y) ?? null;
    // when no second pointer was already down
    if (surfaceType !== null && !Interaction.isAlreadyDown) {

      Interaction.currentType = surfaceType;
      if (Object.values(Interaction.TYPES.knob).includes(Interaction.currentType)) {
        // started on a knob
        Interaction.addToBrushHistory();
        Interaction.currentSequence = [new_interaction];
      } else if (Object.values(Interaction.TYPES.slider).includes(Interaction.currentType)) {
        // started on a slider
        // WIP, this should already lead to a color change since it does not rely on delta!
        Interaction.addToBrushHistory();
        Interaction.currentSequence = [new_interaction];
        Interaction.currentUI = Interaction.UI_STATES.nothing_open;
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

      // get distance and average of the points.
      const previousDistance = Interaction.distance2d(Interaction.currentSequence[0], Interaction.currentSequence[1]);
      const previousAverage = {
        x: (Interaction.currentSequence[0].x + Interaction.currentSequence[1].x) / 2,
        y: (Interaction.currentSequence[0].y + Interaction.currentSequence[1].y) / 2,
      }

      // update the points.
      // replace a point
      if (Interaction.currentSequence[0].id === event.pointerId) {
        Interaction.currentSequence[0] = new_interaction;
      } else if (Interaction.currentSequence[1].id === event.pointerId) {
        Interaction.currentSequence[1] = new_interaction;
      } else {
        console.log("could not find a point that corredsponds to one of the zoom touches!")
        return;
      }

      // get distance and average of the new points.
      const newDistance = Interaction.distance2d(Interaction.currentSequence[0], Interaction.currentSequence[1]);
      const newAverage = {
        x: (Interaction.currentSequence[0].x + Interaction.currentSequence[1].x) / 2,
        y: (Interaction.currentSequence[0].y + Interaction.currentSequence[1].y) / 2,
      }

      // zoom on new center
      Interaction.zoomTo(newAverage.x, newAverage.y,  newDistance / previousDistance);
      // pan.
      Interaction.viewTransform.panX += newAverage.x - previousAverage.x;
      Interaction.viewTransform.panY += newAverage.y - previousAverage.y;
      return;
    }

    if (!event.isPrimary && event.pointerType === "touch") return;

    if (Object.values(Interaction.TYPES.button).includes(Interaction.currentType)) {

      // started on a button
      const surfaceType = Interaction.wasSurfaceType(new_interaction.x, new_interaction.y);
      if (surfaceType !== Interaction.currentType) {
        // if no longer on the button, reset 
        console.log("left the button")
        Interaction.currentType = null;
        Interaction.currentSequence = [new_interaction];
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
      const middle_width = 720;
      const xInMiddleSection = new_interaction.x - width/2 + middle_width/2;
      const brushToAdjust = openPainting.brushSettingsToAdjust;

      if (Interaction.currentType === Interaction.TYPES.slider.luminance) {
        const newValue = constrain((xInMiddleSection - 60) / 200, 0, 1);
        brushToAdjust.color.setLuminance(newValue);
      } else if (Interaction.currentType === Interaction.TYPES.slider.saturation) {
        const newValue = constrain((xInMiddleSection - 260) / 200, 0, 1)*2 - 1;
        if (newValue < 0 && openPainting.hueRotation === 0) {
          Interaction.rotateHueAction();
        } else if (newValue >= 0 && openPainting.hueRotation !== 0) {
          Interaction.rotateHueAction();
        }
        brushToAdjust.color.setSaturation(Math.abs(newValue));
      } else if (Interaction.currentType === Interaction.TYPES.slider.hue) {
        let newValue = (xInMiddleSection - 460) / 200;
        newValue += openPainting.hueRotation;
        if (newValue > 1) newValue %= 1;
        if (newValue < 0) newValue = 1-(Math.abs(newValue) % 1);
        brushToAdjust.color.setHue(newValue);
      }
      if (Interaction.editingLastStroke) openPainting.redrawLatestStroke();

    } else if (Interaction.currentType === null) {

      // default, because no pointer down or last interaction was cancelled.
      // if pointerMove happens in this state, it starts the hover interaction which leaves a trace behind

      // check if over a button
      const surfaceType = Interaction.wasSurfaceType(new_interaction.x, new_interaction.y) ?? null;
      if (surfaceType !== null) {
        return;
      }

      // start hover
      Interaction.currentType = Interaction.TYPES.painting.hover;
      if (Interaction.currentUI !== Interaction.UI_STATES.nothing_open) return; // no hover preview in menus anyway, so don't even record
      Interaction.currentSequence.push(new_interaction);

    } else if (Interaction.currentType === Interaction.TYPES.painting.hover) {

      // check if hover over a button
      const surfaceType = Interaction.wasSurfaceType(new_interaction.x, new_interaction.y) ?? null;
      if (surfaceType !== null) {
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
        x: new_interaction.x - last_interaction.x,
        y: new_interaction.y - last_interaction.y
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
      const rangeX = GIZMO_SIZE * 2;
      const rangeY = GIZMO_SIZE * 2;

      // Map to chroma and luminance
      brushToAdjust.color.setSaturation(map( deltaX + rangeX * brushToReference.color.saturation, 0, rangeX, 0, 1, true));
      brushToAdjust.color.setLuminance(map(-deltaY + rangeY * brushToReference.color.luminance, 0, rangeY, 0, 1, true));
      if (Interaction.editingLastStroke) openPainting.redrawLatestStroke();

    } else if (Interaction.currentType === Interaction.TYPES.gizmo.hueAndVar) { 

      Interaction.currentSequence[1] = new_interaction;
      const brushToAdjust = openPainting.brushSettingsToAdjust;
      const brushToReference = openPainting.previousBrush;

      const deltaX = Interaction.currentSequence[1].x - Interaction.currentSequence[0].x;
      const deltaY = Interaction.currentSequence[1].y - Interaction.currentSequence[0].y;
      const rangeX = GIZMO_SIZE * 2;
      const rangeY = GIZMO_SIZE * 2;

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
      const rangeY = GIZMO_SIZE * 2;
      
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

    if (Object.values(Interaction.TYPES.button).includes(Interaction.currentType)) {

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
      }if (Interaction.currentType === Interaction.TYPES.button.tool0) {
        Interaction.pickToolAction(0);
      } if (Interaction.currentType === Interaction.TYPES.button.tool1) {
        Interaction.pickToolAction(1);
      } if (Interaction.currentType === Interaction.TYPES.button.tool2) {
        Interaction.pickToolAction(2);
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
      console.log("just resetting since the pointerEnd had no specific interaction: it was of type " + Interaction.currentType);
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
    modifiedInteraction.x -= Interaction.viewTransform.flooredCornerX();
    modifiedInteraction.y -= Interaction.viewTransform.flooredCornerY();
    modifiedInteraction.x /= Interaction.viewTransform.scale;
    modifiedInteraction.y /= Interaction.viewTransform.scale;
    return modifiedInteraction;
  }
}


// Main color representation in OKHSL. Converted to hex color using the helper file.
class HSLColor {
  static RANDOM_VALUES = Array.from({ length: 1024 }, () => Math.random() * 2 - 1);

  // static RANDOM_VALUES = Array.from({ length: 1024 }, (_, index) => {
  //   const t = (index / (1024 - 1)) * 2 - 1; // Normalize index to the range [-1, 1]
  //   return Math.sin(t * Math.PI * 0.5); // Use sine function for smooth transition
  // });

  static pseudoRandomSymmetricNumber(seed) {
    const randomArray = this.RANDOM_VALUES;
    return randomArray[Math.floor(Math.abs(xorshift(1030*seed))) % randomArray.length];
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
    return okhsl_to_srgb(this.hue, this.saturation, this.luminance); // from conversion helpers file
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

  varyComponents(seed, chaos = 0.5) {
    if (chaos === 0) return this;

    const easedRandomNoise = (value, chaos) => ((1-chaos)*value**3) / 8 + lerp(value**3, value, 0.5)*chaos;

    // get random [-1, 1] value from seed for each color parameter
    const lNoiseValue = HSLColor.pseudoRandomSymmetricNumber(seed);
    const hNoiseValue = HSLColor.pseudoRandomSymmetricNumber(seed+1);
    const sNoiseValue = HSLColor.pseudoRandomSymmetricNumber(seed+2);

    // each could theoretically vary by +-0.5, but the chaos function never really goes that high.
    this.l += 0.5 * easedRandomNoise(lNoiseValue, chaos*0.8);
    this.h += 0.6 * easedRandomNoise(hNoiseValue, chaos*lerp(1.0, 0.7, easeOutCubic(this.s)));
    this.s += 0.5 * easedRandomNoise(sNoiseValue, chaos*0.5);
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
  get luminance() {
    return this.l;
  }

  toHexWithSetAlpha(a) {
    const rgbArray = this.#toRGBArray();
    const rgbHexString = rgb_to_hex(rgbArray[0], rgbArray[1], rgbArray[2]); // from conversion helpers file
    return rgbHexString + this.#alphaToHex(a); 
  }
}

// Drawn to a buffer every frame - anything on top of the painting.
// Buttons etc. are realized here, not in HTML/CSS for extra control.
class UI {

  static BUTTON_WIDTH = 80;
  static BUTTON_HEIGHT = 60;
  static ELEMENT_MARGIN = 4;
  static ELEMENT_RADIUS = 16;

  static showingHelp = false;
  static buffer = undefined;
  static palette = {};

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
      .setLuminance(lerp(openPainting.canvasColor.luminance, (openPainting.canvasColor.luminance>0.5) ? 0 : 1, 0.8)); 
    UI.palette.fgDisabled = UI.palette.fg.copy().setAlpha(0.4);
    UI.palette.constrastBg = UI.palette.fg.copy()
      .setLuminance(lerp(openPainting.canvasColor.luminance, openPainting.canvasColor.luminance > 0.5 ? 1 : 0, 0.7)); 
    UI.palette.onBrush = openPainting.currentBrush.color.copy()
      .setLuminance(lerp(openPainting.currentBrush.color.luminance, (openPainting.currentBrush.color.luminance>0.5) ? 0:1, 0.7))
      .setSaturation(openPainting.currentBrush.color.saturation * 0.5);
    
    // MENUS
    // brush menu
    if (Interaction.currentUI === Interaction.UI_STATES.clover_open) {
      PRESET_TOOLS.forEach((preset, index) => {
        const x = 0;
        const y = height/2 + UI.BUTTON_HEIGHT * (-PRESET_TOOLS.length*0.5 + index);
        UI.displayTool(preset.tool, preset.texture, x, y, preset.menuName);
      });
    }
  
    // top menu buttons
    UI.buffer.textAlign(CENTER);
    UI.buffer.textFont(FONT_MEDIUM);
  
    const noEditableStrokes = (openPainting.editableStrokesCount === 0);
    UI.drawButton("undo" ,       UI.BUTTON_WIDTH*0, 0, noEditableStrokes ? UI.palette.fgDisabled : UI.palette.fg);
    UI.drawButton("edit" ,       UI.BUTTON_WIDTH*1, 0, Interaction.editingLastStroke || noEditableStrokes ? UI.palette.fgDisabled : UI.palette.fg);
    UI.drawButton("clear", width-UI.BUTTON_WIDTH*2, 0, new HSLColor(0.1, 0.8, (UI.palette.fg.luminance > 0.5) ? 0.7 : 0.4));
    UI.drawButton("save" , width-UI.BUTTON_WIDTH*1, 0, UI.palette.fg);

    if (width > MOBILE_WIDTH_BREAKPOINT) {
      UI.drawButton("help" , width-UI.BUTTON_WIDTH, height-UI.BUTTON_HEIGHT, UI.showingHelp ? UI.palette.fgDisabled : UI.palette.fg);
    }
    
    UI.buffer.fill(UI.palette.fg.hex);
    UI.buffer.textAlign(LEFT);
    UI.buffer.textFont(FONT_MEDIUM);
  
    // draw the sliders at the top
    const sliderStart = width/2 - 300;
    if (Interaction.middleUIVisible) {
      let baseColor = openPainting.brushSettingsToAdjust.color;
      const rotatedBaseHue = (baseColor.hue+openPainting.hueRotation) % 1;
      const correctlyFlippedSaturation = (openPainting.hueRotation === 0) ? (1 + baseColor.saturation)/2 : (1 - baseColor.saturation)/2;
      UI.drawGradientSlider(sliderStart    , 0, 200, UI.BUTTON_HEIGHT, baseColor.copy().setLuminance(0), baseColor.copy().setLuminance(1), baseColor.luminance);
      UI.drawGradientSlider(sliderStart+200, 0, 200, UI.BUTTON_HEIGHT, baseColor.copy().setSaturation(0), baseColor.copy().setSaturation(1), correctlyFlippedSaturation, "double");
      UI.drawGradientSlider(sliderStart+400, 0, 200, UI.BUTTON_HEIGHT, baseColor.copy().setHue(0+openPainting.hueRotation), baseColor.copy().setHue(1+openPainting.hueRotation), rotatedBaseHue);
  
      // show difference
      const settingsChangeInteractions = [...Object.values(Interaction.TYPES.knob),...Object.values(Interaction.TYPES.slider)];
      if (settingsChangeInteractions.includes(Interaction.currentType) && openPainting.previousBrush !== undefined) {
        const prevColor = openPainting.previousBrush.color;
  
        if (Interaction.currentType === Interaction.TYPES.slider.luminance) {
          UI.drawSliderChange(
            sliderStart, 0, 200, UI.BUTTON_HEIGHT, 
            prevColor.copy().setLuminance(0), prevColor.copy().setLuminance(1), 
            prevColor.luminance, baseColor.luminance, 
            "L: " + Math.floor(baseColor.luminance * 100) + "%"
          );
        } else if (Interaction.currentType === Interaction.TYPES.slider.saturation) {
          UI.drawSliderChange(
            sliderStart + 200, 0, 200, UI.BUTTON_HEIGHT, 
            prevColor.copy().setSaturation(0), prevColor.copy().setSaturation(1), 
            prevColor.saturation, (openPainting.hueRotation === 0) ? (1 + baseColor.saturation)/2 : (1 - baseColor.saturation)/2,
            "S: " + ((openPainting.hueRotation === 0) ? "" : "-") +  Math.floor(baseColor.saturation * 100) + "%", "double"
          );
        } if (Interaction.currentType === Interaction.TYPES.slider.hue) {
          UI.drawSliderChange(
            sliderStart + 400, 0, 200, UI.BUTTON_HEIGHT, 
            prevColor.copy().setHue(0+openPainting.hueRotation), prevColor.copy().setHue(1+openPainting.hueRotation), 
            (prevColor.hue+openPainting.hueRotation) % 1, (baseColor.hue+openPainting.hueRotation) % 1, 
            "H:" + Math.floor(baseColor.hue * 360) + "°"
          );
        } else if (Interaction.currentType === Interaction.TYPES.knob.jitter) {
          UI.drawTooltipBelow(sliderStart + 630, UI.BUTTON_HEIGHT, Math.round(openPainting.currentBrush.colorVar * 100) + "%");
        } else if (Interaction.currentType === Interaction.TYPES.knob.size) {
          UI.drawTooltipBelow(sliderStart - 30, UI.BUTTON_HEIGHT, Math.round(openPainting.currentBrush.pxSize) + "px");
        }
      }
  
      // draw the variation indicator
      UI.buffer.drawingContext.save();
      UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(0.5));
      UI.buffer.rect(sliderStart + 600, 0, 60, UI.BUTTON_HEIGHT, UI.ELEMENT_RADIUS);
      UI.buffer.drawingContext.clip();
      UI.drawVariedColorCircle(openPainting.brushSettingsToAdjust, 80, sliderStart + 630, UI.BUTTON_HEIGHT / 2);
      UI.buffer.drawingContext.restore();
  
      // draw the size indicator
      UI.buffer.drawingContext.save();
      UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(0.5));
      UI.buffer.rect(sliderStart - 60, 0, 60, UI.BUTTON_HEIGHT, UI.ELEMENT_RADIUS);
      UI.buffer.drawingContext.clip();
      const indicatorSize = openPainting.brushSettingsToAdjust.pxSize; // WIP: * average pressure of max(0, end-10) in last brushstroke 
      UI.drawSizeIndicator(indicatorSize, sliderStart - 30, UI.BUTTON_HEIGHT / 2);
      UI.buffer.drawingContext.restore();
    }

    if (Interaction.currentUI === Interaction.UI_STATES.clover_open) {
      UI.drawPalette(openPainting.previousBrushes, width/2, UI.BUTTON_HEIGHT + 10, 30, 10);
    }
  
    // bottom left/ top middle text
    UI.buffer.textAlign(LEFT);

    if (UI.showingHelp) {
      UI.buffer.fill(UI.palette.fg.hex);
      const controlsInfo = "Keyboard: 1-[Value] 2-[Hue] 3-[Size] 4-[Eyedrop] U-[Undo] E-[Edit] S-[Save]";
      UI.buffer.text(controlsInfo, 20, height - 20 - 12);
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
    if (false) {
      UI.buffer.strokeWeight(2);
      UI.buffer.fill(UI.palette.fg.hex)
      UI.buffer.textAlign(LEFT);
      UI.buffer.text('ui: '         + (Interaction.currentUI ?? 'none'),              20,  80);
      UI.buffer.text('gesture: '    + (Interaction.currentType ?? 'none'),            20, 100);
      UI.buffer.text('points: '     + (Interaction.currentSequence.length ?? 'none'), 20, 120);
      UI.buffer.text('zoom: '       + (Interaction.viewTransform.scale ?? 'none'),    20, 140);
      UI.buffer.text('fps: '        + Math.round(frameRate()) + ", " + frameCount,    20, 160);

      UI.buffer.text('scaleX: '+ Math.round(Interaction.viewTransform.scale * openPainting.width),  300, 80);
      UI.buffer.text('scaleY: '+ Math.round(Interaction.viewTransform.scale * openPainting.height), 300,100);
      UI.buffer.text('posX: '+ Interaction.viewTransform.flooredCornerX(), 300, 120);
      UI.buffer.text('posY: '+ Interaction.viewTransform.flooredCornerY(), 300, 140);
    
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

    const start = new BrushStrokePoint(startInteraction.x, startInteraction.y, startInteraction.angle);
    const end = new BrushStrokePoint(endInteraction.x, endInteraction.y, endInteraction.angle);

    new BrushStroke(UI.buffer, openPainting.currentBrush.copy()).drawPart(start, end);
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
    UI.buffer.rect(0, UI.ELEMENT_MARGIN/2, 100, UI.BUTTON_HEIGHT-UI.ELEMENT_MARGIN, 0, UI.ELEMENT_RADIUS, UI.ELEMENT_RADIUS, 0);

    // draw example
    // wip, not sure why the angle 86 even makes sense.
    const start = new BrushStrokePoint(0, 30, 86, undefined);
    const end = new BrushStrokePoint(80, 30, 86, undefined);
    
    new BrushStroke(UI.buffer, settings).drawPart(start, end);

    UI.buffer.noStroke();
    UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(isSelected ? 0.8 : 0.3));
    UI.buffer.rect(0, UI.ELEMENT_MARGIN/2, 100, UI.BUTTON_HEIGHT-UI.ELEMENT_MARGIN, 0, UI.ELEMENT_RADIUS, UI.ELEMENT_RADIUS, 0);

    UI.buffer.textAlign(CENTER);
    UI.buffer.fill(isSelected ? UI.palette.fgDisabled.hex : UI.palette.fg.hex);
    UI.buffer.text(menuName, 40, 30-4);
    UI.buffer.textFont(FONT_MEDIUM);
    
  
    UI.buffer.pop();

    UI.buffer.textAlign(LEFT);
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

  static drawButton(text, x, y, textColor) {
    UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(0.5));
    UI.buffer.rect(
      x+UI.ELEMENT_MARGIN, y+UI.ELEMENT_MARGIN, 
      UI.BUTTON_WIDTH-UI.ELEMENT_MARGIN*2, UI.BUTTON_HEIGHT-UI.ELEMENT_MARGIN*2, 
      UI.ELEMENT_RADIUS,
    );
    UI.buffer.fill(textColor.hex);
    UI.buffer.text(text, x, y, UI.BUTTON_WIDTH, UI.BUTTON_HEIGHT - 8);
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
    UI.buffer.pop();
  }

  static drawSizeIndicator(size, x, y) {
    UI.buffer.fill(UI.palette.fg.toHexWithSetAlpha(0.4));
    UI.buffer.ellipse(x, y, size, size)
    UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(0.3));
    UI.buffer.ellipse(x, y, size*0.66, size*0.66)
    UI.buffer.ellipse(x, y, size*0.33, size*0.33)
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

  static drawSliderChange(x, y, w, h, start, end, componentBefore, componentAfter, componentName, gradientType) {
    //UI.drawGradientSlider(x, y, w, h/6, start, end, componentBefore, gradientType);
    UI.drawTooltipBelow(x + componentAfter * w, h, componentName, gradientType);
  }

  static drawGradientSlider(x, y, width, height, startColor, endColor, sliderPercent, gradientType) {
    UI.buffer.drawingContext.save();
    UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(0.5));
    UI.buffer.rect(x, y, width, height, UI.ELEMENT_RADIUS, UI.ELEMENT_RADIUS, UI.ELEMENT_RADIUS, UI.ELEMENT_RADIUS);
    UI.buffer.drawingContext.clip();
      
    const segments = width;

    if (gradientType === "double") {
      const currentSegment = Math.round(segments * (sliderPercent));

      for (let i = 0; i < segments; i++) {
        const colorLerpAmt = ((i + 0.5) / segments) * 2 - 1;
        const lerpedColor = ((colorLerpAmt * (openPainting.hueRotation === 0 ? 1 : -1)) > 0) 
          ? HSLColor.lerpColorInHSL(startColor, endColor, Math.abs(colorLerpAmt))
          : HSLColor.lerpColorInHSL(startColor.copy().setHue((startColor.hue + 0.5) % 1), endColor.copy().setHue((endColor.hue + 0.5) % 1), Math.abs(colorLerpAmt));
    
        UI.buffer.fill(lerpedColor.hex);
        UI.buffer.rect(x + (i/segments) * width, y, width/segments, height);
  
        if (i === currentSegment) {
          UI.buffer.fill(new HSLColor(0,0,1,0.8).hex);
          UI.buffer.rect(x + (i/segments) * width, y, width/segments, height);
        }
        if (i+1 === currentSegment) {
          UI.buffer.fill(new HSLColor(0,0,0,0.8).hex);
          UI.buffer.rect(x + (i/segments) * width, y, width/segments, height);
        }
      }  

    } else {
      const currentSegment = Math.round(segments * (sliderPercent % 1));

      for (let i = 0; i < segments; i++) {
        const colorLerpAmt = (i + 0.5) / segments;
        const lerpedColor = HSLColor.lerpColorInHSL(startColor, endColor, colorLerpAmt);
    
        UI.buffer.fill(lerpedColor.hex);
        UI.buffer.rect(x + (i/segments) * width, y, width/segments, height);
  
        if (i === currentSegment) {
          UI.buffer.fill(new HSLColor(0,0,1,0.8).hex);
          UI.buffer.rect(x + (i/segments) * width, y, width/segments, height);
        }
        if (i+1 === currentSegment) {
          UI.buffer.fill(new HSLColor(0,0,0,0.8).hex);
          UI.buffer.rect(x + (i/segments) * width, y, width/segments, height);
        }
      }  
    }
    
    UI.buffer.drawingContext.restore();
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

      // when actually eyedropping
      if (Interaction.currentType === Interaction.TYPES.painting.eyedropper) {
        UI.drawVariedColorCircle(openPainting.currentBrush, openPainting.currentBrush.pxSize, position.x, position.y);
      }
      
      UI.drawCrosshair(openPainting.currentBrush.pxSize, position.x, position.y);

    }

    // draw the brush setting gadgets
    const basePosition = Interaction.lastInteractionEnd;

    if (basePosition === undefined) return;

    const brushToVisualize = openPainting.brushSettingsToAdjust;

    UI.buffer.noStroke();
    UI.buffer.fill(brushToVisualize.color.hex);

    const sideDist = GIZMO_SIZE; //(Math.max(width, height) > 4* gadgetRadius) ? gadgetRadius : gadgetRadius*0.5;
    const ankerX = constrain(basePosition.x, sideDist, width - sideDist);
    const ankerY = constrain(basePosition.y, sideDist, height - sideDist);

    if (Interaction.currentUI === Interaction.UI_STATES.clover_open) {

      UI.buffer.textAlign(CENTER);
      UI.buffer.textStyle(BOLD);
      UI.buffer.noStroke();

      function drawGadgetDirection(x, y, xDir, yDir, isActive, text) {
        const size = 54;
        const centerOffset = 40;
        if (isActive) {
          UI.buffer.fill(UI.palette.fg.hex);
          UI.buffer.ellipse(x+centerOffset*xDir, y+centerOffset*yDir, size, size);
          UI.buffer.fill(UI.palette.constrastBg.hex);
        } else {
          UI.buffer.fill(UI.palette.constrastBg.hex);
          UI.buffer.ellipse(x+centerOffset*xDir, y+centerOffset*yDir, size, size);
          UI.buffer.fill(UI.palette.fg.hex);
        }
        

        const posX = x+centerOffset*xDir;
        const posY = y+centerOffset*yDir;
        // icons or text
        if (text === "H") {
          UI.drawColorAxis(6, posX, posY - size/3, posX, posY + size/3, brushToVisualize.color, brushToVisualize.color, size, 1.0, 0.0);

          const startColorHue = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue - 0.5); 
          const endColorHue   = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue + 0.5);
          UI.drawColorAxis(6, posX - size/3, posY, posX + size/3, posY, startColorHue, endColorHue, size);

        } else if (text === "LC") {
          const startColorSat = brushToVisualize.color.copy().setSaturation(0);
          const endColorSat   = brushToVisualize.color.copy().setSaturation(1);
          UI.drawColorAxis(6, posX - size/3, posY, posX + size/3, posY, startColorSat, endColorSat, size);
          
          const startColorLum = brushToVisualize.color.copy().setLuminance(1);
          const endColorLum   = brushToVisualize.color.copy().setLuminance(0);
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
        UI.buffer.ellipse(posX, posY, size/4, size/4);
      }

      // WIP: the false means none of these will be highlighted.
      // hover state and default behavior could be re-added...
      drawGadgetDirection(basePosition.x, basePosition.y, -1,  0, false, "S");
      drawGadgetDirection(basePosition.x, basePosition.y,  1,  0, false, "H");
      drawGadgetDirection(basePosition.x, basePosition.y,  0, -1, false, "I");
      drawGadgetDirection(basePosition.x, basePosition.y,  0,  1, false, "LC");
    
    } else if (Interaction.currentUI === Interaction.UI_STATES.hueAndVar_open) {

      const radius = GIZMO_SIZE;
      UI.buffer.push();
      UI.buffer.translate(ankerX, ankerY);

      UI.buffer.fill("black")
      UI.buffer.ellipse(0, 0, constrain(brushToVisualize.pxSize, 8, GIZMO_SIZE/3)+2)

      // var
      UI.buffer.stroke("black");
      UI.buffer.strokeWeight(16);
      UI.buffer.line(0, radius*2 * (brushToVisualize.colorVar - 1), 0, radius*2 * brushToVisualize.colorVar);
      UI.drawColorAxis(14, 0, radius*2 * (brushToVisualize.colorVar - 1), 0, radius*2 * brushToVisualize.colorVar, brushToVisualize.color, brushToVisualize.color, GIZMO_SIZE, 1.0, 0.0);

      // hue
      // stay centered since hue is a circle anyway
      UI.buffer.stroke("black");
      UI.buffer.strokeWeight(16);
      UI.buffer.line(radius*2 * -0.5, 0, radius*2 * (1-0.5), 0);

      const startColorHue = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue - 0.5); 
      const endColorHue   = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue + 0.5);
      UI.drawColorAxis(14, radius*2 * -0.5, 0, radius*2 * (1-0.5), 0, startColorHue, endColorHue, GIZMO_SIZE);

      UI.buffer.pop();

      // Show color at reference position
      //const currentColorSize = constrain(brushToVisualize.pxSize, 8, gadgetRadius/3);
      UI.drawVariedColorCircle(brushToVisualize, 40, ankerX, ankerY);

    } else if (Interaction.currentUI === Interaction.UI_STATES.satAndLum_open) {

      const radius = GIZMO_SIZE;
      UI.buffer.push();
      UI.buffer.translate(ankerX, ankerY);

      UI.buffer.fill("black")
      UI.buffer.ellipse(0, 0, constrain(brushToVisualize.pxSize, 8, GIZMO_SIZE/3)+2)

      const startColorLum = brushToVisualize.color.copy().setLuminance(1);
      const endColorLum   = brushToVisualize.color.copy().setLuminance(0);
      UI.buffer.stroke("black");
      UI.buffer.strokeWeight(16);
      UI.buffer.line(0, radius*2 * (-1 + brushToVisualize.color.luminance), 0, radius*2 * brushToVisualize.color.luminance);
      UI.drawColorAxis(14, 0, radius*2 * (-1 + brushToVisualize.color.luminance), 0, radius*2 * brushToVisualize.color.luminance, startColorLum, endColorLum, GIZMO_SIZE);

      const startColorSat = brushToVisualize.color.copy().setSaturation(0);
      const endColorSat   = brushToVisualize.color.copy().setSaturation(1);
      UI.buffer.stroke("black");
      UI.buffer.strokeWeight(16);
      UI.buffer.line(radius*2 * -brushToVisualize.color.saturation, 0, radius*2 * (1-brushToVisualize.color.saturation), 0);
      UI.drawColorAxis(14, radius*2 * -brushToVisualize.color.saturation, 0, radius*2 * (1-brushToVisualize.color.saturation), 0, startColorSat, endColorSat, GIZMO_SIZE);
      
      UI.buffer.pop();

      // Show color at reference position
      //const currentColorSize = constrain(brushToVisualize.pxSize, 8, gadgetRadius/3);
      UI.drawVariedColorCircle(brushToVisualize, 40, ankerX, ankerY);

    } else if (Interaction.currentUI === Interaction.UI_STATES.size_open) {

      const posX = ankerX;
      const posY = ankerY - GIZMO_SIZE;
      const lineAddY = GIZMO_SIZE * 2 * brushToVisualize.size;
      const lineTranslateY = posY + lineAddY;

      UI.buffer.stroke(UI.palette.constrastBg.toHexWithSetAlpha(0.3));
      UI.buffer.strokeWeight(12);
      UI.buffer.line(posX, lineTranslateY - GIZMO_SIZE,posX, lineTranslateY + GIZMO_SIZE);
      UI.buffer.strokeWeight(10);
      UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.3));
      UI.buffer.line(posX, lineTranslateY - GIZMO_SIZE,posX, lineTranslateY + GIZMO_SIZE);
      UI.buffer.noStroke();

      UI.buffer.fill(brushToVisualize.color.toHexWithSetAlpha(0.5));
      UI.buffer.ellipse(posX, ankerY, brushToVisualize.pxSize);
      UI.buffer.fill(brushToVisualize.color.hex);
      UI.drawCrosshair(brushToVisualize.pxSize, posX, ankerY);
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
    UI.buffer.translate(Interaction.viewTransform.flooredCornerX(), Interaction.viewTransform.flooredCornerY());
    UI.buffer.scale(Interaction.viewTransform.scale)
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
const easeInCirc = (x) => 1 - Math.sqrt(1 - Math.pow(x, 2));
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const xorshift = (seed) => {
  seed ^= (seed << 21);
  seed ^= (seed >>> 35);
  seed ^= (seed << 4);
  return seed;
}
