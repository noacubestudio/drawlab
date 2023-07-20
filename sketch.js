let cnv;

// render the painting and visuals separately
let paintingBuffer;
let interfaceBuffer;
let newStrokeBuffer;

// background color settings
let bgHue = 0;
let bgChroma = 0.0;
let bgLuminance = 0.8;

// reference of previous brush settings for relative change
let refX;
let refY;
let refAlt;
let refAngle;

let refHue;
let refVar;
let refChroma;
let refLuminance;
let refSize;
let gadgetRadius; // based on canvas size

// menu
let toolPresets = [
  {brush: "Stamp Tool", texture: "Rounded", menuName: "Round S"},
  {brush: "Stamp Tool", texture: "Rake", menuName: "Rake S"},
  {brush: "Sharp Line Tool", texture: "Regular", menuName: "Sharp L"},
  {brush: "Sharp Line Tool", texture: "Rake", menuName: "Rake L"},
  {brush: "Round Line Tool", texture: undefined, menuName: "Round L"},
  {brush: "Fan Line Tool", texture: undefined, menuName: "Fan"},
  {brush: "Triangle Tool", texture: undefined, menuName: "Triangle"},
  {brush: "Lasso Tool", texture: undefined, menuName: "Lasso"},
  {brush: "Mirror Tool", texture: undefined, menuName: "Mirror"},
];
let toolMenuOpened = false;

// current brush settings for drawing
let brushHue = 300;
let brushVar = 80;
let brushChroma = 0.15;
let brushLuminance = 0.7;
let brushSize = 200;
let brushTool = toolPresets[0].brush;
let texture = toolPresets[0].texture;

// save 128 random 0-1 values here for consistent noise that stays between redraws
let varStrengths = [];

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
  startedEventOnMenu: false
};


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
  paintingBuffer = createGraphics(width, height);
  newStrokeBuffer = createGraphics(width, height);
  if ((width * displayDensity()) > 3000) {
    paintingBuffer.pixelDensity(1);
    newStrokeBuffer.pixelDensity(1);
  }
  paintingBuffer.background(okhex(bgLuminance, bgChroma, bgHue));
  document.body.style.backgroundColor = okhex(bgLuminance*0.9, bgChroma*0.5, bgHue);

  // Create a graphics buffer for the indicator
  interfaceBuffer = createGraphics(width, height);
  interfaceBuffer.strokeWeight(6);
  interfaceBuffer.textFont("monospace");
  interfaceBuffer.textAlign(LEFT, CENTER);
  newInterfaceSize();

  // new random noise
  varStrengths = Array.from({ length: 128 }, () => random(-1, 1));
  
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
    print("Device detected as desktop due to pointer move");
  }
  if (isTouchControl) return;
  updateInput(event);
  draw();
}

function updateInput(event) {

  const startEventTypes = ["pointerdown", "touchstart"];
  const endEventTypes = ["pointerup", "pointercancel", "touchend", "touchcancel"];

  // menu first
  const menuW = 100;
  const menuH = 60 + ((toolMenuOpened) ? 60 * toolPresets.length : 0);
  
  function tappedInMenu(x, y) {
    if (!startEventTypes.includes(event.type)) return;

    if (x < menuW && y < menuH) {
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
      } else {
        toolMenuOpened = !toolMenuOpened;
      }
      menuState.startedEventOnMenu = true;
      return true;
    }

    // anything besides tools menu
    if (y < 60) {
      if (x > menuW && x < menuW*2) {
        doAction("undo");
      } else if (x > menuW*2 && x < menuW*3) {
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
    
    hover.lastX = hover.x;
    hover.lastY = hover.y;
    hover.x = undefined;
    hover.y = undefined;

    if (pen.isDown) {
      pen.x = event.clientX;
      pen.y = event.clientY;
  
      // update pressure and angle
      if (event.pointerType === "pen") {
        if (event.pressure > 0) pen.pressure = event.pressure;
        pen.angle = tiltToAngle(event.tiltX, event.tiltY);
        // altitude, wip
      }
    } else if (!pointerDown) {
      hover.x = event.clientX;
      hover.y = event.clientY;

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
        pen.x = touch.clientX;
        pen.y = touch.clientY;
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
    // leave edit mode
    if (editMode) {
      editMode = false;
      // don't even send this as a confirm to draw
      pen.wasDown = false;
    }
    pen.lastX = undefined;
    pen.lastY = undefined;

    const penDownDuration = event.timeStamp - pen.startTimeStamp;
    const penDownBounds = dist(pen.startX, pen.startY, pen.x, pen.y);

    const didNotDraw = (penDownDuration < 200 && penDownBounds < 20) || (penDownBounds < 2);

    // was drawing, but only short
    if (menuState.onPage === 0 && didNotDraw) {
      doAction("undo");
      menuState.onPage = 1;
    } else if (menuState.onPage > 0) {
      if (menuState.onPage > 1) menuState.lastGadgetPage = menuState.onPage;
      menuState.onPage = 0;
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
    penRecording = [];
    editMode = false;

  } else if (action === "clear") {

    [bgLuminance, brushLuminance] = [brushLuminance, bgLuminance];
    [bgChroma, brushChroma] = [brushChroma, bgChroma];
    [bgHue, brushHue] = [brushHue, bgHue];

    newStrokeBuffer.clear();
    penRecording = [];
    editMode = false;

    paintingBuffer.background(okhex(bgLuminance, bgChroma, bgHue));
    document.body.style.backgroundColor = okhex(bgLuminance*0.9, bgChroma*0.5, bgHue);

  } else if (action === "save") {

    saveCanvas(paintingBuffer, "drawlab-canvas", "png");

  } else if (action === "edit") {

    editMode = !editMode;
    
  }
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
        // don't draw on initial spot as a WIP pressure fix
        // commit the new stroke to the painting and clear the buffer
        paintingBuffer.image(newStrokeBuffer, 0, 0);
        newStrokeBuffer.clear();
      } else {
        // draw to the stroke buffer immediately
        if ((brushTool === "Stamp Tool" || brushTool === "Fan Line Tool") && pen.isDown) {
          drawInNewStrokeBuffer(newStrokeBuffer, pen.startX, pen.startY, pen.startAngle, undefined, pen.x, pen.y, pen.angle, pen.pressure, penRecording)

        } else if (!pen.isDown && pen.wasDown) {
          // drawn when pen lifted
          drawInNewStrokeBuffer(newStrokeBuffer, pen.startX, pen.startY, pen.startAngle, undefined, pen.x, pen.y, pen.angle, pen.pressure, penRecording)
        }
      }
    } else if (editMode && pen.isDown) {
      const xDiff = pen.x-pen.lastX;
      const yDiff = pen.y-pen.lastY;
      redrawLastStroke(newStrokeBuffer, xDiff, yDiff);
    }
  }

  // draw the UI to the ui buffer
  redrawInterface(interfaceBuffer, currentInputMode); 

  // draw the painting buffer
  if (paintingBuffer !== undefined) image(paintingBuffer, 0, 0);

  // draw the last brushstroke buffer
  if (newStrokeBuffer !== undefined) image(newStrokeBuffer, 0, 0);

  // draw the indicator buffer in the top left corner
  if (interfaceBuffer !== undefined) image(interfaceBuffer, 0, 0);
}

function clearBrushReference() {
  refX = undefined;
  refY = undefined;
  refHue = undefined;
  refChroma = undefined;
  refLuminance = undefined;
  refSize = undefined;
  refVar = undefined;
  refAlt = undefined;
  refAngle = undefined;
  refHoverX = undefined;
  refHoverY = undefined;
}

function updateBrushReferenceFromInput() {
  // starting position
  refX      ??= pen.x;
  refY      ??= pen.y;
  refAlt    ??= pen.altitude;
  refAngle  ??= pen.angle;
  refHoverX ??= hover.x;
  refHoverY ??= hover.y;
  // starting brush settings
  refHue       ??= brushHue;
  refChroma    ??= brushChroma;
  refLuminance ??= brushLuminance;
  refSize      ??= brushSize;
  refVar       ??= brushVar;
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

  const easedSize = easeInCirc(brushSize, 4, 600);

  if (brushTool === "Stamp Tool") {

    drawBrushstroke(buffer, endX, endY, easedSize, endAngle, endPressure, texture);

  } else if (brushTool === "Fan Line Tool") {

    // one color variation for each line instance
    buffer.stroke(brushHexWithHueVarSeed(endX * endY));
    drawWithLine(buffer, startX, startY, endX, endY, easedSize);

  } else if (brushTool === "Round Line Tool") {

    // one color variation for each line instance
    buffer.stroke(brushHexWithHueVarSeed(startX * startY));
    drawWithLine(buffer, startX, startY, endX, endY, easedSize);

  } else if (brushTool === "Sharp Line Tool") {

    drawWithSharpLine(buffer, startX, startY, startAngle, startPressure, endX, endY, endAngle, endPressure, easedSize, texture);

  } else if (brushTool === "Triangle Tool") {

    // one color variation for each line instance
    buffer.fill(brushHexWithHueVarSeed(startX * startY));
    drawwithTriangle(buffer, startX, startY, endX, endY, recording, easedSize);

  } else if (brushTool === "Lasso Tool") {

    // one color variation for each line instance
    buffer.fill(brushHexWithHueVarSeed(startX * startY));
    drawwithLasso(buffer, startX, startY, endX, endY, recording, easedSize);

  } else if (brushTool === "Mirror Tool") {

    // one color variation for each line instance
    buffer.fill(brushHexWithHueVarSeed(startX * startY));
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
    brushChroma = map(deltaX + rangeX * (refChroma * 2), 0, rangeX, 0, 0.5, true);
    brushLuminance = map(-deltaY + rangeY * refLuminance, 0, rangeY, 0, 1, true);

  } else if (currentInputMode === "hue") { // '1', hue and hue variation

    // Get positions
    let deltaX = pen.x - (penMode ? pen.startX : refX);
    let deltaY = pen.y - (penMode ? pen.startY : refY);

    let rangeX = gadgetRadius * 2;
    let rangeY = gadgetRadius * 2;

    brushHue = map(deltaX + rangeX * (refHue / 360), 0, rangeX, 0, 360);
    if (brushHue > 360) brushHue %= 360;
    if (brushHue < 0) brushHue += 360;

    brushVar = map(-deltaY + rangeY * refVar/360, 0, rangeY, 0, 360, true);


    // // Compute circle center position from reference
    // const startAngle = TWO_PI * (refHue / 360) - HALF_PI;
    // const startRadius = gadgetRadius * (1 - refVar / 360);
    // const centerX = (penMode ? pen.startX : refX) - cos(startAngle) * startRadius;
    // const centerY = (penMode ? pen.startY : refY) - sin(startAngle) * startRadius;

    // // Compute new angle and distance based on that center
    // const angle = atan2(pen.y - centerY, pen.x - centerX);
    // const radius = constrain(dist(pen.x, pen.y, centerX, centerY), 0, gadgetRadius);

    // brushHue = (degrees(angle) + 90) % 360;
    // brushVar = (1 - radius / gadgetRadius) * 360;

    // if (brushHue < 0) brushHue += 360;

  } else if (currentInputMode === "size") {

    const deltaY = pen.y - (penMode ? pen.startY : refY);
    const rangeY = gadgetRadius * 2;

    brushSize = map(-deltaY + rangeY * map(refSize, 4, 600, 0, 1), 0, rangeY, 4, 600, true);
  
  } else if (currentInputMode === "eyedropper") {
    paintingBuffer.image(newStrokeBuffer, 0, 0);
    newStrokeBuffer.clear();

    const colorArray = paintingBuffer.get(pen.x, pen.y);
    const oklchArray = chroma(colorArray.slice(0,3)).oklch();

    // default to current hue if gray
    if (isNaN(oklchArray[2])) oklchArray[2] = brushHue;

    // replace brush with new colors
    [brushLuminance, brushChroma, brushHue] = oklchArray;
  }
}

function drawBrushstroke(buffer, x, y, size, angle, pressure, texture) {
  buffer.noStroke();

  // draw bigger version behind to give some extra detail
  if (texture === "Rounded") {
    const rainbow = okhex(
      brushLuminance*0.98,
      brushChroma,
      brushHue + varStrengths[(x * y) % varStrengths.length] * easedHueVar(brushVar)
    );
    buffer.fill(rainbow);
    drawStamp(buffer, x, y, size*1.05, angle, pressure, texture);
  }
  

  // one color variation for each stamp instance
  const brushHex = brushHexWithHueVarSeed(x + y);
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
      const brushHex = brushHexWithHueVarSeed(i + Math.round((angle !== undefined) ? angle*6 : 0));
      buffer.fill(brushHex);

      buffer.ellipse(0, rakeY, circleSize);
    }
  }
  

  buffer.pop();
}

function brushHexWithHueVarSeed(seed) {
  return okhex(
    brushLuminance,
    brushChroma,
    brushHue + varStrengths[seed % varStrengths.length] * easedHueVar(brushVar)
  );
}

function drawWithLine(buffer, xa, ya, xb, yb, size) {
  if (xa === undefined || ya === undefined || xb === undefined || yb === undefined) return;

  // draw the line rect
  buffer.strokeWeight(size);
  buffer.line(xa, ya, xb, yb);

  buffer.strokeWeight(6);
  buffer.noStroke();
}


function drawWithSharpLine(buffer, startX, startY, startAngle, startPressure, endX, endY, endAngle, endPressure, size, texture) {
  if (startX === undefined || startY === undefined || endX === undefined || endY === undefined) return;

  startAngle ??= p5.Vector.angleBetween(createVector(0, -1), createVector(endX-startX, endY-startY));
    endAngle ??= p5.Vector.angleBetween(createVector(0, -1), createVector(endX-startX, endY-startY));

  buffer.noStroke();

  if (texture === "Rake") {
    // if the brush size is small relative to the painting size, use less circles, if it's big use more
    const steps = Math.floor(map(size, 4, 300, 3, 24));
    const startGapSize = 0.6 // (startPressure !== undefined) ? map(startPressure, 0.0, 0.2, 3.0, 0.0, true) : 1.0;
    const   endGapSize = 1.4 // (  endPressure !== undefined) ? map(  endPressure, 0.0, 0.2, 3.0, 0.0, true) : 1.0;

    // calculate the actual sizes
    const startCircleSize = size / ((steps-1)*startGapSize + steps);
    const   endCircleSize = size / ((steps-1)*  endGapSize + steps);

    for (let i = 0; i < steps; i++) {
      const brushHex = brushHexWithHueVarSeed(startX + startY + i);
      buffer.fill(brushHex);
  
      const startEdgeOffset = size * -0.5 + (i) * (startGapSize*startCircleSize + startCircleSize);
      const endEdgeOffset   = size * -0.5 + (i) * (  endGapSize*  endCircleSize +   endCircleSize);
  
      startEdgeVectorLower  = p5.Vector.fromAngle(startAngle, startEdgeOffset);
      endEdgeVectorLower    = p5.Vector.fromAngle(endAngle, endEdgeOffset);
      startEdgeVectorHigher = p5.Vector.fromAngle(startAngle, startEdgeOffset + startCircleSize);
      endEdgeVectorHigher   = p5.Vector.fromAngle(endAngle, endEdgeOffset + endCircleSize);
  
      const rf = size * easedHueVar(brushVar)/360 * 0.5;

      buffer.beginShape();
      buffer.vertex(startX + random(-rf,rf) + startEdgeVectorLower.x,  startY + random(-rf,rf) + startEdgeVectorLower.y);
      buffer.vertex(startX + random(-rf,rf) + startEdgeVectorHigher.x, startY + random(-rf,rf) + startEdgeVectorHigher.y);
      buffer.vertex(endX   + random(-rf,rf) + endEdgeVectorHigher.x,   endY   + random(-rf,rf) + endEdgeVectorHigher.y);
      buffer.vertex(endX   + random(-rf,rf) + endEdgeVectorLower.x,    endY   + random(-rf,rf) + endEdgeVectorLower.y);
      buffer.endShape();
    }
  } else {
    const steps = map(size, 4, 300, 5, 36);
    for (let i = 0; i < steps; i++) {
      const brushHex = brushHexWithHueVarSeed(startX + startY + i);
      buffer.fill(brushHex);
  
      const lowerSide = (i/steps) - 0.5;
      const higherSide = ((i === 0) ? 1 : (i+1)/steps) - 0.5;
  
      startEdgeVectorLower  = p5.Vector.fromAngle(startAngle, lowerSide*size);
      endEdgeVectorLower    = p5.Vector.fromAngle(endAngle, lowerSide*size);
      startEdgeVectorHigher = p5.Vector.fromAngle(startAngle, higherSide*size);
      endEdgeVectorHigher   = p5.Vector.fromAngle(endAngle, higherSide*size);
  
      const rf = size * easedHueVar(brushVar)/360;

      buffer.beginShape();
      buffer.vertex(startX + startEdgeVectorLower.x  + random(-rf,rf), startY + random(-rf,rf) + startEdgeVectorLower.y);
      buffer.vertex(startX + startEdgeVectorHigher.x + random(-rf,rf), startY + random(-rf,rf) + startEdgeVectorHigher.y);
      buffer.vertex(endX   + endEdgeVectorHigher.x   + random(-rf,rf), endY   + random(-rf,rf) + endEdgeVectorHigher.y);
      buffer.vertex(endX   + endEdgeVectorLower.x    + random(-rf,rf), endY   + random(-rf,rf) + endEdgeVectorLower.y);
      buffer.endShape();
    }
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


function drawwithTriangle(buffer, xa, ya, xb, yb, penRecording, size) {
  if (xa === undefined || ya === undefined || xb === undefined || yb === undefined) return;
  buffer.noStroke();

  buffer.push();
  buffer.translate(xa, ya);
  //const angle = p5.Vector.angleBetween(createVector(xb-xa, yb-ya), createVector(1, 0));
  //buffer.rotate(-angle);
  //const length = dist(xa, ya, xb, yb);

  if (penRecording !== undefined && penRecording.length > 2) {

    let highestDist = 0;
    let furthestX = undefined;
    let furthestY = undefined;
    
    penRecording.forEach((point, index) => { 
      if (index > 0 && index < penRecording.length-1) {
        // const angle = p5.Vector.angleBetween(createVector(xb-xa, yb-ya), createVector(point.x-xa, point.y-ya));
        // const hypo = dist(xa, ya, point.x, point.y);
        // const alti = sin(angle)*hypo;
        // nDist = min(nDist, alti);
        // pDist = max(pDist, alti);
        const totalDist = dist(point.x, point.y, xa, ya) + dist(point.x, point.y, xb, yb)
        if (totalDist > highestDist) {
          highestDist = totalDist
          furthestX = point.x
          furthestY = point.y
        }
      }
    });
    //print(nDist, pDist)
    buffer.beginShape();
    buffer.vertex(0,0);
    buffer.vertex(furthestX-xa, furthestY-ya);
    buffer.vertex(xb-xa, yb-ya);
    buffer.endShape();
  } else {
    buffer.beginShape();
    buffer.vertex(0,0);
    buffer.vertex((xb-xa)*0.5, (xb-xa)*0.3);
    buffer.vertex(xb-xa, yb-ya);
    buffer.endShape();
  }

  buffer.pop();
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
  const bgHex = okhex(bgLuminance*0.9, bgChroma*0.5, bgHue);
  const visibleTextLum = constrain(bgLuminance + (bgLuminance > 0.5 ? -0.4 : 0.4), 0, 1.0);
  const lessTextLum = constrain(bgLuminance + (bgLuminance > 0.5 ? -0.25 : 0.25), 0, 1.0);
  const visHex = okhex(visibleTextLum, min(bgChroma, 0.2), bgHue);
  const antiVisHex = okhex(constrain(0.5+(-visibleTextLum+0.5)*4, 0, 1.0), min(bgChroma, 0.2), bgHue);

  const brushHex = okhex(brushLuminance, brushChroma, brushHue);
  const visibleTextOnBrushLum = constrain(brushLuminance + (brushLuminance > 0.5 ? -0.6 : 0.6), 0, 1.0);
  const onBrushHex = okhex(visibleTextOnBrushLum, brushChroma*0.5, brushHue);
  const refHex = okhex(refLuminance, refChroma, refHue);
  const easedSize = easeInCirc(brushSize, 4, 600);

  // Background borders
  buffer.fill(bgHex);
  buffer.rect(0, 0, width, 60);

  // Unfinished brushstroke preview
  if (pen.isDown && (activeInputGadget === "draw") && !editMode) {
    if (brushTool === "Round Line Tool") {
      buffer.stroke(brushHexWithHueVarSeed(pen.startX * pen.startY));
      drawWithLine(buffer, pen.startX, pen.startY, pen.x, pen.y, easedSize);
    } else if (brushTool === "Sharp Line Tool") { 
      drawWithSharpLine(buffer, pen.startX, pen.startY, pen.startAngle, pen.startPressure, pen.x, pen.y, pen.angle, pen.pressure, easedSize, texture);
    } else if (brushTool === "Triangle Tool") {
      buffer.fill(brushHexWithHueVarSeed(pen.startX * pen.startY));
      drawwithTriangle(buffer, pen.startX, pen.startY, pen.x, pen.y, penRecording, easedSize);
    } else if (brushTool === "Lasso Tool") {
      buffer.fill(brushHexWithHueVarSeed(pen.startX * pen.startY));
      drawwithLasso(buffer, pen.startX, pen.startY, pen.x, pen.y, penRecording, easedSize);
    } else if (brushTool === "Mirror Tool") {
      buffer.fill(brushHexWithHueVarSeed(pen.startX * pen.startY));
      drawwithMirror(buffer, pen.startX, pen.startY, pen.x, pen.y, penRecording, easedSize);
    }
  }
  
  // MENUS
  // Corner brush preview
  const cornerPreviewBrushSize = constrain(easedSize, 8, gadgetRadius/3);
  buffer.noStroke();
  displayTool(brushTool, texture, 0, 0)

  if (toolMenuOpened) {
    toolPresets.forEach((tool, index) => {
      displayTool(tool.brush, tool.texture, 0, index+1, tool.menuName);
    });
  }

  function displayTool(menuBrushTool, menuTexture, spotX, spotY, menuName) {

    buffer.push();
    buffer.translate(30 + 100*spotX, 30 + 60*spotY);

    if (spotY === 0 || (brushTool !== menuBrushTool || texture !== menuTexture)) {
      // draw example

      if (menuBrushTool === "Stamp Tool") {
        for (let x = 0; x <= 40; x += 5) {
          drawBrushstroke(buffer, x, 0, cornerPreviewBrushSize, pen.angle, pen.pressure, menuTexture);
        }
      } else if (menuBrushTool === "Round Line Tool" || menuBrushTool === "Fan Line Tool") {
        buffer.stroke(brushHex);
        drawWithLine(buffer, 0, 0, 40, 0, cornerPreviewBrushSize);
      } else if (menuBrushTool === "Sharp Line Tool") {
        drawWithSharpLine(buffer, 0, 0, pen.startAngle, pen.startPressure, 40, 0, pen.angle, pen.pressure, cornerPreviewBrushSize, menuTexture);
      } else {
        buffer.stroke(brushHex);
        drawWithPlaceholder(buffer, 0, 0, 40, 0, cornerPreviewBrushSize);
      }
    }

    buffer.pop();

    if (spotY > 0) {
      buffer.textAlign(CENTER);
      if (brushTool === menuBrushTool && texture === menuTexture) {
        buffer.fill(visHex);
        buffer.textStyle(ITALIC);
      } else {
        buffer.stroke(brushHex);
        buffer.strokeWeight(3);
        buffer.fill(onBrushHex);
      }
      buffer.text(menuName, 0, 0 + 60*spotY, 100, 60);
      buffer.textStyle(NORMAL);
      buffer.noStroke();
      buffer.strokeWeight(6);
    }
    buffer.textAlign(LEFT);
  }


  function topButton(text, x) {
    if (x === 0) {
      //buffer.stroke(brushHex);
      //buffer.strokeWeight(3);
      buffer.fill(onBrushHex);
    } else {
      buffer.fill(visHex);
    }
    buffer.text(text, x, 0, 100, 60);
    // buffer.stroke(visHex);
    // buffer.strokeWeight(1);
    // buffer.line(x+10, 60, x+90, 60)
    // buffer.noStroke();
    // buffer.strokeWeight(6);
  }

  // top menu buttons
  buffer.textAlign(CENTER);
  buffer.textStyle(BOLD);
  buffer.fill(visHex);

  topButton("tools", 0);
  topButton("undo U", 100*1);
  topButton("edit E", 100*2);
  topButton("clear C", width-100*2);
  topButton("save S", width-100*1);
  
  buffer.textAlign(LEFT);
  buffer.textStyle(NORMAL);


  // draw the sliders at the top
  const sliderStart = width/2 - 300;
  drawGradientSlider(sliderStart, 0, 200, 60, [0.0, brushChroma, brushHue], [1.0, brushChroma, brushHue], brushLuminance)
  drawGradientSlider(sliderStart+200, 0, 200, 60, [brushLuminance, 0.0, brushHue], [brushLuminance, 0.5, brushHue], brushChroma*2)
  drawGradientSlider(sliderStart+400, 0, 200, 60, [brushLuminance, brushChroma, 0], [brushLuminance, brushChroma, 360], brushHue/360)
  if (refHue !== undefined) {
    drawGradientSlider(sliderStart, 0, 200, 10, [0.0, refChroma, refHue], [1.0, refChroma, refHue], refLuminance)
    drawGradientSlider(sliderStart+200, 0, 200, 10, [refLuminance, 0.0, refHue], [refLuminance, 0.5, refHue], refChroma*2)
    drawGradientSlider(sliderStart+400, 0, 200, 10, [refLuminance, refChroma, 0], [refLuminance, refChroma, 360], refHue/360)
    buffer.fill(okhex(refLuminance, refChroma, refHue));
  } else {
    buffer.fill(okhex(brushLuminance, brushChroma, brushHue));
  }
  buffer.rect(sliderStart-60, 0, 60, 60);
  
  drawRoundColorExampleWithVariation(55, sliderStart - 30, 30);

  // bottom left/ top middle text
  buffer.fill(visHex);

  if (activeInputGadget === "lumAndChr"
    || activeInputGadget === "hue" 
    || activeInputGadget === "eyedropper") {

    const newColorText = "okLCH:" + brushLuminance.toFixed(3) +
    ", " + brushChroma.toFixed(3) +
    ", " + brushHue.toFixed(1) +
    "  noise:" + map(brushVar, 4, 600, 0, 100, true).toFixed(1) + "%";

    buffer.textAlign(CENTER);
    buffer.text(newColorText, width/2, 60 + 20);
    
    if (refLuminance !== undefined) {
      buffer.fill(okhex(lessTextLum, min(bgChroma, 0.2), bgHue));

      const refColorText = "okLCH:" + refLuminance.toFixed(3) +
      ", " + refChroma.toFixed(3) +
      ", " + refHue.toFixed(1) +
      "  noise:" + map(refVar, 4, 600, 0, 100, true).toFixed(1) + "%";

      buffer.text(refColorText, width/2, 60 + 40);
    }
  } else if (menuState.topSliderDeltaX !== undefined) {
    const xFromLeftEdgeOfSliders = menuState.topSliderStartX + 360 - width/2;
    const xFromLeftWithDelta = xFromLeftEdgeOfSliders + menuState.topSliderDeltaX;
    let section = undefined;
    let sectionValue = undefined;
    let sectionValueText = "";

    if (xFromLeftEdgeOfSliders < 60) {
      section = "var";
      sectionValue = constrain(refVar + menuState.topSliderDeltaX * 0.5, 0, 360);
      if (!isNaN(sectionValue)) brushVar = sectionValue;
      sectionValueText = Math.floor(brushVar);
    } else if (xFromLeftEdgeOfSliders < 260) {
      section = "luminance";
      sectionValue = map(xFromLeftWithDelta, 60, 260, 0, 1.0, true);
      brushLuminance = sectionValue;
      sectionValueText = Math.floor(brushLuminance * 100) + "%";
    } else if (xFromLeftEdgeOfSliders < 460) {
      section = "chroma";
      sectionValue = map(xFromLeftWithDelta, 260, 460, 0, 1.0, true);
      brushChroma = sectionValue * 0.5;
      sectionValueText = Math.floor(brushChroma * 200) + "%";
    } else if (xFromLeftEdgeOfSliders < 660) {
      section = "hue";
      sectionValue = map(xFromLeftWithDelta, 460, 660, 0, 1.0);
      if (sectionValue > 1) sectionValue %= 1;
      if (sectionValue < 0) sectionValue = 1-(Math.abs(sectionValue) % 1);
      brushHue = sectionValue * 360;
      sectionValueText = Math.floor(brushHue);
    } else {
      section = "size";
      sectionValue = constrain(refSize + menuState.topSliderDeltaX * 0.5, 4, 600);
      if (!isNaN(sectionValue)) brushSize = sectionValue;
      sectionValueText = Math.round(easedSize);
    }

    buffer.textAlign(CENTER);
    buffer.text(section + ": " + sectionValueText, width/2, 60 + 20);
  }

  buffer.textAlign(LEFT);
  buffer.fill(visHex);
  const controlsInfo = (isTouchControl !== false) ? "(ignore touch draw: on)" : "KEYS 1/2/3/4 TO ADJUST"
  buffer.text(controlsInfo, 20, height - 20);

  // draw the size indicator
  buffer.drawingContext.save();
  buffer.fill(bgHex);
  buffer.rect(sliderStart + 600, 0, 60, 60);
  buffer.drawingContext.clip();
  buffer.fill(okhex(brushLuminance, brushChroma, brushHue));
  drawStamp(buffer, sliderStart + 630, 30, easedSize, pen.angle, pen.pressure, texture);
  buffer.noFill();
  buffer.stroke(visHex);
  buffer.strokeWeight(1);
  buffer.ellipse(sliderStart + 630, 30, easedSize, easedSize)
  buffer.drawingContext.restore();
  buffer.noStroke();
  buffer.fill(visHex);
  buffer.textSize(11);
  buffer.text(Math.round(easedSize), sliderStart + 604, 10);

  //reset text size
  buffer.textSize((width < height) ? 13 : 16);

  

  // draw rectangle around stroke being edited
  if (editMode && penRecording.length > 0) {
    const margin = (["Triangle Tool", "Lasso Tool", "Mirror Tool"].includes(brushTool)) ? 0 : easedSize*0.5;
    const xmin = penRecording.reduce((a, b) => Math.min(a, b.x),  Infinity) - margin;
    const xmax = penRecording.reduce((a, b) => Math.max(a, b.x), -Infinity) + margin;
    const ymin = penRecording.reduce((a, b) => Math.min(a, b.y),  Infinity) - margin;
    const ymax = penRecording.reduce((a, b) => Math.max(a, b.y), -Infinity) + margin;
  
    buffer.stroke(okhex(bgLuminance, bgChroma, bgHue));
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
  }


  // depending on input mode, draw the right gadget
  drawActiveGadget();

  // draw the hover preview
  if ((activeInputGadget === "draw") && (isTouchControl === false) && !pen.isDown && !editMode && !pointerDown) {
    // draw hover stamp at the pen position
    if (brushTool === "Stamp Tool") {
      drawBrushstroke(buffer, hover.x, hover.y, easedSize, hover.angle, undefined, texture);
    } else if (brushTool === "Round Line Tool" || brushTool === "Fan Line Tool") {
      drawCrosshair(easedSize, hover.x, hover.y);
      buffer.stroke(brushHexWithHueVarSeed(hover.x * hover.y));
      drawWithLine(buffer, hover.x, hover.y, hover.x, hover.y, easedSize)
    } else if (brushTool === "Sharp Line Tool") {
      if (hover.lastX !== undefined && hover.lastY !== undefined) {
        drawWithSharpLine(buffer, hover.lastX, hover.lastY, hover.angle, undefined, hover.x, hover.y, hover.angle, undefined, easedSize, texture);
      }
    }
  }


  // end of redrawInterface

  function drawActiveGadget() {

    if (activeInputGadget === "eyedropper") {
      buffer.fill(brushHex);
      const easedSize = easeInCirc(brushSize, 4, 600);
      drawStamp(buffer, pen.x, pen.y, easedSize, pen.angle, pen.pressure, texture);
      drawCrosshair(easedSize, pen.x, pen.y);
    }

    // draw the brush setting gadgets
    const useBaseX = (refHoverX !== undefined) ? refHoverX : refX;
    const useBaseY = (refHoverY !== undefined) ? refHoverY : refY;

    if (useBaseX === undefined || useBaseY === undefined) return;

    buffer.noStroke();
    buffer.fill(brushHex);

    const sideDist = gadgetRadius; //(Math.max(width, height) > 4* gadgetRadius) ? gadgetRadius : gadgetRadius*0.5;
    const ankerX = constrain(useBaseX, sideDist, width - sideDist);
    const ankerY = constrain(useBaseY, sideDist, height - sideDist);

    if (activeInputGadget === "cloverMenu") {

      buffer.stroke(visHex);
      buffer.strokeWeight(2);
      buffer.line(ankerX-10, ankerY, ankerX+10, ankerY);
      buffer.line(ankerX, ankerY-10, ankerX, ankerY+10);

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

          let startVarArr = [brushLuminance, brushChroma, brushHue, 360];
          let endVarArr = [brushLuminance, brushChroma, brushHue, 0];
          drawGradientLine(posX, posY - size/3, posX, posY + size/3, startVarArr, endVarArr, size);

          let startHueArr = [brushLuminance, brushChroma, 0 + refHue - 180];
          let endHueArr = [brushLuminance, brushChroma, 360 + refHue - 180];
          drawGradientLine(posX - size/3, posY, posX + size/3, posY, startHueArr, endHueArr, size);
          
          buffer.noStroke();

        } else if (text === "LC") {
          buffer.strokeWeight(8);

          let startLumArr = [1.0, brushChroma, brushHue];
          let endLumArr = [0.0, brushChroma, brushHue];
          drawGradientLine(posX, posY - size/3, posX, posY + size/3, startLumArr, endLumArr, size);

          let startChromaArr = [brushLuminance, 0.0, brushHue];
          let endChromaArr = [brushLuminance, 0.5, brushHue];
          drawGradientLine(posX - size/3, posY, posX + size/3, posY, startChromaArr, endChromaArr, size);
          
          buffer.noStroke();

        } else {
          buffer.textSize(22);
          buffer.text(text, posX, posY);
          //reset text size
          buffer.textSize((width < height) ? 13 : 16);
        }
      }

      const highlightedGadget = (menuState.hoverPage === null) ? menuState.lastGadgetPage : menuState.hoverPage;

      drawGadgetDirection(refX, refY, -1,  0, highlightedGadget === 4, "S");
      drawGadgetDirection(refX, refY,  1,  0, highlightedGadget === 3, "H");
      drawGadgetDirection(refX, refY,  0, -1, highlightedGadget === 5, "I");
      drawGadgetDirection(refX, refY,  0,  1, highlightedGadget === 2, "LC");
    
    } else if (activeInputGadget === "hue") {

      const radius = gadgetRadius;
      buffer.push();
      buffer.translate(ankerX, ankerY);

      buffer.fill("black")
      buffer.ellipse(0, 0, constrain(easeInCirc(brushSize, 4, 600), 8, gadgetRadius/3)+2)

      // var
      buffer.stroke("black");
      buffer.strokeWeight(8);
      buffer.line(0, radius*2 * (-1 + brushVar/360), 0, radius*2 * brushVar/360);

      let startVarArr = [brushLuminance, brushChroma, brushHue, 360];
      let endVarArr = [brushLuminance, brushChroma, brushHue, 0];
      buffer.strokeWeight(6);
      drawGradientLine(0, radius*2 * (-1 + brushVar/360), 0, radius*2 * brushVar/360, startVarArr, endVarArr, gadgetRadius);

      // hue
      // always start centered since hue is a circle anyway
      buffer.stroke("black");
      buffer.strokeWeight(8);
      let deltaHue = brushHue - refHue + 180;
      if (deltaHue < 0) deltaHue += 360;
      if (deltaHue > 360) deltaHue % 360;
      buffer.line(radius*2 * (- deltaHue/360), 0, radius*2 * (1-deltaHue/360), 0);

      let startHueArr = [brushLuminance, brushChroma, 0 + refHue - 180];
      let endHueArr = [brushLuminance, brushChroma, 360 + refHue - 180];
      buffer.strokeWeight(6);
      drawGradientLine(radius*2 * (- deltaHue/360), 0, radius*2 * (1-deltaHue/360), 0, startHueArr, endHueArr, gadgetRadius);

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

      let startLumArr = [1.0, brushChroma, brushHue];
      let endLumArr = [0.0, brushChroma, brushHue];
      buffer.stroke("black");
      buffer.strokeWeight(8);
      buffer.line(0, radius*2 * (-1 + brushLuminance), 0, radius*2 * brushLuminance);
      buffer.strokeWeight(6);
      drawGradientLine(0, radius*2 * (-1 + brushLuminance), 0, radius*2 * brushLuminance, startLumArr, endLumArr, gadgetRadius);

      let startChromaArr = [brushLuminance, 0.0, brushHue];
      let endChromaArr = [brushLuminance, 0.5, brushHue];
      buffer.stroke("black");
      buffer.strokeWeight(8);
      buffer.line(radius*2 * (- brushChroma*2), 0, radius*2 * (1-brushChroma*2), 0);
      buffer.strokeWeight(6);
      drawGradientLine(radius*2 * (- brushChroma*2), 0, radius*2 * (1-brushChroma*2), 0, startChromaArr, endChromaArr, gadgetRadius);
      
      buffer.pop();

      // Show color at reference position
      const currentColorSize = constrain(easeInCirc(brushSize, 4, 600), 8, gadgetRadius/3);
      drawRoundColorExampleWithVariation(currentColorSize, ankerX, ankerY);

    } else if (activeInputGadget === "size") {

      // scale
      const lineBaseY = refY - gadgetRadius;
      const lineAddY = gadgetRadius * 2 * map(brushSize, 4, 600, 0, 1);
      const lineTranslateY = lineBaseY + lineAddY;

      const posX = ankerX - 40;

      buffer.fill(visHex);
      buffer.ellipse(posX, lineTranslateY + gadgetRadius, 10);
      buffer.ellipse(posX, lineTranslateY - gadgetRadius, 20);

      buffer.fill(brushHex);
      const easedSize = easeInCirc(brushSize, 4, 600);
      drawStamp(buffer, posX, ankerY, easedSize, pen.angle, pen.pressure, texture);
      drawCrosshair(easedSize, posX, ankerY);
    }
  }

  function drawRoundColorExampleWithVariation(size, x, y) {
    buffer.fill(brushHex);
    buffer.ellipse(x, y, size);

    const varSegments = 32;
    for (let i = 0; i < varSegments; i++) {
      const start = (TWO_PI / varSegments) * i;
      const stop = start + TWO_PI / varSegments;
      const varHex = okhex(
        brushLuminance,
        brushChroma,
        brushHue + varStrengths[i] * easedHueVar(brushVar)
      );
      buffer.fill(varHex);
      buffer.arc(x, y, size, size, start, stop);
    }
  }

  function drawCrosshair(size, x, y) {
    // draw the crosshair
    buffer.strokeWeight(2);
    const outerLuminance = (brushLuminance > 0.5) ? 0.0 : 1.0;
    buffer.stroke(okhex(outerLuminance, 0.0, 0));
  
    buffer.line(x, y - size*0.5, x, y - size*0.5 - 6);
    buffer.line(x, y + size*0.5, x, y + size*0.5 + 6);
    buffer.line(x - size*0.5, y, x - size*0.5 - 6, y);
    buffer.line(x + size*0.5, y, x + size*0.5 + 6, y);
  
    // reset
    buffer.strokeWeight(6);
    buffer.noStroke();
  }

  function directMix(startArr, endArr, colorLerpAmt) {
    const mixedArr = [
      lerp(startArr[0], endArr[0], colorLerpAmt),
      lerp(startArr[1], endArr[1], colorLerpAmt),
      lerp(startArr[2], endArr[2], colorLerpAmt),
    ];

    const hueVar = (startArr[3] === undefined) ? 0 : varStrengths[Math.floor(128*colorLerpAmt)] * easedHueVar(lerp(startArr[3], endArr[3], colorLerpAmt));

    return chroma.oklch(mixedArr[0], mixedArr[1], mixedArr[2] + hueVar);
  }

  function drawGradientLine(xStart, yStart, xEnd, yEnd, startArr, endArr, radius) {
    const segments = Math.floor(radius)/2;
    let lastX = xStart;
    let lastY = yStart;
    for (let i = 1; i < segments + 1; i++) {
      const toX = lerp(xStart, xEnd, i / segments);
      const toY = lerp(yStart, yEnd, i / segments);
      const colorLerpAmt = (i - 0.5) / segments;
      const mixedOkLCH = directMix(startArr, endArr, colorLerpAmt);
  
      buffer.stroke(mixedOkLCH.hex());
      buffer.line(lastX, lastY, toX, toY);
  
      lastX = toX;
      lastY = toY;
    }
  }

  function drawGradientSlider(x, y, width, height, startArr, endArr, sliderPercent) {
    const segments = 100;
    const currentSegment = Math.round(segments * sliderPercent);

    for (let i = 0; i < segments; i++) {
      const colorLerpAmt = (i + 0.5) / segments;
      const mixedOkLCH = directMix(startArr, endArr, colorLerpAmt);
  
      buffer.fill(mixedOkLCH.hex());
      buffer.rect(x + (i/segments) * width, y, width/segments, height);

      if (i === currentSegment) {
        buffer.fill("white");
        buffer.rect(x + (i/segments) * width, y, width/segments, height);
      }
    }
  }

  function drawHueCircle(center, radius, numSegments, luminance, chroma, rotateAngle) {
    let segmentAngle = TWO_PI / numSegments; // angle of each segment
  
    for (let i = 0; i < numSegments; i++) {
      let cHue = map(i, 0, numSegments, 0, 360); // map segment index to hue value
      let brushHex = okhex(luminance, chroma, cHue);
      buffer.stroke(brushHex); // set stroke color based on hue
      let startAngle = i * segmentAngle + rotateAngle; // starting angle of segment
      let endAngle = startAngle + segmentAngle; // ending angle of segment
      let start = createVector(
        cos(startAngle) * radius,
        sin(startAngle) * radius
      ); // starting point of segment
      let end = createVector(cos(endAngle) * radius, sin(endAngle) * radius); // ending point of segment
      start.add(center); // add center point to starting point
      end.add(center); // add center point to ending point
      buffer.line(start.x, start.y, end.x, end.y); // draw segment
    }
  }
}

function okhex(l, c, h) {
  return chroma.oklch(l, c, h).hex();
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

  // during eyedropper, vary the hue less
  const baseVar = brushVar * ((inputMode() === "eyedropper") ? 0.3 : 1);

  // for low chroma, use the no curve amount of hue variation (more intense)
  // for high chroma, use the curve (less intense)
  return lerp(
    baseVar*1,
    easeInCirc(baseVar*0.5, 0, 360),
    easeOutCubic(brushChroma * 2)
  );
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
