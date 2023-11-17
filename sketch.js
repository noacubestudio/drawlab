let cnv;

// render the painting and visuals separately
let paintingBuffer;
let interfaceBuffer;
let newStrokeBuffer;

// background color settings
let bgHue = 0.6;
let bgChroma = 0.1;
let bgLuminance = 0.15;

const paintingState = {
  width: () => Math.min(width, height)-150,
  height: () => Math.min(width, height)-150,
  x: () => Math.floor((width - paintingState.width())/2),
  y: () => Math.floor((height - paintingState.height())/2),
  containsNewStroke: undefined
}

// reference of previous brush settings for relative change
let refX;
let refY;
let refAlt;
let refAngle;

let refHue;
let refVar;
let refSaturation;
let refLuminance;
let refSize;

// menu
let toolPresets = [
  {brush: "Brush Tool", texture: "Regular", menuName: "Brush"},
  {brush: "Brush Tool", texture: "Rake", menuName: "Rake"},
  {brush: "Stamp Tool", texture: "Rounded", menuName: "Stamp"},
  //{brush: "Stamp Tool", texture: "Rake", menuName: "Rake S"},
  // {brush: "Sharp Line Tool", texture: "Regular", menuName: "Sharp L"},
  // {brush: "Sharp Line Tool", texture: "Rake", menuName: "Rake L"},
  // {brush: "Round Line Tool", texture: undefined, menuName: "Round L"},
  // {brush: "Fan Line Tool", texture: undefined, menuName: "Fan"},
  // {brush: "Triangle Tool", texture: undefined, menuName: "Triangle"},
  {brush: "Lasso Tool", texture: undefined, menuName: "Lasso"},
  {brush: "Mirror Tool", texture: undefined, menuName: "Mirror"},
];

let gadgetRadius; // based on canvas size

// current brush settings for drawing
let brushHue = 0.6;
let brushColorVar = 0.5;
let brushSaturation = 0.6;
let brushLuminance = 0.7;
let brushSize = 200;
let brushTool = toolPresets[0].brush;
let texture = toolPresets[0].texture;

// save 0-1 values here for consistent noise that stays between redraws
let noiseValues256 = [];

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

// recorded brushstroke
let currentInputMode;
let penRecording = [];
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

function setup() {
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
  refX = pen.x;
  refY = pen.y;

  // Create a graphics buffer for the painting and one for the last stroke
  paintingBuffer = createGraphics(paintingState.width(), paintingState.height());
  newStrokeBuffer = createGraphics(paintingState.width(), paintingState.height());
  if ((width * displayDensity()) > 3000) {
    paintingBuffer.pixelDensity(1);
    newStrokeBuffer.pixelDensity(1);
  }
  paintingBuffer.background(componentsToHex(bgLuminance, bgChroma, bgHue));
  document.body.style.backgroundColor = componentsToHex(bgLuminance*0.9, Math.min(bgChroma, 0.1), bgHue);

  // Create a graphics buffer for the indicator
  interfaceBuffer = createGraphics(width, height);
  interfaceBuffer.strokeWeight(6);
  interfaceBuffer.textFont(fontMedium);
  interfaceBuffer.textAlign(LEFT, CENTER);
  newInterfaceSize();

  // new random noise
  noiseValues256 = Array.from({ length: 256 }, () => random(-1, 1));
  
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
  //paintingBuffer.resizeCanvas(Math.min(width, height)-140, Math.min(width, height)-140);
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
        brushTool = toolPresets[spot].brush;
        texture = toolPresets[spot].texture;
        if (editMode) {
          pen.lastX = undefined;
          pen.lastY = undefined;
          editMode = false;
          redrawLastStroke(newStrokeBuffer);
        }
      }
      menuState.startedEventOnMenu = true;
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
    // apply the color change
    // clear reference
    menuState.topSliderDeltaX = undefined;
    menuState.topSliderStartX = undefined;
    menuState.startedEventOnMenu = false;
    //clearBrushReference();
  }

  // pen down
  if (startEventTypes.includes(event.type) && pen.isDown) {
    pen.startX = pen.x;
    pen.startY = pen.y;
    pen.startAngle = pen.angle;
    pen.startPressure = pen.pressure;
    pen.started = true;
    pen.startTimeStamp = event.timeStamp;
    if (!editMode && inputMode() === "draw") penRecording = [];
    return;
  }

  // record
  if (pen.isDown && !editMode && inputMode() === "draw") {
    penRecording.push({
      x: pen.x,
      y: pen.y,
      angle: pen.angle,
      pressure: pen.pressure,
      event: event.type
    });
  }

  // pen lifted
  if (pen.wasDown && !pen.isDown) {

    pen.lastX = undefined;
    pen.lastY = undefined;

    const penDownDuration = event.timeStamp - pen.startTimeStamp;
    const penDownBounds = dist(pen.startX, pen.startY, pen.x, pen.y);

    const didNotDraw = (penDownDuration < 200 && penDownBounds < 20) || (penDownBounds < 2);

    // was drawing, but only short
    if (menuState.onPage === 0 && didNotDraw) {

      if (!editMode) {
        doAction("undo");
      }
      
      menuState.onPage = 1;
    } else if (menuState.onPage > 0) {
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
    doAction("clear");
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

    newStrokeBuffer.clear();
    paintingState.containsNewStroke = true;
    penRecording = [];
    editMode = false;

  } else if (action === "clear") {

    [bgLuminance, brushLuminance] = [brushLuminance, bgLuminance];
    [bgChroma, brushSaturation] = [brushSaturation, bgChroma];
    [bgHue, brushHue] = [brushHue, bgHue];

    newStrokeBuffer.clear();
    penRecording = [];
    editMode = false;

    paintingBuffer.background(componentsToHex(bgLuminance, bgChroma, bgHue));
    document.body.style.backgroundColor = componentsToHex(bgLuminance*0.9, Math.min(bgChroma, 0.1), bgHue);

  } else if (action === "save") {

    const timestamp = new Date().toLocaleString().replace(/[-:T.]/g, "-").replace(/, /g, "_");
    
    // commit the new stroke to the painting and clear the buffer
    addLastStrokeToPainting();
    
    saveCanvas(paintingBuffer, "drawlab-canvas_" + timestamp, "png");

  } else if (action === "edit") {

    editMode = !editMode;
  }
}

function addLastStrokeToPainting() {
  // commit the new stroke to the painting and clear the buffer
  paintingBuffer.image(newStrokeBuffer, 0, 0);
  newStrokeBuffer.clear();
  paintingState.containsNewStroke = true;
}

function keyReleased() {
  draw();
}


function inputMode() {
  // desktop or tablet
  if (menuState.onPage === 1) {
    return "cloverMenu";
  }

  //'1', luminance and chroma 
  if (keyIsDown(49) || menuState.onPage === 2) {
    return "lumAndChr";
  }
  //'2', hue
  if (keyIsDown(50) || menuState.onPage === 3) {
    return "hue";
  }
  //'3', size
  if (keyIsDown(51) || menuState.onPage === 4) {
    return "size";
  }
  //'4', eyedropper ... WIP, currently not on touch
  if (keyIsDown(52) || menuState.onPage === 5) {
    return "eyedropper";
  }
  
  // otherwise just
  return "draw";
}

function draw() {

  background(componentsToHex(bgLuminance*0.9, Math.min(bgChroma, 0.1), bgHue));

  const wasInMenu = (currentInputMode !== "draw");
  currentInputMode = inputMode();

  if (currentInputMode === "lumAndChr" 
    || currentInputMode === "hue" 
    || currentInputMode === "size" 
    || currentInputMode === "eyedropper"
    || currentInputMode === "cloverMenu") { // menu opened

    // save the old brush values as a reference when opening a menu
    updateBrushReferenceFromInput();
    // get the new changed brush values
    updateBrushSettingsFromInput(currentInputMode);

    if (editMode) redrawLastStroke(newStrokeBuffer);
  }

  if (currentInputMode === "draw") {
    // clear the reference values so they could be changed again when opening a menu
    if (menuState.startedEventOnMenu !== true) clearBrushReference();

    // start of brushstroke
    if (!editMode && !wasInMenu) {
      if (pen.started) {
        
        addLastStrokeToPainting();

        // don't draw on initial spot as a WIP pressure fix
      } else {
        // draw to the stroke buffer immediately
        if ((brushTool === "Stamp Tool" || brushTool === "Fan Line Tool") && pen.isDown) {
          drawInNewStrokeBuffer(newStrokeBuffer, pen.startX, pen.startY, pen.startAngle, pen.startPressure, pen.x, pen.y, pen.angle, pen.pressure, penRecording)

        } else if (brushTool === "Brush Tool") {
          drawInNewStrokeBuffer(newStrokeBuffer, pen.lastX, pen.lastY, pen.lastAngle, pen.lastPressure, pen.x, pen.y, pen.angle, pen.pressure, penRecording)

        } else if (!pen.isDown && pen.wasDown) {
          // drawn when pen lifted
          drawInNewStrokeBuffer(newStrokeBuffer, pen.startX, pen.startY, pen.startAngle, pen.startPressure, pen.x, pen.y, pen.angle, pen.pressure, penRecording)
        }
      }
    } else if (editMode && pen.isDown) {
      editState.lastX ??= pen.x;
      editState.lastY ??= pen.y;

      const deltaX = pen.x-editState.lastX;
      const deltaY = pen.y-editState.lastY;

      editState.lastX = pen.x;
      editState.lastY = pen.y;

      redrawLastStroke(newStrokeBuffer, deltaX, deltaY);
    } else if (editMode) {
      editState.lastX = undefined;
      editState.lastY = undefined;
    }
  }

  // draw the UI to the ui buffer
  redrawInterface(interfaceBuffer, currentInputMode); 

  // draw the painting buffer
  if (paintingBuffer !== undefined) image(paintingBuffer, paintingState.x(), paintingState.y());

  // draw the last brushstroke buffer
  if (newStrokeBuffer !== undefined) image(newStrokeBuffer, paintingState.x(), paintingState.y());

  // draw the indicator buffer in the top left corner
  if (interfaceBuffer !== undefined) image(interfaceBuffer, 0, 0);
}

function clearBrushReference() {
  refX = undefined;
  refY = undefined;
  refHue = undefined;
  refSaturation = undefined;
  refLuminance = undefined;
  refSize = undefined;
  refVar = undefined;
  refAlt = undefined;
  refAngle = undefined;
  refHoverX = undefined;
  refHoverY = undefined;
  refScreenPointerX = undefined;
  refScreenPointerY = undefined;
  refScreenHoverX = undefined;
  refScreenHoverY = undefined;
}

function updateBrushReferenceFromInput() {
  // starting position
  refX      ??= pen.x;
  refY      ??= pen.y;
  refAlt    ??= pen.altitude;
  refAngle  ??= pen.angle;
  refHoverX ??= hover.x;
  refHoverY ??= hover.y;
  refScreenPointerX ??= menuState.screenPointerX;
  refScreenPointerY ??= menuState.screenPointerY;
  refScreenHoverX ??= menuState.screenHoverX;
  refScreenHoverY ??= menuState.screenHoverY;
  // starting brush settings
  refHue       ??= brushHue;
  refSaturation    ??= brushSaturation;
  refLuminance ??= brushLuminance;
  refSize      ??= brushSize;
  refVar       ??= brushColorVar;
}

function redrawLastStroke(buffer, xDiff, yDiff) {
  if (buffer === undefined) return;
  const easedSize = easeInCirc(brushSize, 4, 600);

  // move recording
  if (xDiff !== undefined && yDiff !== undefined) {
    penRecording.forEach((point) => {
      point.x += xDiff;
      point.y += yDiff;
    });
  }

  xDiff ??= 0;
  yDiff ??= 0;

  const recStartX = penRecording[0].x;
  const recStartY = penRecording[0].y;
  const recStartAngle = penRecording[0].angle;
  const recStartPressure = penRecording[0].pressure;

  // clear brushstroke before reconstructing from recording
  buffer.clear();

  // use recording
  if ((brushTool === "Stamp Tool" || brushTool === "Fan Line Tool")) {
    penRecording.forEach((point) => {
      drawInNewStrokeBuffer(buffer, recStartX, recStartY, recStartAngle, recStartPressure, point.x, point.y, point.angle, point.pressure, penRecording)
    });
  } else if (brushTool === "Brush Tool"){
    penRecording.forEach((point, index) => {
      const lastPoint = penRecording[index - 1];
      if (lastPoint !== undefined) { 
        drawInNewStrokeBuffer(buffer, lastPoint.x, lastPoint.y, lastPoint.angle, lastPoint.pressure, point.x, point.y, point.angle, point.pressure, penRecording)
      }
    });
  } else {
    const recEndX = penRecording[penRecording.length-1].x;
    const recEndY = penRecording[penRecording.length-1].y;
    const recEndAngle = penRecording[penRecording.length-1].angle;
    const recEndPressure = penRecording[penRecording.length-1].pressure;
    drawInNewStrokeBuffer(buffer, recStartX, recStartY, recStartAngle, recStartPressure, recEndX, recEndY, recEndAngle, recEndPressure, penRecording)
  }
}

function drawInNewStrokeBuffer(buffer, startX, startY, startAngle, startPressure, endX, endY, endAngle, endPressure, recording) {
  if (buffer === undefined) return;

  // drawing in the new stroke buffer, which has to be added to canvas later
  paintingState.containsNewStroke = false;
  const easedSize = easeInCirc(brushSize, 4, 600);

  if (brushTool === "Stamp Tool") {

    drawBrushstroke(buffer, endX, endY, easedSize, endAngle, endPressure, texture);

  } else if (brushTool === "Fan Line Tool") {

    // one color variation for each line instance
    buffer.stroke(currentBrushToHex(endX * endY));
    drawWithLine(buffer, startX, startY, endX, endY, easedSize);

  } else if (brushTool === "Round Line Tool") {

    // one color variation for each line instance
    buffer.stroke(currentBrushToHex(startX * startY));
    drawWithLine(buffer, startX, startY, endX, endY, easedSize);

  } else if (brushTool === "Sharp Line Tool" || brushTool === "Brush Tool") {
    const randomID = (recording.length > 0) ? Math.floor(recording[0].x) : 0;
    drawWithConnection(buffer, startX, startY, startAngle, startPressure, endX, endY, endAngle, endPressure, easedSize, texture, randomID);

  } else if (brushTool === "Triangle Tool") {

    // one color variation for each line instance
    buffer.fill(currentBrushToHex(startX * startY));
    drawWithPolygon(buffer, startX, startY, endX, endY, recording, 3);

  } else if (brushTool === "Lasso Tool") {

    // one color variation for each line instance
    buffer.fill(currentBrushToHex(startX * startY));
    drawwithLasso(buffer, startX, startY, endX, endY, recording, easedSize);

  } else if (brushTool === "Mirror Tool") {

    // one color variation for each line instance
    buffer.fill(currentBrushToHex(startX * startY));
    drawwithMirror(buffer, startX, startY, endX, endY, recording, easedSize);
  }
}


function updateBrushSettingsFromInput(currentInputMode) {

  const penMode = (pen.startX !== undefined && pen.startY !== undefined)

  if (currentInputMode === "cloverMenu") {

    const affectedPageType = (pen.isDown) ? "onPage" : "hoverPage";

    // Get positions
    const deltaX = (pen.isDown ? pen.x : hover.x) - refX;
    const deltaY = (pen.isDown ? pen.y : hover.y) - refY;

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

  if (currentInputMode === "lumAndChr") {

    // Get positions
    let deltaX = pen.x - (penMode ? pen.startX : refX);
    let deltaY = pen.y - (penMode ? pen.startY : refY);

    let rangeX = gadgetRadius * 2;
    let rangeY = gadgetRadius * 2;

    // Map to chroma and luminance
    brushSaturation =    map( deltaX + rangeX * refSaturation   , 0, rangeX, 0, 1, true);
    brushLuminance = map(-deltaY + rangeY * refLuminance, 0, rangeY, 0, 1, true);

  } else if (currentInputMode === "hue") { // '1', hue and hue variation

    // Get positions
    let deltaX = pen.x - (penMode ? pen.startX : refX);
    let deltaY = pen.y - (penMode ? pen.startY : refY);

    let rangeX = gadgetRadius * 2;
    let rangeY = gadgetRadius * 2;

    brushHue = map(deltaX + rangeX * refHue, 0, rangeX, 0, 1);
    if (brushHue > 1) brushHue %= 1;
    if (brushHue < 0) brushHue += 1;

    brushColorVar = map(-deltaY + rangeY * refVar, 0, rangeY, 0, 1, true);

  } else if (currentInputMode === "size") {

    const deltaY = pen.y - (penMode ? pen.startY : refY);
    const rangeY = gadgetRadius * 2;

    brushSize = map(-deltaY + rangeY * map(refSize, 4, 600, 0, 1), 0, rangeY, 4, 600, true);
  
  } else if (currentInputMode === "eyedropper") {
    paintingBuffer.image(newStrokeBuffer, 0, 0);
    newStrokeBuffer.clear();

    // go through a few pixels
    const addRadiusPx = 2;
    const colorsArr = [];
    for (x = -addRadiusPx; x <= addRadiusPx; x++) {
      for (y = -addRadiusPx; y <= addRadiusPx; y++) {
        const rgbaColor = paintingBuffer.get(pen.x + x, pen.y + y);
        if (rgbaColor[3] !==0) colorsArr.push(rgbaColor);
      }
    }
    if (colorsArr.length === 0) return;

    let sumRed = 0; let sumGreen = 0; let sumBlue = 0;
    for (const rgb of colorsArr) {
      sumRed += rgb[0];
      sumGreen += rgb[1];
      sumBlue += rgb[2];
    }
    const avgColor = [sumRed / colorsArr.length, sumGreen / colorsArr.length, sumBlue / colorsArr.length];
    const okhslArray = srgb_to_okhsl(avgColor[0], avgColor[1], avgColor[2]);

    // default to current hue if gray
    if (okhslArray[1] < 0.01) okhslArray[2] = brushHue;

    // replace brush with new colors
    [brushHue, brushSaturation, brushLuminance] = okhslArray;
  }
}

function drawBrushstroke(buffer, x, y, size, angle, pressure, texture) {
  buffer.noStroke();

  // draw bigger version behind to give some extra detail
  if (texture === "Rounded") {
    const rainbow = componentsToHex(
      brushLuminance*0.98,
      brushSaturation,
      brushHue,
      {seed: x * y, strength: brushColorVar}
    );
    buffer.fill(rainbow);
    drawStamp(buffer, x, y, size*1.05, angle, pressure, texture);
  }
  

  // one color variation for each stamp instance
  const brushHex = currentBrushToHex(x + y);
  buffer.fill(brushHex);
  drawStamp(buffer, x, y, size, angle, pressure, texture);
}

function drawStamp(buffer, x, y, size, angle, pressure, texture) {

  if (x === undefined || y === undefined) return;

  buffer.push();
  buffer.translate(x, y);
  buffer.rotate(-HALF_PI);

  let stampW = size;
  let stampH = size;

  // brush shape
  if (angle !== undefined) {
    buffer.rotate(angle);
  } else {
    buffer.rotate(HALF_PI);
  }

  if (texture === "Rounded") {

    if (angle !== undefined) {
      stampW = (pressure !== undefined) ? size * map(pressure, 0.0, 0.2, 0.1, 0.9, true) : size * 0.1;
    }
    buffer.rect(- stampW/2, - stampH/2, stampW, stampH, size / 4);

  } else if (texture === "Rake") {

    // if the brush size is small relative to the painting size, use less circles, if it's big use more
    const circleCount = Math.floor(map(size, 4, 300, 2, 12));
    const gapSize = (pressure !== undefined) ? map(pressure, 0.0, 0.2, 3.0, 0.0, true) : 1.0;

    // calculate the actual sizes
    const circleSize = stampH / ((circleCount-1)*gapSize + circleCount);
    buffer.translate(0, -stampH*0.5 + circleSize/2);
    for (let i = 0; i < circleCount; i++) {
      const rakeY = i*(circleSize*(1+gapSize));
      // modify color too
      const brushHex = currentBrushToHex(i + Math.round((angle !== undefined) ? angle*6 : 0));
      buffer.fill(brushHex);

      buffer.ellipse(0, rakeY, circleSize);
    }
  }
  

  buffer.pop();
}

function currentBrushToHex(seed) {
  if (seed === undefined) return componentsToHex(brushLuminance, brushSaturation, brushHue);
  return componentsToHex(brushLuminance, brushSaturation, brushHue, {seed: seed, strength: brushColorVar});
}

function drawWithLine(buffer, xa, ya, xb, yb, size) {
  if (xa === undefined || ya === undefined || xb === undefined || yb === undefined) return;

  // draw the line rect
  buffer.strokeWeight(size);
  buffer.line(xa, ya, xb, yb);

  buffer.strokeWeight(6);
  buffer.noStroke();
}


function drawWithConnection(buffer, startX, startY, startAngle, startPressure, endX, endY, endAngle, endPressure, size, texture, randomID) {
  if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) return;
  if (startX === endX && startY === endY) return;

  startAngle ??= endAngle;
  startAngle ??= p5.Vector.angleBetween(createVector(0, -1), createVector(endX-startX, endY-startY));
    endAngle ??= p5.Vector.angleBetween(createVector(0, -1), createVector(endX-startX, endY-startY));

    endPressure ??= startPressure;
  startPressure ??= 0.2;
    endPressure ??= 0.2;

  const avgPressure = (startPressure + endPressure) / 2;


  buffer.noStroke();

  const steps = map(size, 10, 300, 10, 200);
  for (let i = 0; i < steps; i++) {

    const drawStep = (texture !== "Rake" || i % 3 == 0 || i == steps-1)

    if (drawStep) {
      const lowerSide = i/steps - 0.5;
      const higherSide = (i+1)/steps - 0.5;
  
      const rf = (i !== 0 && i !== steps-1) ? 0.1 * size * easedHueVar(brushColorVar) : 0; // randomness matches increasing variation

      const lerpPart = noiseValues256[Math.floor(i + ((startX !== undefined) ? Math.abs(startX + startY) : 0)) % noiseValues256.length] ?? 0.5;
      const middleX = lerp(startX, endX, lerpPart);
      const middleY = lerp(startY, endY, lerpPart);

      startEdgeVectorLower  = p5.Vector.fromAngle(startAngle, lowerSide*size*map(startPressure, 0, 0.3, 0.3, 2.0, true));
      startEdgeVectorHigher = p5.Vector.fromAngle(startAngle, higherSide*size*map(startPressure, 0, 0.3, 0.3, 2.0, true));

      endEdgeVectorLower    = p5.Vector.fromAngle(endAngle, lowerSide*size*map(endPressure, 0, 0.3, 0.3, 2.0, true));
      endEdgeVectorHigher   = p5.Vector.fromAngle(endAngle, higherSide*size*map(endPressure, 0, 0.3, 0.3, 2.0, true));

      let avgAngle = lerp(startAngle, endAngle, lerpPart);
      midEdgeVectorLower    = p5.Vector.fromAngle(avgAngle, lowerSide*size*map(avgPressure, 0, 0.3, 0.3, 2.0, true));
      midEdgeVectorHigher   = p5.Vector.fromAngle(avgAngle, higherSide*size*map(avgPressure, 0, 0.3, 0.3, 2.0, true));


      if (noiseValues256[Math.abs(startX * startY) * i % noiseValues256.length] < startPressure * 4) {
        const brushHex = currentBrushToHex(i + randomID + Math.abs(startX * startY));
        buffer.fill(brushHex);
  
        buffer.beginShape();
        randomizedVertex(buffer, startX, startEdgeVectorLower.x , startY, startEdgeVectorLower.y , rf);
        randomizedVertex(buffer, startX, startEdgeVectorHigher.x, startY, startEdgeVectorHigher.y, rf);
        randomizedVertex(buffer, middleX, midEdgeVectorHigher.x, middleY, midEdgeVectorHigher.y, rf);
        randomizedVertex(buffer, middleX, midEdgeVectorLower.x, middleY, midEdgeVectorLower.y, rf);
        buffer.endShape();
      }

      if (noiseValues256[Math.abs(endX * endY) * i % noiseValues256.length] < endPressure * 4) {
        const brushHex2 = currentBrushToHex(i + randomID + endX * endY );
        buffer.fill(brushHex2);
  
        buffer.beginShape();
        randomizedVertex(buffer, middleX,midEdgeVectorLower.x, middleY, midEdgeVectorLower.y, rf);
        randomizedVertex(buffer, middleX,midEdgeVectorHigher.x, middleY, midEdgeVectorHigher.y, rf);
        randomizedVertex(buffer, endX  , endEdgeVectorHigher.x  , endY  , endEdgeVectorHigher.y  , rf);
        randomizedVertex(buffer, endX  , endEdgeVectorLower.x   , endY  , endEdgeVectorLower.y   , rf);
        buffer.endShape();
      }

    }
  }

  function randomizedVertex(buffer, x, xOff, y, yOff, randomFactor) {
    buffer.vertex(
      x + xOff + noiseValues256[Math.floor(Math.abs(x)) % noiseValues256.length] * randomFactor, 
      y + yOff + noiseValues256[Math.floor(Math.abs(y)) % noiseValues256.length] * randomFactor
    );
  }
}


function drawWithPlaceholder(buffer, xa, ya, xb, yb, size) {
  if (xa === undefined || ya === undefined || xb === undefined || yb === undefined) return;

  // draw the line rect
  buffer.strokeWeight(size);
  buffer.strokeCap(SQUARE);
  buffer.line(xa, ya, xb, yb);

  buffer.strokeCap(ROUND);
  buffer.strokeWeight(6);
  buffer.noStroke();
}


function drawWithPolygon(buffer, xa, ya, xb, yb, penRecording, sidesCount) {
  if (xa === undefined || ya === undefined || xb === undefined || yb === undefined) return;

  buffer.noStroke();

  buffer.push();
  buffer.translate(xa, ya);

  if (penRecording !== undefined && penRecording.length >= sidesCount) {

    const foundPoints = [{x: xa, y:ya, index:0}, {x: xb, y: yb, index: penRecording.length-1}];
    
    for (let foundNum = foundPoints.length-1; foundNum < sidesCount; foundNum++) {

      let highestDist = 0;
      let furthestX = undefined;
      let furthestY = undefined;
      let furthestIndex = undefined;

      penRecording.forEach((point, index) => { 
        if (index > 0 && index < penRecording.length-1) {
  
          const totalDist = foundPoints.reduce((sum, foundpoint) => {
            return sum + dist(foundpoint.x, foundpoint.y, point.x, point.y);
          }, 0);
          //print(totalDist, sidesCount, foundNum);
          if (totalDist > highestDist) {
            highestDist = totalDist;
            furthestX = point.x;
            furthestY = point.y;
            furthestIndex = index;
          }
        }
      });

      foundPoints.push({x: furthestX, y: furthestY, index: furthestIndex});
    }

    foundPoints.sort((a, b) => a.index - b.index);
    print(foundPoints.reduce((text, point) => {return text + ", " + point.index}, ""))
    
    buffer.beginShape();
    buffer.vertex(0,0);
    for(let drawNum = 2; drawNum < foundPoints.length; drawNum++) {
      buffer.vertex(foundPoints[drawNum].x-xa, foundPoints[drawNum].y-ya);
    }
    
    buffer.vertex(xb-xa, yb-ya);
    buffer.endShape();

  } else {
    
    // not enough points, just assume triangle as fallback
    buffer.beginShape();
    buffer.vertex(0,0);
    buffer.vertex((xb-xa)*0.5, (xb-xa)*0.3);
    buffer.vertex(xb-xa, yb-ya);
    buffer.endShape();
  }

  buffer.pop();
}

function simplifyPath(points, epsilon) {
  let dmax = 0;
  let index = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = dist(points[i].x, points[i].y, points[0].x, points[0].y);

    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const recResults1 = simplifyPath(points.slice(0, index + 1), epsilon);
    const recResults2 = simplifyPath(points.slice(index), epsilon);
    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  } else {
    return [points[0], points[points.length - 1]];
  }
}

function drawSimplifiedLasso(buffer, xa, ya, xb, yb, penRecording, size) {
  buffer.noStroke();

  if (penRecording.length <= 2) return;
  const simplifiedPath = simplifyPath(penRecording, 20.0);
  print(penRecording.length, simplifiedPath.length)

  // buffer.push();
  // buffer.translate(xa, ya);
  if (simplifiedPath !== undefined && simplifiedPath.length > 2) {
    buffer.beginShape();
    buffer.curveVertex(xa, ya);
    simplifiedPath.forEach((point) => { 
      buffer.curveVertex(point.x, point.y);
    });
    buffer.curveVertex(xb, yb);
    buffer.endShape();
  }

  // buffer.pop();
}

function drawwithMirror(buffer, xa, ya, xb, yb, penRecording, size) {
  if (xa === undefined || ya === undefined || xb === undefined || yb === undefined) return;
  buffer.noStroke();

  if (penRecording !== undefined && penRecording.length > 2) {

    const slices = [{x: 0, y: 0}]

    penRecording.forEach((point, index) => { 
      if (index > 0) {
        // point after start
        const length = dist(xa, ya, point.x, point.y);
        const angle = p5.Vector.angleBetween(createVector(xb-xa, yb-ya), createVector(point.x-xa, point.y-ya))
        const height = length * sin(angle);
        const baseLength = Math.sqrt( length ** 2 - height ** 2) * ((angle < -HALF_PI) ? -1 : 1);
        slices.push({x: baseLength, y: height});
      }
    });

    buffer.push();
    buffer.translate(xa, ya);
    buffer.rotate(p5.Vector.angleBetween(createVector(1, 0), createVector(xb-xa, yb-ya)));

    buffer.beginShape();
    buffer.vertex(0, 0);
    slices.forEach((slice) => {
      buffer.vertex(slice.x, slice.y);
    });
    buffer.endShape();

    buffer.beginShape();
    buffer.vertex(0, 0);
    slices.forEach((slice) => {
      buffer.vertex(slice.x, -slice.y);
    });
    buffer.endShape();

    buffer.pop();
  }
}

function drawwithLasso(buffer, xa, ya, xb, yb, penRecording, size) {
  if (xa === undefined || ya === undefined || xb === undefined || yb === undefined) return;
  buffer.noStroke();

  if (penRecording !== undefined && penRecording.length > 2) {
    buffer.beginShape();
    buffer.vertex(xa, ya);
    penRecording.forEach((point, index) => { 
      if (index > 0 && index < penRecording.length-1) {
        // point in between start and end
        buffer.vertex(point.x, point.y);
      }
    });
    buffer.vertex(xb, yb);
    buffer.endShape();
  }
}



function redrawInterface(buffer, activeInputGadget) {
  if (buffer === undefined) return;

  // Clear the UI buffer
  buffer.clear();

  // Interface Colors
  const bgHex = componentsToHex(bgLuminance*0.9, Math.min(bgChroma, 0.1), bgHue);
  const visibleTextLum = constrain(bgLuminance + (bgLuminance > 0.5 ? -0.4 : 0.4), 0, 1.0);
  const lessTextLum = constrain(bgLuminance + (bgLuminance > 0.5 ? -0.25 : 0.25), 0, 1.0);
  const visHex = componentsToHex(visibleTextLum, min(bgChroma, 0.2), bgHue);
  const antiVisHex = componentsToHex(constrain(0.5+(-visibleTextLum/2+0.5)*4, 0, 1.0), min(bgChroma, 0.2), bgHue);

  const brushHex = componentsToHex(brushLuminance, brushSaturation, brushHue);
  const visibleTextOnBrushLum = constrain(brushLuminance + (brushLuminance > 0.5 ? -0.6 : 0.6), 0, 1.0);
  const onBrushHex = componentsToHex(visibleTextOnBrushLum, brushSaturation*0.5, brushHue);
  const refHex = componentsToHex(refLuminance, refSaturation, refHue);
  const easedSize = easeInCirc(brushSize, 4, 600);

  // Background borders
  buffer.fill(bgHex);
  buffer.rect(0, 0, width, 60);

  // Unfinished brushstroke preview
  if (pen.isDown && (activeInputGadget === "draw") && !editMode) {

    // change from canvas to screen space
    buffer.push();
    buffer.translate(paintingState.x(), paintingState.y());

    if (brushTool === "Round Line Tool") {
      buffer.stroke(currentBrushToHex(pen.startX * pen.startY));
      drawWithLine(buffer, pen.startX, pen.startY, pen.x, pen.y, easedSize);
    } else if (brushTool === "Sharp Line Tool") { 
      drawWithConnection(buffer, pen.startX, pen.startY, pen.startAngle, pen.startPressure, pen.x, pen.y, pen.angle, pen.pressure, easedSize, texture);
    } else if (brushTool === "Triangle Tool") {
      buffer.fill(currentBrushToHex(pen.startX * pen.startY));
      drawWithPolygon(buffer, pen.startX, pen.startY, pen.x, pen.y, penRecording, 3);
    } else if (brushTool === "Lasso Tool") {
      buffer.fill(currentBrushToHex(pen.startX * pen.startY));
      drawwithLasso(buffer, pen.startX, pen.startY, pen.x, pen.y, penRecording, easedSize);
    } else if (brushTool === "Mirror Tool") {
      buffer.fill(currentBrushToHex(pen.startX * pen.startY));
      drawwithMirror(buffer, pen.startX, pen.startY, pen.x, pen.y, penRecording, easedSize);
    }

    buffer.pop();
  }
  
  // MENUS
  // Corner brush preview
  const cornerPreviewBrushSize = constrain(easedSize, 8, gadgetRadius/3);
  buffer.noStroke();
  displayTool(brushTool, texture, 0, 0)

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
      if (menuBrushTool === "Stamp Tool") {
        for (let x = 0; x <= 40; x += 5) {
          drawBrushstroke(buffer, x, 0, cornerPreviewBrushSize, pen.angle, pen.pressure, menuTexture);
        }
      } else if (menuBrushTool === "Round Line Tool" || menuBrushTool === "Fan Line Tool") {
        buffer.stroke(brushHex);
        drawWithLine(buffer, 0, 0, 40, 0, cornerPreviewBrushSize);
      } else if (menuBrushTool === "Sharp Line Tool" || menuBrushTool === "Brush Tool") {
        drawWithConnection(buffer, -20, 0, pen.startAngle, pen.startPressure, 60, 0, pen.angle, pen.pressure, cornerPreviewBrushSize, menuTexture, 0);
      } else {
        buffer.stroke(brushHex);
        drawWithPlaceholder(buffer, 0, 0, 40, 0, cornerPreviewBrushSize);
      }
    }

    buffer.pop();

    if (spotY > 0) {
      buffer.textAlign(CENTER);
      buffer.stroke(brushHex);
      buffer.strokeWeight(3);
      buffer.fill(onBrushHex);
      if (brushTool === menuBrushTool && texture === menuTexture) {
        
      }
      buffer.text(menuName, 0, 0 + 60*spotY, 80, 60 - 6);
      buffer.textFont(fontMedium);
      buffer.noStroke();
      buffer.strokeWeight(6);
    }
    buffer.textAlign(LEFT);
  }


  function topButton(text, x, condition) {

    buffer.fill(visHex+"30");
    buffer.rect(x+3, 0, topButtonWidth-6, 60, 0, 0, 20, 20)
    if (condition === false) {
      buffer.fill(visHex+"50");
    } else {
      buffer.fill(visHex);
    }
    buffer.text(text, x, 0, topButtonWidth, 60 - 8);
  }

  // top menu buttons
  buffer.textAlign(CENTER);
  buffer.textFont(fontMedium);
  buffer.fill(visHex);

  const topButtonWidth = 80;
  // topButton("tools", 0);
  topButton("undo", topButtonWidth*0, !paintingState.containsNewStroke);
  topButton("edit", topButtonWidth*1);
  topButton("clear", width-topButtonWidth*2);
  topButton("save", width-topButtonWidth*1);
  
  buffer.textAlign(LEFT);
  buffer.textFont(fontMedium);


  // draw the sliders at the top
  const drawSliders = (width > 980);
  const sliderStart = width/2 - 300;

  if (drawSliders) {
    drawGradientSlider(sliderStart, 0, 200, 60,     [0.0, brushSaturation, brushHue], [1.0, brushSaturation, brushHue], brushLuminance);
    drawGradientSlider(sliderStart+200, 0, 200, 60, [brushLuminance, 0.0, brushHue], [brushLuminance, 1.0, brushHue], brushSaturation);
    drawGradientSlider(sliderStart+400, 0, 200, 60, [brushLuminance, brushSaturation, 0.0], [brushLuminance, brushSaturation, 1.0], brushHue);
    if (refHue !== undefined) {
      drawGradientSlider(sliderStart, 0, 200, 10,     [0.0, refSaturation, refHue], [1.0, refSaturation, refHue], refLuminance);
      drawGradientSlider(sliderStart+200, 0, 200, 10, [refLuminance, 0.0, refHue], [refLuminance, 1.0, refHue], refSaturation);
      drawGradientSlider(sliderStart+400, 0, 200, 10, [refLuminance, refSaturation, 0.0], [refLuminance, refSaturation, 1.0], refHue);
      buffer.fill(componentsToHex(refLuminance, refSaturation, refHue));
    } else {
      buffer.fill(componentsToHex(brushLuminance, brushSaturation, brushHue));
    }
    // buffer.rect(sliderStart-60, 0, 60, 60);
    
    drawRoundColorExampleWithVariation(55, sliderStart - 30, 30);
  }


  // bottom left/ top middle text
  buffer.fill(visHex);

  if (activeInputGadget === "lumAndChr"
    || activeInputGadget === "hue" 
    || activeInputGadget === "eyedropper") {

    const newColorText = "okHSL:" + 
      brushHue.toFixed(3) + ", " + 
      brushSaturation.toFixed(3) + ", " + 
      brushLuminance.toFixed(3) + "  noise:" + 
      brushColorVar.toFixed(3) + "";

    buffer.textAlign(CENTER);
    buffer.text(newColorText, width/2, 60 + 20 - 6);
    
    if (refLuminance !== undefined) {
      buffer.fill(componentsToHex(lessTextLum, min(bgChroma, 0.2), bgHue));

      const refColorText = "okHSL:" + 
        refHue.toFixed(3) + ", " + 
        refSaturation.toFixed(3) + ", " + 
        refLuminance.toFixed(3) + "  noise:" + 
        refVar.toFixed(3) + "";

      buffer.text(refColorText, width/2, 60 + 40 - 6);
    }
  } else if (menuState.topSliderDeltaX !== undefined) {
    const xFromLeftEdgeOfSliders = menuState.topSliderStartX + 360 - width/2;
    const xFromLeftWithDelta = xFromLeftEdgeOfSliders + menuState.topSliderDeltaX;
    let section = undefined;
    let sectionValue = undefined;
    let sectionValueText = "";

    if (xFromLeftEdgeOfSliders < 60) {
      section = "var";
      sectionValue = constrain(refVar + menuState.topSliderDeltaX * 0.002, 0, 1);
      if (!isNaN(sectionValue)) brushColorVar = sectionValue;
      sectionValueText = Math.floor(brushColorVar * 100) + "%";
    } else if (xFromLeftEdgeOfSliders < 260) {
      section = "luminance";
      sectionValue = map(xFromLeftWithDelta, 60, 260, 0, 1.0, true);
      brushLuminance = sectionValue;
      sectionValueText = Math.floor(brushLuminance * 100) + "%";
    } else if (xFromLeftEdgeOfSliders < 460) {
      section = "chroma";
      sectionValue = map(xFromLeftWithDelta, 260, 460, 0, 1.0, true);
      brushSaturation = sectionValue;
      sectionValueText = Math.floor(brushSaturation * 100) + "%";
    } else if (xFromLeftEdgeOfSliders < 660) {
      section = "hue";
      sectionValue = map(xFromLeftWithDelta, 460, 660, 0, 1.0);
      if (sectionValue > 1) sectionValue %= 1;
      if (sectionValue < 0) sectionValue = 1-(Math.abs(sectionValue) % 1);
      brushHue = sectionValue;
      sectionValueText = Math.floor(brushHue*360);
    } else {
      section = "size";
      sectionValue = constrain(refSize + menuState.topSliderDeltaX * 0.5, 4, 600);
      if (!isNaN(sectionValue)) brushSize = sectionValue;
      sectionValueText = Math.round(easedSize);
    }

    buffer.textAlign(CENTER);
    buffer.text(section + ": " + sectionValueText, width/2, 60 + 20 - 6);
  }

  buffer.textAlign(LEFT);
  buffer.fill(visHex);
  const controlsInfo = (isTouchControl !== false) ? "(ignore touch draw: on)" : "KEYS 1/2/3/4 TO ADJUST"
  buffer.text(controlsInfo, 20, height - 20 - 12);

  // draw the size indicator
  if (drawSliders) {
    buffer.drawingContext.save();
    buffer.fill(bgHex);
    buffer.rect(sliderStart + 600, 0, 60, 60);
    buffer.drawingContext.clip();
    buffer.fill(componentsToHex(brushLuminance, brushSaturation, brushHue));
    drawStamp(buffer, sliderStart + 630, 30, easedSize, pen.angle, pen.pressure, texture);
    buffer.noFill();
    buffer.stroke(visHex);
    buffer.strokeWeight(1);
    buffer.ellipse(sliderStart + 630, 30, easedSize, easedSize)
    buffer.drawingContext.restore();
    buffer.noStroke();
    buffer.fill(visHex);
    buffer.textSize(11);
    buffer.textAlign(CENTER);
    buffer.text(Math.round(easedSize), sliderStart + 600 + 30, 10 + 18);
  }


  //reset text size
  buffer.textSize((width < height) ? 13 : 16);

  // draw rectangle around stroke being edited
  if (editMode && penRecording.length > 0) {
    // change from canvas to screen space
    buffer.push();
    buffer.translate(paintingState.x(), paintingState.y());

    const margin = (["Triangle Tool", "Lasso Tool", "Mirror Tool"].includes(brushTool)) ? 0 : easedSize*0.5;
    const xmin = penRecording.reduce((a, b) => Math.min(a, b.x),  Infinity) - margin;
    const xmax = penRecording.reduce((a, b) => Math.max(a, b.x), -Infinity) + margin;
    const ymin = penRecording.reduce((a, b) => Math.min(a, b.y),  Infinity) - margin;
    const ymax = penRecording.reduce((a, b) => Math.max(a, b.y), -Infinity) + margin;
  
    buffer.stroke(componentsToHex(bgLuminance, bgChroma, bgHue));
    buffer.strokeWeight(3);
    buffer.line(xmin, ymin, xmax, ymin);
    buffer.line(xmin, ymin, xmin, ymax);
    buffer.line(xmin, ymax, xmax, ymax);
    buffer.line(xmax, ymin, xmax, ymax);
    buffer.stroke(visHex);
    buffer.strokeWeight(1);
    buffer.line(xmin, ymin, xmax, ymin);
    buffer.line(xmin, ymin, xmin, ymax);
    buffer.line(xmin, ymax, xmax, ymax);
    buffer.line(xmax, ymin, xmax, ymax);
    buffer.strokeWeight(6);
    buffer.noStroke();

    buffer.pop();
  }


  // depending on input mode, draw the right gadget
  drawActiveGadget();

  // draw the hover preview
  if ((activeInputGadget === "draw") && (isTouchControl === false) && !pen.isDown && !editMode && !pointerDown
    && hover.x > 0 && hover.x < paintingState.width() && hover.y > 0 && hover.y < paintingState.height()
  ) {

    // change from canvas to screen space
    buffer.push();
    buffer.translate(paintingState.x(), paintingState.y());

    // draw hover stamp at the pen position
    if (brushTool === "Stamp Tool") {
      drawBrushstroke(buffer, hover.x, hover.y, easedSize, hover.angle, undefined, texture);
    } else if (brushTool === "Round Line Tool" || brushTool === "Fan Line Tool") {
      drawCrosshair(easedSize, hover.x, hover.y);
      buffer.stroke(currentBrushToHex(hover.x * hover.y));
      drawWithLine(buffer, hover.x, hover.y, hover.x, hover.y, easedSize)
    } else if (brushTool === "Sharp Line Tool" || brushTool === "Brush Tool") {
      if (hover.lastX !== undefined && hover.lastY !== undefined) {
        drawWithConnection(buffer, hover.lastX, hover.lastY, hover.angle, undefined, hover.x, hover.y, hover.angle, undefined, easedSize, texture, 0);
      }
    }
    buffer.pop();
  }


  // end of redrawInterface

  function drawActiveGadget() {

    if (activeInputGadget === "eyedropper") {
      buffer.fill(brushHex);
      const easedSize = easeInCirc(brushSize, 4, 600);
      const screenX = (!pen.isDown) ? menuState.screenHoverX : menuState.screenPointerX;
      const screenY = (!pen.isDown) ? menuState.screenHoverY : menuState.screenPointerY;
      if (pen.isDown) drawStamp(buffer, screenX, screenY, easedSize, pen.angle, pen.pressure, texture);
      drawCrosshair(easedSize, screenX, screenY);
    }

    // draw the brush setting gadgets
    const useBaseX = (refScreenHoverX !== undefined) ? refScreenHoverX : refScreenPointerX;
    const useBaseY = (refScreenHoverY !== undefined) ? refScreenHoverY : refScreenPointerY;

    if (useBaseX === undefined || useBaseY === undefined) return;

    buffer.noStroke();
    buffer.fill(brushHex);

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
          buffer.stroke(antiVisHex);
          buffer.strokeWeight(20);
          buffer.line(x, y, x+centerOffset*xDir, y+centerOffset*yDir)
          buffer.noStroke();
          buffer.fill(antiVisHex);
        } else {
          buffer.fill(antiVisHex+"C0");
        }
        buffer.ellipse(x+centerOffset*xDir, y+centerOffset*yDir, size, size);
        buffer.fill(visHex);

        const posX = x+centerOffset*xDir;
        const posY = y+centerOffset*yDir;
        // icons or text
        if (text === "H") {
          buffer.strokeWeight(8);

          let startVarArr = [brushLuminance, brushSaturation, brushHue, 1];
          let endVarArr   = [brushLuminance, brushSaturation, brushHue, 0];
          drawGradientLine(posX, posY - size/3, posX, posY + size/3, startVarArr, endVarArr, size);

          let startHueArr = [brushLuminance, brushSaturation, 0 + refHue - 0.5];
          let endHueArr   = [brushLuminance, brushSaturation, 1 + refHue - 0.5];
          drawGradientLine(posX - size/3, posY, posX + size/3, posY, startHueArr, endHueArr, size);
          
          buffer.noStroke();

        } else if (text === "LC") {
          buffer.strokeWeight(8);

          let startLumArr = [1.0, brushSaturation, brushHue];
          let endLumArr   = [0.0, brushSaturation, brushHue];
          drawGradientLine(posX, posY - size/3, posX, posY + size/3, startLumArr, endLumArr, size);

          let startChromaArr = [brushLuminance, 0.0, brushHue];
          let endChromaArr   = [brushLuminance, 1.0, brushHue];
          drawGradientLine(posX - size/3, posY, posX + size/3, posY, startChromaArr, endChromaArr, size);
          
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
      buffer.ellipse(0, 0, constrain(easeInCirc(brushSize, 4, 600), 8, gadgetRadius/3)+2)

      // var
      buffer.stroke("black");
      buffer.strokeWeight(16);
      buffer.line(0, radius*2 * (brushColorVar - 1), 0, radius*2 * brushColorVar);

      let startVarArr = [brushLuminance, brushSaturation, brushHue, 1.0];
      let endVarArr   = [brushLuminance, brushSaturation, brushHue, 0.0];
      buffer.strokeWeight(14);
      drawGradientLine(0, radius*2 * (brushColorVar - 1), 0, radius*2 * brushColorVar, startVarArr, endVarArr, gadgetRadius);

      // hue
      // stay centered since hue is a circle anyway
      buffer.stroke("black");
      buffer.strokeWeight(16);
      // let deltaHue = brushHue - refHue;
      // if (deltaHue < 0) deltaHue += 1.0;
      // if (deltaHue > 1) deltaHue % 1;
      // deltaHue += 0.5;
      buffer.line(radius*2 * -0.5, 0, radius*2 * (1-0.5), 0);

      let startHueArr = [brushLuminance, brushSaturation, brushHue - 0.5];
      let endHueArr   = [brushLuminance, brushSaturation, brushHue + 0.5];
      buffer.strokeWeight(14);
      drawGradientLine(radius*2 * -0.5, 0, radius*2 * (1-0.5), 0, startHueArr, endHueArr, gadgetRadius);

      buffer.pop();

      // Show color at reference position
      const currentColorSize = constrain(easeInCirc(brushSize, 4, 600), 8, gadgetRadius/3);
      drawRoundColorExampleWithVariation(currentColorSize, ankerX, ankerY);

    } else if (activeInputGadget === "lumAndChr") {

      const radius = gadgetRadius;
      buffer.push();
      buffer.translate(ankerX, ankerY);

      buffer.fill("black")
      buffer.ellipse(0, 0, constrain(easeInCirc(brushSize, 4, 600), 8, gadgetRadius/3)+2)

      let startLumArr = [1.0, brushSaturation, brushHue];
      let endLumArr   = [0.0, brushSaturation, brushHue];
      buffer.stroke("black");
      buffer.strokeWeight(16);
      buffer.line(0, radius*2 * (-1 + brushLuminance), 0, radius*2 * brushLuminance);
      buffer.strokeWeight(14);
      drawGradientLine(0, radius*2 * (-1 + brushLuminance), 0, radius*2 * brushLuminance, startLumArr, endLumArr, gadgetRadius);

      let startChromaArr = [brushLuminance, 0.0, brushHue];
      let endChromaArr   = [brushLuminance, 1.0, brushHue];
      buffer.stroke("black");
      buffer.strokeWeight(16);
      buffer.line(radius*2 * -brushSaturation, 0, radius*2 * (1-brushSaturation), 0);
      buffer.strokeWeight(14);
      drawGradientLine(radius*2 * -brushSaturation, 0, radius*2 * (1-brushSaturation), 0, startChromaArr, endChromaArr, gadgetRadius);
      
      buffer.pop();

      // Show color at reference position
      const currentColorSize = constrain(easeInCirc(brushSize, 4, 600), 8, gadgetRadius/3);
      drawRoundColorExampleWithVariation(currentColorSize, ankerX, ankerY);

    } else if (activeInputGadget === "size") {

      // scale
      const lineBaseY = ankerY - gadgetRadius;
      const lineAddY = gadgetRadius * 2 * map(brushSize, 4, 600, 0, 1);
      const lineTranslateY = lineBaseY + lineAddY;

      const posX = ankerX - 40;
      const minDotSize = 4;
      const maxDotSize = 20;

      buffer.fill(visHex);
      buffer.ellipse(posX, lineTranslateY + gadgetRadius, minDotSize);
      buffer.fill(visHex);
      buffer.ellipse(posX, lineTranslateY + 0.5 * gadgetRadius, easeInCirc(lerp(minDotSize, maxDotSize, 0.25), minDotSize, maxDotSize));
      buffer.ellipse(posX, lineTranslateY + 0.0 * gadgetRadius, easeInCirc(lerp(minDotSize, maxDotSize, 0.5), minDotSize, maxDotSize));
      buffer.ellipse(posX, lineTranslateY - 0.5 * gadgetRadius, easeInCirc(lerp(minDotSize, maxDotSize, 0.75), minDotSize, maxDotSize));
      buffer.fill(visHex);
      buffer.ellipse(posX, lineTranslateY - gadgetRadius, maxDotSize);

      buffer.fill(brushHex);
      const easedSize = easeInCirc(brushSize, 4, 600);
      drawStamp(buffer, posX, ankerY, easedSize, pen.angle, pen.pressure, texture);
      drawCrosshair(easedSize, posX, ankerY);
    }
  }

  function drawRoundColorExampleWithVariation(size, x, y) {
    buffer.fill(brushHex);
    buffer.ellipse(x, y, size);

    const varSegments = 48;
    for (let i = 0; i < varSegments; i++) {
      const start = (TWO_PI / varSegments) * i;
      const stop = start + TWO_PI / varSegments; 
      const varHex = currentBrushToHex(i);
      buffer.fill(varHex);
      buffer.arc(x, y, size, size, start, stop);
    }
  }

  function drawCrosshair(size, x, y) {
    // draw the crosshair
    buffer.strokeWeight(2);
    const outerLuminance = (brushLuminance > 0.5) ? 0.0 : 1.0;
    buffer.stroke(componentsToHex(outerLuminance, 0.0, 0));
  
    buffer.line(x, y - size*0.5, x, y - size*0.5 - 6);
    buffer.line(x, y + size*0.5, x, y + size*0.5 + 6);
    buffer.line(x - size*0.5, y, x - size*0.5 - 6, y);
    buffer.line(x + size*0.5, y, x + size*0.5 + 6, y);
  
    // reset
    buffer.strokeWeight(6);
    buffer.noStroke();
  }

  function drawGradientLine(xStart, yStart, xEnd, yEnd, startArr, endArr, radius) {
    const segments = Math.floor(radius)/2;
    let lastX = xStart;
    let lastY = yStart;
    for (let i = 1; i < segments + 1; i++) {
      const toX = lerp(xStart, xEnd, i / segments);
      const toY = lerp(yStart, yEnd, i / segments);
      const colorLerpAmt = (i - 0.5) / segments;
      const mixedOkLCH = lerpedComponentsToHex(startArr, endArr, colorLerpAmt);
  
      buffer.stroke(mixedOkLCH);
      buffer.line(lastX, lastY, toX, toY);
  
      lastX = toX;
      lastY = toY;
    }
  }

  function drawGradientSlider(x, y, width, height, startArr, endArr, sliderPercent) {
    const segments = width;
    const currentSegment = Math.round(segments * sliderPercent);

    for (let i = 0; i < segments; i++) {
      const colorLerpAmt = (i + 0.5) / segments;
      const mixedOkLCH = lerpedComponentsToHex(startArr, endArr, colorLerpAmt);

      const curvedHeight = height * Math.min((1 - Math.abs((i/segments)-0.5) * 2) * 6, 1) ** 0.12
  
      buffer.fill(mixedOkLCH);
      buffer.rect(x + (i/segments) * width, y, width/segments, curvedHeight);

      if (i === currentSegment) {
        buffer.fill("#ffffffc0");
        buffer.rect(x + (i/segments) * width, y, width/segments, curvedHeight);
      }
      if (i+1 === currentSegment) {
        buffer.fill("#000000c0");
        buffer.rect(x + (i/segments) * width, y, width/segments, curvedHeight);
      }
    }
  }

  // function drawHueCircle(center, radius, numSegments, luminance, chroma, rotateAngle) {
  //   let segmentAngle = TWO_PI / numSegments; // angle of each segment
  
  //   for (let i = 0; i < numSegments; i++) {
  //     let cHue = map(i, 0, numSegments, 0, 1); // map segment index to hue value
  //     let brushHex = componentsToHex(luminance, chroma, cHue);
  //     buffer.stroke(brushHex); // set stroke color based on hue
  //     let startAngle = i * segmentAngle + rotateAngle; // starting angle of segment
  //     let endAngle = startAngle + segmentAngle; // ending angle of segment
  //     let start = createVector(
  //       cos(startAngle) * radius,
  //       sin(startAngle) * radius
  //     ); // starting point of segment
  //     let end = createVector(cos(endAngle) * radius, sin(endAngle) * radius); // ending point of segment
  //     start.add(center); // add center point to starting point
  //     end.add(center); // add center point to ending point
  //     buffer.line(start.x, start.y, end.x, end.y); // draw segment
  //   }
  // }
}

function lerpedComponentsToHex(startArr, endArr, colorLerpAmt) {
  const mixedArr = [
    lerp(startArr[0], endArr[0], colorLerpAmt),
    lerp(startArr[1], endArr[1], colorLerpAmt),
    lerp(startArr[2], endArr[2], colorLerpAmt),
  ];

  // show hue variation increasing instead
  if (startArr[3] !== undefined) {
    const lerpedVar = lerp(startArr[3], endArr[3], colorLerpAmt);
    return componentsToHex(mixedArr[0], mixedArr[1], mixedArr[2], {seed: colorLerpAmt, strength: lerpedVar});
  }

  return componentsToHex(mixedArr[0], mixedArr[1], mixedArr[2]);
}

function componentsToHex(l, s, h, varObject) {

  if (varObject !== undefined) {
    l += noiseValues256[Math.floor(varObject.seed*300     ) % noiseValues256.length] * easedLumaVar(varObject.strength);
    h += noiseValues256[Math.floor(varObject.seed*400 + 50) % noiseValues256.length] * easedHueVar(varObject.strength);
  }

  l = Math.max(0, l);
  l = Math.min(1, l);

  const colArr = okhsl_to_srgb(h, s, l);
  return rgb_to_hex(colArr[0], colArr[1], colArr[2]);
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

function easedHueVar(brushVar) {

  if (brushVar === undefined) return 0;

  // for low chroma, use the no curve amount of hue variation (more intense)
  // for high chroma, use the curve (less intense)
  return lerp(
    brushVar,
    easeInCirc(brushVar),
    easeOutCubic(brushSaturation)
  );
}

function easedLumaVar(lumaVar) {
  if (lumaVar === undefined) return 0;

  return lerp(easeInCirc(lumaVar), lumaVar, 0.1);
  // lerp(
  //   lumaVar,
  //   easeInCirc(lumaVar),
  //   easeOutCubic(brushLuminance)
  // );
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
