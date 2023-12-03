// defined in setup() once
let cnv;
let interfaceBuffer = undefined; // in setup()
let currentPainting = undefined; // in setup()

// initially set in setup()
let canvasColor = undefined;
let currentBrush = undefined;
let previousBrush = undefined;

let GIZMO_SIZE; // based on canvas size

// menu
let toolPresets = [
  {brush: "Brush Tool", texture: "Regular", menuName: "Default"},
  {brush: "Brush Tool", texture: "Rake",    menuName: "Rake" },
  {brush: "Brush Tool", texture: "Round",   menuName: "Round"},
];

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
    this.points.push(new BrushStrokePoint(point.x,  point.y,  point.azimuth, point.pressure));
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
    return Interaction.modifyLastStroke ? this.latestStroke.settings : currentBrush;
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

    // draw to the stroke buffer immediately
    // wip, some tools would be drawn in interface buffer instead and
    // only added fully when the pen is lifted.

    const lastPoint = this.latestStroke.points[this.latestStroke.points.length-2];
    const newPoint  = this.latestStroke.points[this.latestStroke.points.length-1];

    this.latestStroke.renderStrokePart(lastPoint, newPoint);
  }

  getPointRGB(point) {
    // update eyedropper
    currentPainting.applyAllStrokes();
    const buffer = currentPainting.oldStrokesBuffer;

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

  // WIP, just defaults. these should really adapt
  static viewTransform = {
    x: () => Math.floor((width - Math.round(currentPainting.width*Interaction.viewTransform.scale))/2),
    y: () => Math.floor((height - Math.round(currentPainting.height*Interaction.viewTransform.scale))/2),
    scale: 1
  };

  // temporary edit mode.
  // if true, sliders and gizmos etc. will modify the last stroke
  // rather than the brush settings for the upcoming one
  static modifyLastStroke = false;
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
      tool2: '2'
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

  static get isAlreadyDown() {
    return (Interaction.currentType !== null && Interaction.currentType !== Interaction.TYPES.painting.hover);
  }

  static get referencePosition() {
    return Interaction.lastInteractionEnd ?? Interaction.currentSequence[0];
  }

  static lostFocus() {
    Interaction.currentType = null;
    Interaction.currentSequence = [];
    Interaction.currentUI = Interaction.UI_STATES.nothing_open;
  }

  static wheelScrolled(event) {

    event.preventDefault();

    Interaction.viewTransform.scale += event.deltaY * -0.002;
    Interaction.viewTransform.scale = Math.min(Math.max(Interaction.viewTransform.scale, 0.1), 3.0);
  }

  static keyStart(key) {
    if (key === "c") {
      //Interaction.clearAction();
    } else if (key === "s") {
      Interaction.saveAction();
      Interaction.resetCurrentSequence();
    } else if (key === "u") {
      Interaction.undoAction();
      Interaction.resetCurrentSequence();
    } else if (key === "e") {
      Interaction.editAction();
      Interaction.resetCurrentSequence();
    } else if (key === "1") {
      previousBrush = currentBrush.copy();
      Interaction.currentUI = Interaction.UI_STATES.satAndLum_open;
      Interaction.resetCurrentSequence();
    } else if (key === "2") {
      previousBrush = currentBrush.copy();
      Interaction.currentUI = Interaction.UI_STATES.hueAndVar_open;
      Interaction.resetCurrentSequence();
    } else if (key === "3") {
      previousBrush = currentBrush.copy();
      Interaction.currentUI = Interaction.UI_STATES.size_open;
      Interaction.resetCurrentSequence();
    } else if (key === "4") {
      previousBrush = currentBrush.copy();
      Interaction.currentUI = Interaction.UI_STATES.eyedropper_open;
    }
  }

  static resetCurrentSequence() {
    Interaction.currentType = null;
    if (Interaction.currentSequence.length > 0) {
      Interaction.lastInteractionEnd = Interaction.currentSequence[Interaction.currentSequence.length-1];
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
      Interaction.modifyLastStroke = false;
    }

    Interaction.currentType = null;
    Interaction.currentSequence = [];
  }

  static saveAction() {
    // commit strokes to the painting
    currentPainting.applyAllStrokes();
    currentPainting.download();
  }

  static clearAction() {
    const prevCanvasColor = canvasColor.copy();
    canvasColor = currentBrush.color.copy();
    currentBrush.color = prevCanvasColor.copy();

    currentPainting.clearWithColor(canvasColor);
    document.body.style.backgroundColor = canvasColor.behind().hex;
  }

  static undoAction() {
    currentPainting.popLatestStroke();
    Interaction.modifyLastStroke = false;
  }

  static editAction() {
    Interaction.modifyLastStroke = !Interaction.modifyLastStroke;
    if (currentPainting.editableStrokesCount === 0) Interaction.modifyLastStroke = false;
  }

  static pickToolAction(index) {
    const modifyBrush = currentPainting.brushSettingsToAdjust;
    modifyBrush.tool = toolPresets[index].brush;
    modifyBrush.texture = toolPresets[index].texture;

    if (Interaction.modifyLastStroke) {
      currentPainting.redrawLatestStroke();
      Interaction.modifyLastStroke = false;
    }
    Interaction.currentUI = Interaction.UI_STATES.nothing_open;
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

      } else {

        const xInMiddleSection = x - width/2 + middle_width/2;
        if (xInMiddleSection > 0) {

          if (xInMiddleSection < 60) {
            //var
            return Interaction.TYPES.knob.jitter;

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
            return Interaction.TYPES.knob.size;

          }
        }
      }
    }

    if (x < 80 && Interaction.currentUI === Interaction.UI_STATES.clover_open) {
      const toolsY = y - height/2 + (toolPresets.length * 60)/2;
      const toolIndex = Math.floor(toolsY / 60);

      if (toolIndex === 0) {
        return Interaction.TYPES.button.tool0;
      } else if (toolIndex === 1) {
        return Interaction.TYPES.button.tool1;
      } else if (toolIndex === 2) {
        return Interaction.TYPES.button.tool2;
      }
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
        previousBrush = currentBrush.copy();
        Interaction.currentSequence = [new_interaction];
      } else if (Object.values(Interaction.TYPES.slider).includes(Interaction.currentType)) {
        // started on a slider
        previousBrush = currentBrush.copy();
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
      const previousDistance = Interaction.distance2d(Interaction.currentSequence[0], Interaction.currentSequence[1]);
      // replace a point
      if (Interaction.currentSequence[0].id === event.pointerId) {
        Interaction.currentSequence[0] = new_interaction;
      } else if (Interaction.currentSequence[1].id === event.pointerId) {
        Interaction.currentSequence[1] = new_interaction;
      } else {
        console.log("could not find a point that corredsponds to one of the zoom touches!")
        return;
      }
      const newDistance = Interaction.distance2d(Interaction.currentSequence[0], Interaction.currentSequence[1]);
      const distanceRatio = newDistance / previousDistance;
      Interaction.viewTransform.scale *= distanceRatio;
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
      }

    } else if (Object.values(Interaction.TYPES.knob).includes(Interaction.currentType)) {

      // started on a knob
      const deltaX = new_interaction.x - Interaction.currentSequence[0].x;

      if (deltaX === 0) return;
      const brushToAdjust = currentPainting.brushSettingsToAdjust;
      const deltaValue = deltaX * 0.002;
      if (Interaction.currentType === Interaction.TYPES.knob.jitter) {
        brushToAdjust.colorVar = constrain(previousBrush.colorVar + deltaValue, 0, 1);
      } else if (Interaction.currentType === Interaction.TYPES.knob.size) {
        brushToAdjust.size = constrain(previousBrush.size + deltaValue, 0, 1);
      }

    } else if (Object.values(Interaction.TYPES.slider).includes(Interaction.currentType)) {

      // started on a slider
      const middle_width = 720;
      let xInMiddleSection = new_interaction.x - width/2 + middle_width/2;
      const brushToAdjust = currentPainting.brushSettingsToAdjust;

      if (Interaction.currentType === Interaction.TYPES.slider.luminance) {
        const newValue = constrain((xInMiddleSection - 60) / 200, 0, 1);
        brushToAdjust.color.setLuminance(newValue);
      } else if (Interaction.currentType === Interaction.TYPES.slider.saturation) {
        const newValue = constrain((xInMiddleSection - 260) / 200, 0, 1);
        brushToAdjust.color.setSaturation(newValue);
      } else if (Interaction.currentType === Interaction.TYPES.slider.hue) {
        let newValue = (xInMiddleSection - 460) / 200;
        if (newValue > 1) newValue %= 1;
        if (newValue < 0) newValue = 1-(Math.abs(newValue) % 1);
        brushToAdjust.color.setHue(newValue);
      }

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
      Interaction.currentSequence.push(new_interaction);


    } else if (Interaction.currentType === Interaction.TYPES.painting.hover) {

      // check if hover over a button
      const surfaceType = Interaction.wasSurfaceType(new_interaction.x, new_interaction.y) ?? null;
      if (surfaceType !== null) {
        Interaction.currentType = null;
        Interaction.currentSequence = [];
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
          const basePosition = Interaction.referencePosition;
          const deltaPos = {
            x: new_interaction.x - basePosition.x,
            y: new_interaction.y - basePosition.y
          }

          if (Math.abs(deltaPos.x) > 10 || Math.abs(deltaPos.y) > 10) {
            if (Math.abs(deltaPos.x) > Math.abs(deltaPos.y)) {
              // horizontal
              if (deltaPos.x < 0) {
                // start size gizmo
                previousBrush = currentBrush.copy();
                Interaction.currentUI = Interaction.UI_STATES.size_open;
                Interaction.currentType = Interaction.TYPES.gizmo.size;
              } else {
                // start hue and var
                previousBrush = currentBrush.copy();
                Interaction.currentUI = Interaction.UI_STATES.hueAndVar_open;
                Interaction.currentType = Interaction.TYPES.gizmo.hueAndVar;
              }
            } else {
              // vertical
              if (deltaPos.y < 0) {
                // start eyedropper
                Interaction.currentType = Interaction.TYPES.painting.eyedropper;
                Interaction.currentUI = Interaction.UI_STATES.nothing_open;
              } else {
                // start lum and sat
                previousBrush = currentBrush.copy();
                Interaction.currentUI = Interaction.UI_STATES.satAndLum_open;
                Interaction.currentType = Interaction.TYPES.gizmo.satAndLum;
              }
            }  
          }

          // wip, clicks in middle should open the last used gizmo immediately?

        } else if (Interaction.modifyLastStroke) {
          // move brushstroke
          Interaction.currentType = Interaction.TYPES.painting.move;
          // WIP actually do something

        } else {
          // start brushstroke
          Interaction.currentType = Interaction.TYPES.painting.draw;
          currentPainting.startStroke();

          // draw the existing segments that have not been drawn yet all at once
          // this code isn't pretty but seems to works
          const segmentsToAddImmediately = [...Interaction.currentSequence, new_interaction];
          let lastIndex = 0;
          segmentsToAddImmediately.forEach((step, index) => {
            if (index > 0) {
              const lastStep = segmentsToAddImmediately[lastIndex];

              if (Interaction.distance2d(lastStep, step) > 2) {
                lastIndex = index - 1;
                
                currentPainting.updateStroke(step.addPaintingTransform());
                currentPainting.continueDrawing();
              }
            } else {
              currentPainting.updateStroke(step.addPaintingTransform());
              currentPainting.continueDrawing();
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
        currentPainting.updateStroke(new_interaction.addPaintingTransform());
        currentPainting.continueDrawing();
      }

    } else if (Interaction.currentType === Interaction.TYPES.painting.move) { 

      const last_interaction = Interaction.currentSequence[Interaction.currentSequence.length-1];
      const deltaMove = {
        x: new_interaction.x - last_interaction.x,
        y: new_interaction.y - last_interaction.y
      }
      currentPainting.moveLatestStroke(deltaMove.x, deltaMove.y);
      Interaction.currentSequence.push(new_interaction);

    } else if (Interaction.currentType === Interaction.TYPES.painting.eyedropper) {

      Interaction.currentSequence = [new_interaction];
      const brushToAdjust = currentPainting.brushSettingsToAdjust;
      const combinedRGB = currentPainting.getPointRGB(new_interaction.addPaintingTransform());
      brushToAdjust.color = HSLColor.fromRGBwithFallback(combinedRGB[0], combinedRGB[1], combinedRGB[2], brushToAdjust.color);
      if (Interaction.modifyLastStroke) currentPainting.redrawLatestStroke();

    } else if (Interaction.currentType === Interaction.TYPES.gizmo.satAndLum) { 

      const brushToAdjust = currentPainting.brushSettingsToAdjust;
      const brushToReference = previousBrush;

      const deltaX = new_interaction.x - Interaction.currentSequence[0].x;
      const deltaY = new_interaction.y - Interaction.currentSequence[0].y;
      const rangeX = GIZMO_SIZE * 2;
      const rangeY = GIZMO_SIZE * 2;

      // Map to chroma and luminance
      brushToAdjust.color.setSaturation(map( deltaX + rangeX * brushToReference.color.saturation, 0, rangeX, 0, 1, true));
      brushToAdjust.color.setLuminance(map(-deltaY + rangeY * brushToReference.color.luminance, 0, rangeY, 0, 1, true));
      if (Interaction.modifyLastStroke) currentPainting.redrawLatestStroke();

    } else if (Interaction.currentType === Interaction.TYPES.gizmo.hueAndVar) { 

      const brushToAdjust = currentPainting.brushSettingsToAdjust;
      const brushToReference = previousBrush;

      const deltaX = new_interaction.x - Interaction.currentSequence[0].x;
      const deltaY = new_interaction.y - Interaction.currentSequence[0].y;
      const rangeX = GIZMO_SIZE * 2;
      const rangeY = GIZMO_SIZE * 2;

      let newHue = map(deltaX + rangeX * brushToReference.color.hue, 0, rangeX, 0, 1);
      if (newHue > 1) newHue %= 1;
      if (newHue < 0) newHue = 1-(Math.abs(newHue) % 1);
      brushToAdjust.color.setHue(newHue);
      brushToAdjust.colorVar = map(-deltaY + rangeY * brushToReference.colorVar, 0, rangeY, 0, 1, true);
      if (Interaction.modifyLastStroke) currentPainting.redrawLatestStroke();
      
    } else if (Interaction.currentType === Interaction.TYPES.gizmo.size) { 

      const brushToAdjust = currentPainting.brushSettingsToAdjust;
      const brushToReference = previousBrush;

      const deltaY = new_interaction.y - Interaction.currentSequence[0].y;
      const rangeY = GIZMO_SIZE * 2;
      
      brushToAdjust.size = map(-deltaY + rangeY * brushToReference.size, 0, rangeY, 0, 1, true);
      if (Interaction.modifyLastStroke) currentPainting.redrawLatestStroke();
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
    previousBrush = undefined;

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
      } if (Interaction.currentType === Interaction.TYPES.button.tool0) {
        Interaction.pickToolAction(0);
      } if (Interaction.currentType === Interaction.TYPES.button.tool1) {
        Interaction.pickToolAction(1);
      } if (Interaction.currentType === Interaction.TYPES.button.tool2) {
        Interaction.pickToolAction(2);
      }
      Interaction.currentType = null;
      
    } else if (Object.values(Interaction.TYPES.knob).includes(Interaction.currentType)) {

      // started on a knob
      Interaction.currentType = null;
      Interaction.currentSequence = [];

    } else if (Object.values(Interaction.TYPES.slider).includes(Interaction.currentType)) {

      // started on a slider
      Interaction.currentType = null;
      Interaction.currentSequence = [];

    } else if (Interaction.currentType === Interaction.TYPES.painting.draw) {

      // try drawing here still,wip?
      Interaction.currentType = null;
      Interaction.lastInteractionEnd = Interaction.currentSequence[Interaction.currentSequence.length-1];
      Interaction.currentSequence = [];

    } else if (Interaction.currentType === Interaction.TYPES.painting.move) {

      // try moving here still,wip?
      Interaction.currentType = null;
      Interaction.currentSequence = [];
      Interaction.modifyLastStroke = false;

    } else if (Interaction.currentType === Interaction.TYPES.painting.initStroke) {

      // open menu
      if (Interaction.currentUI === Interaction.UI_STATES.nothing_open) {
        Interaction.currentUI = Interaction.UI_STATES.clover_open;
      } else {
        Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      }

      Interaction.currentType = null;
      Interaction.lastInteractionEnd = Interaction.currentSequence[Interaction.currentSequence.length-1]
      Interaction.currentSequence = [];

    } else if (Interaction.currentType === Interaction.TYPES.gizmo.size) {

      Interaction.currentType = null;
      Interaction.currentSequence = [];
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.modifyLastStroke = false;

    } else if (Interaction.currentType === Interaction.TYPES.gizmo.hueAndVar) {

      Interaction.currentType = null;
      Interaction.currentSequence = [];
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.modifyLastStroke = false;

    } else if (Interaction.currentType === Interaction.TYPES.gizmo.satAndLum) {

      Interaction.currentType = null;
      Interaction.currentSequence = [];
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.modifyLastStroke = false;

    } else if (Interaction.currentType === Interaction.TYPES.painting.eyedropper) {

      // actually pick the color again, wip?
      Interaction.currentType = null;
      Interaction.currentSequence = [];
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.modifyLastStroke = false;

    } else {

      console.log("unprocessed pointerEnd, interaction type was: " + Interaction.currentType);
    
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
    return new Interaction( // WIP! needs to actually process event and generate these
      event.clientX,
      event.clientY,
      event.azimuthAngle ?? tiltToAngle(event.tiltX, event.tiltY),
      event.altitudeAngle,
      (event.pointerType === 'mouse' || event.pointerType === 'touch') ? 0.5 : event.pressure,
      event.timeStamp,
      event.pointerId
    );
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
    modifiedInteraction.x -= Interaction.viewTransform.x();
    modifiedInteraction.y -= Interaction.viewTransform.y();
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
  const canvasElement = document.getElementById("myCanvas");

  canvasElement.addEventListener("pointerdown", Interaction.pointerStart);
  canvasElement.addEventListener("pointerup", Interaction.pointerEnd);
  canvasElement.addEventListener("pointercancel", Interaction.pointerCancel);
  canvasElement.addEventListener("pointermove", Interaction.pointerMove);
  canvasElement.addEventListener("wheel", Interaction.wheelScrolled);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      Interaction.lostFocus();
    }
  });
  canvasElement.addEventListener("pointerout", (event) => {
    Interaction.pointerCancel(event);
  });

  // noLoop();

  currentPainting = new Painting(Math.min(width, height)-150, Math.min(width, height)-150, canvasColor);

  document.body.style.backgroundColor = canvasColor.behind().hex;

  // Create a graphics buffer for the indicator
  interfaceBuffer = createGraphics(width, height);
  interfaceBuffer.strokeWeight(6);
  interfaceBuffer.textFont(fontMedium);
  interfaceBuffer.textAlign(LEFT, CENTER);
  newInterfaceSize();
  
  // draw();
}

function keyPressed() {
  Interaction.keyStart(key);
}
function keyReleased() {
  Interaction.keyEnd(key);
}

function windowResized() {
  newCanvasSize();
  newInterfaceSize();
  // draw();
}

function newCanvasSize() {
  //const scrollBarMargin = (isTouchControl === false) ? 10 : 0;
  resizeCanvas(windowWidth - 10, windowHeight - 0);
  GIZMO_SIZE = (width > 300) ? 120 : 60;
}

function newInterfaceSize() {
  interfaceBuffer.resizeCanvas(width, height);
  interfaceBuffer.textSize((width < height) ? 13 : 16);
}


function draw() {

  background(canvasColor.behind().hex);

  // draw the UI to the ui buffer
  redrawInterface(interfaceBuffer); 

  // draw the painting buffer


  drawCenteredCanvas(currentPainting.oldStrokesBuffer);

  // draw the still editable brushstrokes
  currentPainting.usedEditableStrokes.forEach((stroke) => {
    drawCenteredCanvas(stroke.buffer);
  });
  
  // draw the indicator buffer in the top left corner
  image(interfaceBuffer, 0, 0);
}


function drawCenteredCanvas(buffer) {
  if (Interaction.viewTransform.scale === 1) {
    image(buffer, Interaction.viewTransform.x(), Interaction.viewTransform.y());
    return;
  }
  const scaledSize = {
    x: Math.round(Interaction.viewTransform.scale * currentPainting.width),
    y: Math.round(Interaction.viewTransform.scale * currentPainting.height)
  };
  image(buffer, Interaction.viewTransform.x(), Interaction.viewTransform.y(), 
    scaledSize.x, scaledSize.y
  );
}


function redrawInterface(buffer) {
  if (buffer === undefined) return;

  // Clear the UI buffer
  buffer.clear();

  // Interface Colors
  const uiColors = {};
  uiColors.bg = canvasColor.behind();
  uiColors.fg = uiColors.bg.copy()
    .setLuminance(lerp(canvasColor.luminance, (canvasColor.luminance>0.5) ? 0 : 1, 0.8)); 
  uiColors.fgDisabled = uiColors.fg.copy().setAlpha(0.4);
  uiColors.constrastBg = uiColors.fg.copy()
    .setLuminance(lerp(canvasColor.luminance, canvasColor.luminance > 0.5 ? 1 : 0, 0.7)); 
  uiColors.onBrush = currentBrush.color.copy()
    .setLuminance(lerp(currentBrush.color.luminance, (currentBrush.color.luminance>0.5) ? 0:1, 0.7))
    .setSaturation(currentBrush.color.saturation * 0.5);
  
  // MENUS
  // brush menu
  buffer.noStroke();
  //displayTool(currentBrush.tool, currentBrush.texture, 0, 0)

  if (Interaction.currentUI === Interaction.UI_STATES.clover_open) {
    toolPresets.forEach((tool, index) => {
      const x = 0;
      const y = height/2 + 60 * (-toolPresets.length*0.5 + index);
      displayTool(tool.brush, tool.texture, x, y, tool.menuName);
    });
  }

  function displayTool(menuBrushTool, menuTexture, x, y, menuName) {

    const settings = currentBrush.copy();
    settings.size = constrain(settings.size, 0.1, 0.3);
    settings.tool = menuBrushTool;
    settings.texture = menuTexture;
    const isSelected = (currentBrush.tool === settings.tool && currentBrush.texture === settings.texture);

    buffer.push();
    buffer.translate(x, y);

    buffer.fill(uiColors.constrastBg.toHexWithSetAlpha(isSelected ? 0.2 : 1));
    buffer.rect(0, 2, 100, 60-4, 0, 20, 20, 0);

    // draw example
    // wip, not sure why the angle 86 even makes sense.
    const start = new BrushStrokePoint(0, 30, 86, undefined);
    const end = new BrushStrokePoint(80, 30, 86, undefined);
    
    new BrushStroke(buffer, settings).renderStrokePart(start, end);

    buffer.noStroke();
    buffer.fill(uiColors.constrastBg.toHexWithSetAlpha(isSelected ? 0.8 : 0.3));
    buffer.rect(0, 2, 100, 60-4, 0, 20, 20, 0);

    buffer.textAlign(CENTER);
    buffer.fill(isSelected ? uiColors.fgDisabled.hex : uiColors.fg.hex);
    buffer.text(menuName, 40, 30-4);
    buffer.textFont(fontMedium);
    
  
    buffer.pop();

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
  topButton("edit" , topButtonWidth*1, Interaction.modifyLastStroke || noEditableStrokes ? uiColors.fgDisabled : uiColors.fg);
  topButton("clear", width-topButtonWidth*2, new HSLColor(0.1, 0.8, (uiColors.fg.luminance > 0.5) ? 0.7 : 0.4));
  topButton("save" , width-topButtonWidth*1, uiColors.fg);
  
  buffer.fill(uiColors.fg.hex);
  buffer.textAlign(LEFT);
  buffer.textFont(fontMedium);

  // draw the sliders at the top
  const sliderStart = width/2 - 300;
  if (width > 980) {
    let baseColor = currentPainting.brushSettingsToAdjust.color;
    drawGradientSlider(sliderStart, 0, 200, 60,     baseColor.copy().setLuminance(0), baseColor.copy().setLuminance(1), baseColor.luminance);
    drawGradientSlider(sliderStart+200, 0, 200, 60, baseColor.copy().setSaturation(0), baseColor.copy().setSaturation(1), baseColor.saturation);
    drawGradientSlider(sliderStart+400, 0, 200, 60, baseColor.copy().setHue(0), baseColor.copy().setHue(1), baseColor.hue);

    // show difference
    if (previousBrush !== undefined) {
      const prevColor = previousBrush.color;

      if (prevColor.luminance !== baseColor.luminance) {
        showGradientSliderDifference(
          sliderStart, 0, 200, 60, 
          prevColor.copy().setLuminance(0), prevColor.copy().setLuminance(1), 
          prevColor.luminance, baseColor.luminance, 
          "L: " + Math.floor(baseColor.luminance * 100) + "%"
        );
      }
      if (prevColor.saturation !== baseColor.saturation) {
        showGradientSliderDifference(
          sliderStart + 200, 0, 200, 60, 
          prevColor.copy().setSaturation(0), prevColor.copy().setSaturation(1), 
          prevColor.saturation, baseColor.saturation, 
          "S: " + Math.floor(baseColor.saturation * 100) + "%"
        );
      }
      if (prevColor.hue !== baseColor.hue) {
        showGradientSliderDifference(
          sliderStart + 400, 0, 200, 60, 
          prevColor.copy().setHue(0), prevColor.copy().setHue(1), 
          prevColor.hue, baseColor.hue, 
          "H:" + Math.floor(baseColor.hue*360) + "°"
        );
      }

      if (previousBrush.colorVar !== currentBrush.colorVar) {
        drawTooltipBelow(sliderStart - 30, 60, Math.round(currentBrush.colorVar * 100) + "%");
      }
      if (previousBrush.size !== currentBrush.size) {
        drawTooltipBelow(sliderStart + 630, 60, Math.round(currentBrush.pxSize) + "px");
      }
    }

    // draw the variation indicator
    drawRoundColorExampleWithVariation(currentBrush, 55, sliderStart - 30, 30);

    // draw the size indicator
    buffer.drawingContext.save();
    buffer.fill(uiColors.constrastBg.toHexWithSetAlpha(0.5));
    buffer.rect(sliderStart + 600, 0, 60, 60, 20, 20, 20, 20);
    buffer.drawingContext.clip();
    drawSizeIndicator(buffer, currentBrush.pxSize, sliderStart + 630, 30);
    buffer.drawingContext.restore();
    buffer.noStroke();
  }

  function showGradientSliderDifference(x, y, w, h, start, end, componentBefore, componentAfter, componentName) {
    drawGradientSlider(x, 0, w, h/6, start, end, componentBefore);
    drawTooltipBelow(x + componentAfter * w, h, componentName);
  }

  // bottom left/ top middle text
  buffer.fill(uiColors.fg.hex);

  buffer.textAlign(LEFT);
  buffer.fill(uiColors.fg.hex);
  const controlsInfo = "Keyboard: 1-[Value] 2-[Hue] 3-[Size] 4-[Eyedrop] U-[Undo] E-[Edit] S-[Save]";
  buffer.text(controlsInfo, 20, height - 20 - 12);

  //reset text size
  buffer.textSize((width < height) ? 13 : 16);

  // draw rectangle around stroke being edited
  if (Interaction.modifyLastStroke) {
    const bounds = currentPainting.latestStroke.bounds;
    if (bounds.width > 0 && bounds.height > 0) {
      const topLeft = {x: bounds.x, y: bounds.y};
      const botRight = {x: bounds.x + bounds.width, y: bounds.y + bounds.height};

      buffer.push();
      buffer.translate(Interaction.viewTransform.x(), Interaction.viewTransform.y());

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

  // draw the right gadget
  if (Interaction.currentUI !== Interaction.UI_STATES.nothing_open) {
    drawActiveGadget();
  }
  
  // DEV STUFF, WIP
  if (false) {
    buffer.strokeWeight(2);
    buffer.fill(uiColors.fg.hex)
    buffer.text('ui: '         + (Interaction.currentUI ?? 'none'),              20,  80);
    buffer.text('gesture: '    + (Interaction.currentType ?? 'none'),            20, 100);
    buffer.text('points: '     + (Interaction.currentSequence.length ?? 'none'), 20, 120);
    buffer.text('zoom: '       + (Interaction.viewTransform.scale ?? 'none'),    20, 140);

  
    if (Interaction.referencePosition !== undefined) {
      buffer.stroke(new HSLColor(0.1, 1, 1.0).hex);
      buffer.push();
      buffer.translate(Interaction.referencePosition.x, Interaction.referencePosition.y);
      buffer.line(-4, -4, 4, 4);
      buffer.line(-4, 4, 4, -4);
      buffer.pop();
    }
    
    // Interaction.lastInteractionEnd.forEach((point) => {
    //   buffer.fill(new HSLColor(0.6, 1, 1.0).hex);
    //   buffer.rect(point.x, point.y, 2, 2)
    // })
    buffer.strokeWeight(2);
    Interaction.currentSequence.forEach((point) => {
      
      buffer.stroke(new HSLColor(0.1, 1, 1.0).hex);
      buffer.rect(point.x, point.y, 2, 2)
      buffer.fill(new HSLColor(0.1, 1, 0.4).hex);
      buffer.noStroke()
      buffer.rect(point.x, point.y, 2, 2)
    })
  }


  // hover indicator
  if (Interaction.currentType === Interaction.TYPES.painting.hover 
    && Interaction.currentSequence.length > 1
    && !Interaction.modifyLastStroke
    && Interaction.currentUI === Interaction.UI_STATES.nothing_open) {
    const startInteraction = Interaction.currentSequence[Interaction.currentSequence.length-2];
    const endInteraction = Interaction.currentSequence[Interaction.currentSequence.length-1];

    const start = new BrushStrokePoint(startInteraction.x, startInteraction.y, startInteraction.angle);
    const end = new BrushStrokePoint(endInteraction.x, endInteraction.y, endInteraction.angle);

    new BrushStroke(buffer, currentBrush.copy()).renderStrokePart(start, end);
  }
  buffer.noStroke();

  // end of redrawInterface



  function drawActiveGadget() {

    if (Interaction.currentUI === Interaction.UI_STATES.eyedropper_open) {

      buffer.fill(currentBrush.color.hex);
      const position = Interaction.currentSequence[Interaction.currentSequence.length-1];

      // when actually eyedropping
      if (Interaction.currentType === Interaction.TYPES.painting.eyedropper) {
        drawRoundColorExampleWithVariation(currentBrush, currentBrush.pxSize, position.x, position.y);
      }
      
      drawCrosshair(currentBrush.pxSize, position.x, position.y);

    }

    // draw the brush setting gadgets
    const basePosition = Interaction.referencePosition;

    if (basePosition === undefined) return;

    const brushToVisualize = currentPainting.brushSettingsToAdjust;

    buffer.noStroke();
    buffer.fill(brushToVisualize.color.hex);

    const sideDist = GIZMO_SIZE; //(Math.max(width, height) > 4* gadgetRadius) ? gadgetRadius : gadgetRadius*0.5;
    const ankerX = constrain(basePosition.x, sideDist, width - sideDist);
    const ankerY = constrain(basePosition.y, sideDist, height - sideDist);

    if (Interaction.currentUI === Interaction.UI_STATES.clover_open) {

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

      const highlightedGadget = 0 // (menuState.hoverPage === null) ? menuState.lastGadgetPage : menuState.hoverPage;
      // WIP, could reintroduce hover later

      drawGadgetDirection(basePosition.x, basePosition.y, -1,  0, highlightedGadget === 4, "S");
      drawGadgetDirection(basePosition.x, basePosition.y,  1,  0, highlightedGadget === 3, "H");
      drawGadgetDirection(basePosition.x, basePosition.y,  0, -1, highlightedGadget === 5, "I");
      drawGadgetDirection(basePosition.x, basePosition.y,  0,  1, highlightedGadget === 2, "LC");
    
    } else if (Interaction.currentUI === Interaction.UI_STATES.hueAndVar_open) {

      const radius = GIZMO_SIZE;
      buffer.push();
      buffer.translate(ankerX, ankerY);

      buffer.fill("black")
      buffer.ellipse(0, 0, constrain(brushToVisualize.pxSize, 8, GIZMO_SIZE/3)+2)

      // var
      buffer.stroke("black");
      buffer.strokeWeight(16);
      buffer.line(0, radius*2 * (brushToVisualize.colorVar - 1), 0, radius*2 * brushToVisualize.colorVar);

      buffer.strokeWeight(14);
      drawColorAxis(0, radius*2 * (brushToVisualize.colorVar - 1), 0, radius*2 * brushToVisualize.colorVar, brushToVisualize.color, brushToVisualize.color, GIZMO_SIZE, 1.0, 0.0);

      // hue
      // stay centered since hue is a circle anyway
      buffer.stroke("black");
      buffer.strokeWeight(16);
      buffer.line(radius*2 * -0.5, 0, radius*2 * (1-0.5), 0);

      const startColorHue = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue - 0.5); 
      const endColorHue   = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue + 0.5);
      buffer.strokeWeight(14);
      drawColorAxis(radius*2 * -0.5, 0, radius*2 * (1-0.5), 0, startColorHue, endColorHue, GIZMO_SIZE);

      buffer.pop();

      // Show color at reference position
      //const currentColorSize = constrain(brushToVisualize.pxSize, 8, gadgetRadius/3);
      drawRoundColorExampleWithVariation(brushToVisualize, 40, ankerX, ankerY);

    } else if (Interaction.currentUI === Interaction.UI_STATES.satAndLum_open) {

      const radius = GIZMO_SIZE;
      buffer.push();
      buffer.translate(ankerX, ankerY);

      buffer.fill("black")
      buffer.ellipse(0, 0, constrain(brushToVisualize.pxSize, 8, GIZMO_SIZE/3)+2)

      const startColorLum = brushToVisualize.color.copy().setLuminance(1);
      const endColorLum   = brushToVisualize.color.copy().setLuminance(0);
      buffer.stroke("black");
      buffer.strokeWeight(16);
      buffer.line(0, radius*2 * (-1 + brushToVisualize.color.luminance), 0, radius*2 * brushToVisualize.color.luminance);
      buffer.strokeWeight(14);
      drawColorAxis(0, radius*2 * (-1 + brushToVisualize.color.luminance), 0, radius*2 * brushToVisualize.color.luminance, startColorLum, endColorLum, GIZMO_SIZE);

      const startColorSat = brushToVisualize.color.copy().setSaturation(0);
      const endColorSat   = brushToVisualize.color.copy().setSaturation(1);
      buffer.stroke("black");
      buffer.strokeWeight(16);
      buffer.line(radius*2 * -brushToVisualize.color.saturation, 0, radius*2 * (1-brushToVisualize.color.saturation), 0);
      buffer.strokeWeight(14);
      drawColorAxis(radius*2 * -brushToVisualize.color.saturation, 0, radius*2 * (1-brushToVisualize.color.saturation), 0, startColorSat, endColorSat, GIZMO_SIZE);
      
      buffer.pop();

      // Show color at reference position
      //const currentColorSize = constrain(brushToVisualize.pxSize, 8, gadgetRadius/3);
      drawRoundColorExampleWithVariation(brushToVisualize, 40, ankerX, ankerY);

    } else if (Interaction.currentUI === Interaction.UI_STATES.size_open) {

      const posX = ankerX;
      const posY = ankerY - GIZMO_SIZE;
      const lineAddY = GIZMO_SIZE * 2 * brushToVisualize.size;
      const lineTranslateY = posY + lineAddY;

      buffer.stroke(uiColors.constrastBg.toHexWithSetAlpha(0.3));
      buffer.strokeWeight(12);
      buffer.line(posX, lineTranslateY - GIZMO_SIZE,posX, lineTranslateY + GIZMO_SIZE);
      buffer.strokeWeight(10);
      buffer.stroke(uiColors.fg.toHexWithSetAlpha(0.3));
      buffer.line(posX, lineTranslateY - GIZMO_SIZE,posX, lineTranslateY + GIZMO_SIZE);
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

  function drawTooltipBelow(x, y, text) {
    buffer.textAlign(CENTER);
    const textPos = {
      x: x,
      y: y + 14
    }
    let bbox = fontMedium.textBounds(text, textPos.x, textPos.y);
    buffer.fill(uiColors.constrastBg.toHexWithSetAlpha(0.5));
    buffer.rect(bbox.x - bbox.w/2 - 13, bbox.y + bbox.h/2 - 4, bbox.w+26, bbox.h+12, 20);
    buffer.fill(uiColors.fg.hex);
    buffer.text(text, textPos.x, textPos.y);
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

function xorshift(seed) {
  seed ^= (seed << 21);
  seed ^= (seed >>> 35);
  seed ^= (seed << 4);
  return seed;
}
