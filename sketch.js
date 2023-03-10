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
let refHue;
let refVar;
let refChroma;
let refLuminance;
let refSize;
let gadgetRadius; // based on canvas size

// current brush settings for drawing
let brushHue = 0;
let brushVar = 80;
let brushChroma = 0.2;
let brushLuminance = 0.7;
let brushSize = 200;
let brushTool = "Stamp Tool"
let texture = "Rounded"

// menu
let toolPresets = [
  {brush: "Stamp Tool", texture: "Rounded", menuName: "Rounded"},
  {brush: "Stamp Tool", texture: "Rake", menuName: "Rake"},
  {brush: "Line Tool", texture: undefined, menuName: "Line"},
  {brush: "Fan Line Tool", texture: undefined, menuName: "Line F"},
];
let toolMenuOpened = false;

// save 128 random 0-1 values here for consistent noise that stays between redraws
let varStrengths = [];

// control
let visited = false;
let useMouse = false;
let ongoingTouches = []; 
let penX; 
let penY;
let penStartX;
let penStartY;
let penLastX;
let penLastY;
let penStarted = false;
let wasDown = false;
let penDown = false;
let penAngle = undefined;
let penPressure = undefined;
let fingersDown = 0;
let wiplog = "";

// recorded brushstroke
let penRecording = [];
let editMode = false;

// touch control state
const fingerState = {
  peakCount: 0,
  canDecreaseCount: false
}


function setup() {
  cnv = createCanvas(windowWidth - 10, windowHeight - 10);
  cnv.touchStarted(handleTouchStart);
  cnv.touchMoved(handleTouchMove);
  cnv.touchEnded(handleTouchEnd);
  noLoop();

  gadgetRadius = min(width, height) / 8;
  penX = width/2;
  penY = height/2;
  refX = penX;
  refY = penY;

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
  interfaceBuffer.textSize((width < height) ? 13 : 16);
  interfaceBuffer.textFont("monospace");
  interfaceBuffer.textAlign(LEFT, CENTER);

  // new random noise
  varStrengths = Array.from({ length: 128 }, () => random());
  
  draw();
}

function windowResized() {
  resizeCanvas(windowWidth - 10, windowHeight - 10);
  interfaceBuffer.resizeCanvas(width, height);
  interfaceBuffer.textSize((width < height) ? 13 : 16);
  draw();
}


function handleTouchStart(event) {
  event.preventDefault();
  event.changedTouches.forEach((touch) => {
    ongoingTouches.push(copyTouch(touch));
  });
  visited = true;
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
    print("all fingers lifted")
  }
  updateInput(event);
  draw();
}
function copyTouch({identifier, clientX, clientY, force, touchType, azimuthAngle}) {
  return {identifier, clientX, clientY, force, touchType, azimuthAngle};
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

function mousePressed(event) {
  visited = true;
  if (useMouse) {
    updateInput(event);
    draw();
  }
}
function mouseMoved(event) {
  useMouse = true;
  updateInput(event);
  draw();
}
function mouseDragged(event) {
  visited = true;
  if (useMouse) {
    updateInput(event);
    draw();
  }
}
function mouseReleased(event) {
  if (useMouse) {
    updateInput(event);
    draw();
  }
}

function updateInput(event) {

  const startEventTypes = ["mousedown", "touchstart"];

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
          penLastX = undefined;
          penLastY = undefined;
          editMode = false;
          redrawLastStroke(newStrokeBuffer);
        }
      } else {
        toolMenuOpened = !toolMenuOpened;
      }
      return true;
    }
    if (y < 60 && x > menuW && x < menuW*2) {
      doAction("undo");
      return true;
    }
    if (y < 60 && x > menuW*2 && x < menuW*3) {
      doAction("edit");
      return true;
    }
    if (y < 60 && x > width-menuW*1 && x < width-menuW*0) {
      doAction("save");
      return true;
    }
    if (y < 60 && x > width-menuW*2 && x < width-menuW*1) {
      doAction("clear");
      return true;
    }
  }

  // update touches/mouse
  wasDown = penDown;
  fingersDown = 0;
  penStarted = false;
  //wiplog += event.type + event.changedTouches[0].identifier + " "

  // first get the touches/mouse position
  if (ongoingTouches.length === 0 && mouseX !== undefined && mouseY !== undefined && useMouse) {
    if (tappedInMenu(mouseX, mouseY)) return;
    penLastX = penX;
    penLastY = penY;
    penX = mouseX;
    penY = mouseY;
    
    if (event.type === "mousedown") {
      penDown = true;
    } else if (event.type === "mouseup") {
      penDown = false;
    }
  } else {
    // find pencil and count other touches
    // assuming apple pencil, using touchType property
    let containedPen = false;
    ongoingTouches.forEach((touch) => {
      if (tappedInMenu(touch.clientX, touch.clientY)) return;
      if (touch.touchType !== "stylus") {
        fingersDown++;
      } else {
        // must be Pencil
        penLastX = penX;
        penLastY = penY;
        penX = touch.clientX;
        penY = touch.clientY;
        containedPen = true;
        penAngle = touch.azimuthAngle;
        penPressure = touch.force;
      }
    });
    penDown = containedPen;
  }

  // update state based on the result

  if (event === undefined) return;

  // pen down
  if (startEventTypes.includes(event.type) && penDown) {
    penStartX = penX;
    penStartY = penY;
    penStarted = true;
    if (!editMode && inputMode() === "draw") penRecording = [];
    return;
  }

  // record
  if (penDown && !editMode && inputMode() === "draw") {
    penRecording.push({
      x: penX,
      y: penY,
      angle: penAngle,
      pressure: penPressure,
      event: event.type
    });
  }

  // tap
  if (event.type === "touchstart" && !penDown) {
    if (fingerState.canDecreaseCount) {
      fingerState.peakCount = (fingersDown > fingerState.peakCount) ? fingersDown : 0;
      fingerState.canDecreaseCount = false; //false;
    } else {
      fingerState.peakCount = max(fingerState.peakCount, fingersDown);
    }
    penStartX = undefined;
    penStartY = undefined;
    return;
  }

  // pen lifted
  if (wasDown && !penDown && fingersDown === 0) {
    fingerState.peakCount = 0;
    fingerState.canDecreaseCount = false;
    // also leave edit mode
    editMode = false;
    penLastX = undefined;
    penLastY = undefined;
    return;
  }

  // last finger lifted
  if ((event.type === "touchend" && ongoingTouches.length === 0) || event.type === "touchcancel") {
    // was in a mode
    if (fingerState.peakCount > 0) {
      // now that there are no touches, the next tap can set the mode to 0 if it's less fingers than the last
      fingerState.canDecreaseCount = true; 
    }
    return;
  }
}

function keyPressed() {
  visited = true;
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
  //'1', luminance and chroma 
  if (keyIsDown(49) || (fingerState.peakCount === 1 && fingersDown === 0)) {
    return "lumAndChr";
  }
  //'2', hue
  if (keyIsDown(50) || (fingerState.peakCount === 2 && fingersDown === 0)) {
    return "hue";
  }
  //'3', size
  if (keyIsDown(51) || (fingerState.peakCount === 3 && fingersDown === 0)) {
    return "size";
  }
  //'4', eyedropper ... WIP, currently not on touch and a bit broken
  if (keyIsDown(52)) {
    return "eyedropper"
  }
  return "draw";
}

function draw() {

  const currentInputMode = inputMode();

  if (currentInputMode === "draw") {
    // clear the reference values so they could be changed again when opening a menu
    clearBrushReference();

    // start of brushstroke
    if (!editMode) {
      if (penStarted) {
        // don't draw on initial spot as a WIP pressure fix
        // commit the new stroke to the painting and clear the buffer
        paintingBuffer.image(newStrokeBuffer, 0, 0);
        newStrokeBuffer.clear();
      } else {
        // draw to the stroke buffer
        drawInNewStrokeBuffer(newStrokeBuffer);
      }
    } else {
      // edit mode
      if (penDown) {
        const xDiff = penX-penLastX;
        const yDiff = penY-penLastY;
        redrawLastStroke(newStrokeBuffer, xDiff, yDiff);
      }
    }
    

  } else if (currentInputMode === "lumAndChr" 
      || currentInputMode === "hue" 
      || currentInputMode === "size" 
      || currentInputMode === "eyedropper") { // menu opened

    // save the old brush values as a reference when opening a menu
    updateBrushReferenceFromInput();
    // get the new changed brush values
    updateBrushSettingsFromInput(currentInputMode);

    if (editMode) redrawLastStroke(newStrokeBuffer);
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
}

function updateBrushReferenceFromInput() {
  // starting position
  if (refX === undefined) refX = penX;
  if (refY === undefined) refY = penY;
  // starting brush settings
  if (refHue === undefined) refHue = brushHue;
  if (refChroma === undefined) refChroma = brushChroma;
  if (refLuminance === undefined) refLuminance = brushLuminance;
  if (refSize === undefined) refSize = brushSize;
  if (refVar === undefined) refVar = brushVar;
}

function redrawLastStroke(buffer, xDiff, yDiff) {
  if (buffer === undefined) return;
  const easedSize = easeInCirc(brushSize, 4, 600);

  // use recording
  if (brushTool === "Stamp Tool") {
    buffer.clear();
    penRecording.forEach((point) => {
      if (xDiff !== undefined) point.x += xDiff;
      if (yDiff !== undefined) point.y += yDiff;
      drawBrushstroke(buffer, point.x, point.y, easedSize, point.angle, point.pressure, texture);
    });
  } else if (brushTool === "Fan Line Tool") {
    buffer.clear();
    if (xDiff !== undefined) penStartX += xDiff;
    if (yDiff !== undefined) penStartY += yDiff;
    penRecording.forEach((point) => {
      if (xDiff !== undefined) point.x += xDiff;
      if (yDiff !== undefined) point.y += yDiff;
      // one color variation for each line instance
      buffer.stroke(brushHexWithHueVarSeed(point.y * point.x));
      drawWithLine(buffer, penStartX, penStartY, point.x, point.y, easedSize);
    });
  }
}

function drawInNewStrokeBuffer(buffer) {
  if (buffer === undefined) return;
  const easedSize = easeInCirc(brushSize, 4, 600);

  if (brushTool === "Stamp Tool" && penDown) {
    drawBrushstroke(buffer, penX, penY, easedSize, penAngle, penPressure, texture);
  } else if (brushTool === "Fan Line Tool" && penDown) {
    // one color variation for each line instance
    buffer.stroke(brushHexWithHueVarSeed(penY * penX));
    drawWithLine(buffer, penStartX, penStartY, penX, penY, easedSize);
  } else if (brushTool === "Line Tool" && wasDown && !penDown) {
    // one color variation for each line instance
    buffer.stroke(brushHexWithHueVarSeed(penStartX * penStartY));
    drawWithLine(buffer, penStartX, penStartY, penX, penY, easedSize);
  }
}

function updateBrushSettingsFromInput(currentInputMode) {
  const penMode = (!useMouse && penStartX !== undefined && penStartY !== undefined)

  if (currentInputMode === "lumAndChr") { 
    // Get positions
    let deltaX = penX - (penMode ? penStartX : refX);
    let deltaY = penY - (penMode ? penStartY : refY);
    let rangeX = gadgetRadius * 2;
    let rangeY = gadgetRadius * 2;

    // Map to chroma and luminance
    brushChroma = map(deltaX + rangeX * (refChroma * 2), 0, rangeX, 0, 0.5, true);
    brushLuminance = map(-deltaY + rangeY * refLuminance, 0, rangeY, 0, 1, true);

  } else if (currentInputMode === "hue") { // '1', hue and hue variation

    // Compute circle center position from reference
    const startAngle = TWO_PI * (refHue / 360) - HALF_PI;
    const startRadius = gadgetRadius * (1 - refVar / 360);
    const centerX = (penMode ? penStartX : refX) - cos(startAngle) * startRadius;
    const centerY = (penMode ? penStartY : refY) - sin(startAngle) * startRadius;

    // Compute new angle and distance based on that center
    const angle = atan2(penY - centerY, penX - centerX);
    const radius = constrain(dist(penX, penY, centerX, centerY), 0, gadgetRadius);

    brushHue = (degrees(angle) + 90) % 360;
    brushVar = (1 - radius / gadgetRadius) * 360;

    if (brushHue < 0) brushHue += 360;

  } else if (currentInputMode === "size") {

    const deltaY = penY - (penMode ? penStartY : refY);
    const rangeY = gadgetRadius * 2;

    brushSize = map(-deltaY + rangeY * map(refSize, 4, 600, 0, 1), 0, rangeY, 4, 600, true);
  
  } else if (currentInputMode === "eyedropper") {
    paintingBuffer.image(newStrokeBuffer, 0, 0);
    newStrokeBuffer.clear();

    const colorArray = paintingBuffer.get(penX, penY);
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
      brushHue + varStrengths[(x * y) % varStrengths.length] * easedHueVar()
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
    brushHue + varStrengths[seed % varStrengths.length] * easedHueVar()
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


function redrawInterface(buffer, currentInputMode) {
  if (buffer === undefined) return;

  // Clear the UI buffer
  buffer.clear();

  // Background borders
  const borderH = height/8;
  const borderW = width/8;
  buffer.fill(okhex(bgLuminance*0.9, bgChroma*0.5, bgHue));
  buffer.rect(0,              0, width, borderH);
  buffer.rect(0, height-borderH, width, borderH);
  buffer.rect(            0, 0, borderW, height);
  buffer.rect(width-borderW, 0, borderW, height);


  const visibleTextLum = constrain(bgLuminance + (bgLuminance > 0.5 ? -0.4 : 0.4), 0, 1.0);
  const lessTextLum = constrain(bgLuminance + (bgLuminance > 0.5 ? -0.25 : 0.25), 0, 1.0);
  const visHex = okhex(visibleTextLum, min(bgChroma, 0.2), bgHue);
  const brushHex = okhex(brushLuminance, brushChroma, brushHue);
  const refHex = okhex(refLuminance, refChroma, refHue);
  const easedSize = easeInCirc(brushSize, 4, 600);


  // Unfinished brushstroke preview
  if (brushTool === "Line Tool" && penDown && currentInputMode === "draw" && !editMode) {
    buffer.stroke(brushHexWithHueVarSeed(penStartX * penStartY));
    drawWithLine(buffer, penStartX, penStartY, penX, penY, easedSize);
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

  function displayTool(brushTool, texture, spotX, spotY, menuName) {

    buffer.push();
    buffer.translate(30 + 100*spotX, 30 + 60*spotY);

    if (brushTool === "Stamp Tool") {
      for (let x = 0; x <= 40; x += 5) {
        drawBrushstroke(buffer, x, 0, cornerPreviewBrushSize, penAngle, penPressure, texture);
      }
    } else if (brushTool === "Line Tool") {
      buffer.stroke(brushHex);
      drawWithLine(buffer, 0, 0, 40, 0, cornerPreviewBrushSize);
    } else {
      //broken color somehow,see the line function
      for (let a = 0; a < 12; a++) {
        buffer.stroke(brushHexWithHueVarSeed(a));
        drawWithLine(buffer, 40-40*(a/12), a*3.5, 0, 0, cornerPreviewBrushSize);
      }
    }

    buffer.pop();

    if (spotY > 0) {
      buffer.fill(visHex);
      buffer.textAlign(CENTER);
      buffer.text(menuName, 0, 0 + 60*spotY, 100, 60);
    }
    buffer.textAlign(LEFT);
  }

  function topButton(text, x) {
    buffer.fill(visHex);
    buffer.text(text, x, 0, 100, 60);
    buffer.stroke(visHex);
    buffer.strokeWeight(1);
    buffer.line(x+10, 60, x+90, 60)
    buffer.noStroke();
    buffer.strokeWeight(6);
  }

  // top menu buttons
  buffer.textAlign(CENTER);
  topButton("tools", 0);
  topButton("undo U", 100*1);
  topButton("edit E", 100*2);
  topButton("clear C", width-100*2);
  topButton("save S", width-100*1);
  buffer.textAlign(LEFT);

  // const leftW = 110
  
  // if (useMouse) {
  //   buffer.text("1/2/3: Color/Size ???  C:Clear with color", leftW, 30);
  //   //buffer.text(penDown + "startX " + penStartX + " startY " + penStartY, leftW, 70);
  // } else {
  //   const textureText = (texture !== undefined) ? " (" + texture + " Texture)" : "";
  //   buffer.text(brushTool + textureText, leftW, 30);
  //   // buffer.text(wiplog, leftW, 70);
  //   // buffer.text("Pencil down:" + penDown + " x" + penX + "y" + penY + " fingers:" + fingersDown, leftW, 30);
  //   // buffer.text("Can decrease:" + fingerState.canDecreaseCount + " Peak:" + fingerState.peakCount, leftW, 70);
  //   // buffer.text("startX " + penStartX + " startY " + penStartY, leftW, 70);
  //   // // wip logging text
  //   // ongoingTouches.forEach((touch, index) => {
  //   //   if (touch !== undefined) {
  //   //     buffer.text(
  //   //       touch.clientX + " " + touch.clientY + 
  //   //       " force:" + touch.force + 
  //   //       " id:" + touch.identifier, 
  //   //       leftW, 90 + index * 20
  //   //     );
  //   //     //buffer.text(touch.touchType + " " + touch.azimuthAngle ,leftW, 90 + index * 20);
  //   //   }
  //   // });
  // }

  // bottom right text
  buffer.textAlign(RIGHT);
  buffer.text("adjust 1/2/3 (multitouch/ keys)", width - 20, height - 20);
  buffer.textAlign(LEFT);

  // bottom left text
  buffer.text("okLCH:" + brushLuminance.toFixed(3) +
      ", " + brushChroma.toFixed(3) +
      ", " + brushHue.toFixed(1) +
      "  noise:" + map(brushVar, 4, 600, 0, 100).toFixed(1) + "%",
    20, height - 20
  );

  buffer.fill(okhex(lessTextLum, min(bgChroma, 0.2), bgHue));

  if (refLuminance !== undefined) {
    buffer.text("okLCH:" + refLuminance.toFixed(3) +
        ", " + refChroma.toFixed(3) +
        ", " + refHue.toFixed(1) +
        "  noise:" + map(refVar, 4, 600, 0, 100).toFixed(1) + "%",
      20, height - 40
    );
  }

  // draw recording debug info
  // let lastX;
  // let lastY;
  // buffer.stroke("red");
  // penRecording.forEach((point) => {
  //   if (lastX !== undefined) {
  //     buffer.line(lastX, lastY, point.x, point.y)
  //   }
  //   lastX = point.x;
  //   lastY = point.y
  // });
  // buffer.noStroke();

  // draw debug rectangle around last stroke
  if (editMode && penRecording.length > 0) {
    const xmin = penRecording.reduce((a, b) => Math.min(a, b.x),  Infinity) - easedSize*0.5;
    const xmax = penRecording.reduce((a, b) => Math.max(a, b.x), -Infinity) + easedSize*0.5;
    const ymin = penRecording.reduce((a, b) => Math.min(a, b.y),  Infinity) - easedSize*0.5;
    const ymax = penRecording.reduce((a, b) => Math.max(a, b.y), -Infinity) + easedSize*0.5;
  
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
  drawGadgets();

  // draw the hover preview
  buffer.fill(brushHex);
  if (currentInputMode === "draw" && visited && useMouse && !penDown && !editMode) {
    // draw hover stamp at the pen position
    drawStamp(buffer, penX, penY, easedSize, penAngle, penPressure, texture);
  }


  // end of redrawInterface

  function drawGadgets() {
    // draw the brush setting gadgets
    if (refX === undefined || refY === undefined) return;

    buffer.noStroke();
    buffer.fill(brushHex);

    const ankerX = constrain(refX, gadgetRadius*2, width - gadgetRadius*2);
    const ankerY = constrain(refY, gadgetRadius*2, height - gadgetRadius*2);

    if (currentInputMode === "hue") {

      // draw hue circle
      const hueLineWidth = 6; // same as stroke width

      // Compute circle center position from reference
      const startAngle = TWO_PI * (brushHue / 360) - HALF_PI;
      const startRadius = constrain(gadgetRadius * (1 - brushVar / 360), 0, gadgetRadius);
      const centerX = ankerX - cos(startAngle) * startRadius;
      const centerY = ankerY - sin(startAngle) * startRadius;

      // Draw center
      buffer.fill(visHex);
      buffer.noStroke();
      buffer.ellipse(centerX, centerY, 20);

      // Draw hue circle around center
      buffer.stroke(brushHex);
      const outerLuminance = (brushLuminance > 0.5) ? brushLuminance - 0.3 : brushLuminance + 0.3;
      drawHueCircle(createVector(centerX, centerY), gadgetRadius+hueLineWidth/2, 36, outerLuminance, 0.4);
      drawHueCircle(createVector(centerX, centerY), gadgetRadius, 36, brushLuminance, brushChroma);
      buffer.noStroke();

      // Show color at reference position
      const currentColorSize = constrain(easeInCirc(brushSize, 4, 600), 8, gadgetRadius/3);
      drawEditedColor(currentColorSize, ankerX, ankerY);
      drawCrosshair(currentColorSize, ankerX, ankerY);

    } else if (currentInputMode === "lumAndChr") {

      const radius = gadgetRadius;
      const boxBaseX = ankerX + radius;
      const boxBaseY = ankerY + radius;

      const boxAddX = radius * 2 * (brushChroma * 2);
      const boxAddY = radius * 2 * (1 - brushLuminance);

      buffer.push();
      buffer.translate(boxBaseX - boxAddX, boxBaseY - boxAddY);

      // gray left
      let startLCHarr = [1.0, 0.0, brushHue];
      let endLCHarr = [0.0, 0.0, brushHue];
      drawGradientLine(-radius, -radius, -radius, radius, startLCHarr, endLCHarr);
      // top
      buffer.fill("white");
      startLCHarr = [1.0, 0.5, brushHue];
      endLCHarr = [1.0, 0.0, brushHue];
      drawGradientLine(radius, -radius, -radius, -radius, startLCHarr, endLCHarr);
      buffer.noStroke();
      buffer.ellipse(-radius, -radius, 20);
      // colorful right
      buffer.fill(okhex(1, 0.5, brushHue));
      startLCHarr = [0.0, 0.5, brushHue];
      endLCHarr = [1.0, 0.5, brushHue];
      drawGradientLine(radius, radius, radius, -radius, startLCHarr, endLCHarr);
      buffer.noStroke();
      buffer.ellipse(radius, -radius, 20);
      // bottom
      buffer.stroke("black");
      buffer.fill("black");
      buffer.line(-radius, radius, radius, radius);
      buffer.noStroke();
      buffer.ellipse(-radius, radius, 20);
      buffer.fill(okhex(0.0, 0.5, brushHue));
      buffer.ellipse(radius, radius, 20);

      buffer.noStroke();
      buffer.pop();

      // Show color at reference position
      const currentColorSize = constrain(easeInCirc(brushSize, 4, 600), 8, gadgetRadius/3);
      drawEditedColor(currentColorSize, ankerX, ankerY);
      drawCrosshair(currentColorSize, ankerX, ankerY);

    } else if (currentInputMode === "size") {

      // scale
      const lineBaseY = ankerY - gadgetRadius;
      const lineAddY = gadgetRadius * 2 * map(brushSize, 4, 600, 0, 1);
      const lineTranslateY = lineBaseY + lineAddY;

      buffer.fill(visHex);
      buffer.ellipse(ankerX, lineTranslateY + gadgetRadius, 10);
      buffer.ellipse(ankerX, lineTranslateY - gadgetRadius, 20);

      buffer.fill(brushHex);
      const easedSize = easeInCirc(brushSize, 4, 600);
      drawStamp(buffer, ankerX, ankerY, easedSize, penAngle, penPressure, texture);
      drawCrosshair(easedSize, ankerX, ankerY);

    }
  }


  // With color menus open, show the current color as a circle made out of arcs showing the hue variation
  function drawEditedColor(size, x, y) {
    buffer.fill(brushHex);
    buffer.ellipse(x, y, size);

    const varSegments = 32;
    for (let i = 0; i < varSegments; i++) {
      const start = (TWO_PI / varSegments) * i;
      const stop = start + TWO_PI / varSegments;
      const varHex = okhex(
        brushLuminance,
        brushChroma,
        brushHue + varStrengths[i] * easedHueVar()
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

  function drawGradientLine(xStart, yStart, xEnd, yEnd, startArr, endArr) {
    const segments = 20;
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
  
    function directMix(startArr, endArr, colorLerpAmt) {
      const mixedArr = [
        lerp(startArr[0], endArr[0], colorLerpAmt),
        lerp(startArr[1], endArr[1], colorLerpAmt),
        lerp(startArr[2], endArr[2], colorLerpAmt),
      ];
      return chroma.oklch(mixedArr[0], mixedArr[1], mixedArr[2]);
    }
  }

  function drawHueCircle(center, radius, numSegments, luminance, chroma) {
    let segmentAngle = TWO_PI / numSegments; // angle of each segment
  
    for (let i = 0; i < numSegments; i++) {
      let cHue = map(i, 0, numSegments, 0, 360); // map segment index to hue value
      let brushHex = okhex(luminance, chroma, cHue);
      buffer.stroke(brushHex); // set stroke color based on hue
      let startAngle = i * segmentAngle - HALF_PI; // starting angle of segment
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

function easedHueVar() {
  // for low chroma, use the no curve amount of hue variation (more intense)
  // for high chroma, use the curve (less intense)
  return lerp(
    brushVar,
    easeInCirc(brushVar, 0, 360),
    easeOutCubic(brushChroma * 2)
  );
}
