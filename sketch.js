let cnv;

// render the painting and visuals separately
let bufferGraphics;
let uiGraphics;

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

// current brush settings for drawing
let brushHue = 0;
let brushVar = 80;
let brushChroma = 0.2;
let brushLuminance = 0.7;
let brushSize = 200;
let visited = false;
let gadgetRadius; // based on canvas size

// save 64 random 0-1 values here for consistent noise that stays between redraws
let varStrengths = [];

// control
let useMouse = false;
let ongoingTouches = []; 
let penX; 
let penY;
let penStartX;
let penStartY;
let penDown = false;
let fingersDown = 0;

// touch control state
const fingerState = {
  peakCount: 0,
  canDecreaseCount: false
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
function copyTouch({identifier, clientX, clientY, force}) {
  return {identifier, clientX, clientY, force};
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

function mouseClicked() {
  visited = true;
  updateInput();
  draw();
}
function mouseMoved() {
  useMouse = true;
  updateInput();
  draw();
}
function mouseDragged() {
  visited = true;
  updateInput();
  draw();
}

function updateInput(event) {
  // update touches/mouse
  const wasDown = penDown;
  penDown = false;
  fingersDown = 0;

  if (ongoingTouches.length === 0) {
    if (mouseX !== undefined && mouseY !== undefined && useMouse) {
      penX = mouseX;
      penY = mouseY;
      penDown = (mouseIsPressed && mouseButton === LEFT);
    } 
  } else {
    // find pencil and count other touches
    // assuming apple pencil, fingers have a force of 0.
    ongoingTouches.forEach((touch) => {
      if (touch.force === 0) {
        fingersDown++;
      } else {
        // must be Pencil
        penX = touch.clientX;
        penY = touch.clientY;
        penDown = true;
      }
    })
  }
  // update finger state
  if (event === undefined) return;

  if (event.type === "touchstart" && penDown) {
    penStartX = penX;
    penStartY = penY;
    return;
  }

  if (event.type === "touchstart" && !penDown) {
    if (fingerState.canDecreaseCount) {
      fingerState.peakCount = (fingersDown > fingerState.peakCount) ? fingersDown : 0;
      fingerState.canDecreaseCount = false;
    } else {
      fingerState.peakCount = max(fingerState.peakCount, fingersDown);
    }
    return;
  }
  if (wasDown && !penDown && fingersDown === 0) {
    // save the last drawing position as the ref
    // WIP WAS BROKEN LAST TESTING
    // if (fingerState.peakCount === 0) {
    //   refX = penX;
    //   refY = penY;
    // }

    fingerState.peakCount = 0;
    fingerState.canDecreaseCount = false;
    penStartX = undefined;
    penStartY = undefined;
    return;
  }
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
    bgLuminance = brushLuminance;
    bgChroma = brushChroma;
    bgHue = brushHue;

    bufferGraphics.background(okhex(bgLuminance, bgChroma, bgHue));
    document.body.style.backgroundColor = okhex(bgLuminance, bgChroma, bgHue);

    //fix the current brush color so it's visible
    if (brushLuminance > 0.5) {
      brushLuminance -= 0.05;
    } else {
      brushLuminance += 0.05;
    }
  } else if (key === "s") {
    saveCanvas("myCanvas", "png");
  }
  if (key !== undefined) draw();
}

function keyReleased() {
  updateUI();
  draw();
}


function inputMode() {
  //'1', hue
  if (keyIsDown(49) || fingerState.peakCount === 1) {
    return "hue";
  }
  //'2', luminance and chroma 
  if (keyIsDown(50) || fingerState.peakCount === 2) {
    return "lc";
  }
  //'3', size
  if (keyIsDown(51) || fingerState.peakCount === 3) {
    return "size";
  }
  return "draw";
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

  // Create a graphics buffer for the painting
  bufferGraphics = createGraphics(width, height);
  if (width > 3000) {
    bufferGraphics.pixelDensity(1);
  }
  bufferGraphics.background(okhex(bgLuminance, bgChroma, bgHue));
  document.body.style.backgroundColor = okhex(bgLuminance, bgChroma, bgHue);

  // Create a graphics buffer for the indicator
  uiGraphics = createGraphics(width, height);
  uiGraphics.strokeWeight(6);
  uiGraphics.textSize((width < height) ? 13 : 16);
  uiGraphics.textStyle(BOLD);
  uiGraphics.textFont("monospace");
  updateUI();
  draw();
}

function draw() {

  // update the reference position
  if (inputMode() === "lc" || inputMode() === "hue" || inputMode() === "size") { //keys '1', '2', '3'
    // starting position
    // with touch, this is instead recorded when ending a brushstroke 
    // WIP NOT IMPLEMENTED AS SUCH, DONT DO THESE LINES IF USING TOUCH/PENCIL...lead to broken results last time however
    if (refX === undefined) refX = penX;
    if (refY === undefined) refY = penY;
    // starting brush settings
    if (refHue === undefined) refHue = brushHue;
    if (refChroma === undefined) refChroma = brushChroma;
    if (refLuminance === undefined) refLuminance = brushLuminance;
    if (refSize === undefined) refSize = brushSize;
    if (refVar === undefined) refVar = brushVar;
    // new random noise
    if (varStrengths.length === 0) {
      varStrengths = Array.from({ length: 64 }, () => random());
    }
  } else {
    refX = undefined; // WIP WONT NEED THIS, SEE ABOVE
    refY = undefined;
    refHue = undefined;
    refChroma = undefined;
    refLuminance = undefined;
    refSize = undefined;
    refVar = undefined;
    varStrengths = [];
  }

  // DRAWING
  if (inputMode() === "draw" && penDown) {
    // one color variation for each stamp instance
    const brushHex = okhex(
      brushLuminance,
      brushChroma,
      brushHue + random(-easedHueVar(), easedHueVar())
    );
    bufferGraphics.fill(brushHex);
    bufferGraphics.noStroke();

    //draw brushstroke
    drawStamp(bufferGraphics, penX, penY);
     
  } else { // MENU OPENED

    const penMode = (penStartX !== undefined && penStartY !== undefined)

    if (inputMode() === "lc") { 
      // Get positions
      let deltaX = penX - (penMode ? penStartX : refX);
      let deltaY = penY - (penMode ? penStartY : refY);
      let rangeX = gadgetRadius * 2;
      let rangeY = gadgetRadius * 2;

      // Map to chroma and luminance
      brushChroma = map(deltaX + rangeX * (refChroma * 2), 0, rangeX, 0, 0.5, true);
      brushLuminance = map(-deltaY + rangeY * refLuminance, 0, rangeY, 0, 1, true);

    } else if (inputMode() === "hue") { // '1', hue and hue variation

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

    } else if (inputMode() === "size") {

      const deltaY = penY - (penMode ? penStartY : refY);
      const rangeY = gadgetRadius * 2;

      brushSize = map(-deltaY + rangeY * map(refSize, 4, 600, 0, 1), 0, rangeY, 4, 600, true);
    }
  }

  // draw the UI to the ui buffer
  updateUI(); 

  // Draw the painting buffer behind the indicator
  image(bufferGraphics, 0, 0);

  // Draw the indicator buffer in the top left corner
  image(uiGraphics, 0, 0);
}

function drawStamp(buffer, x, y) {
  const easedSize = easeInCirc(brushSize, 4, 600);
  buffer.square(x - easedSize / 2, y - easedSize / 2, easedSize, easedSize / 4);
}

function updateUI() {
  // Clear the indicator buffer
  uiGraphics.clear();

  const visibleTextLum = constrain(bgLuminance + (bgLuminance > 0.5 ? -0.3 : 0.3), 0, 1.0);
  const visHex = okhex(visibleTextLum, min(bgChroma, 0.2), bgHue);
  
  // top left menu text
  uiGraphics.fill(visHex);

  if (useMouse) {
    uiGraphics.text("1:Hue/Hue Noise  2:Luminance/ Chroma  3:Size", 20, 30);
    uiGraphics.text("C:Clear with color", 20, 50);
  } else {
    uiGraphics.text("Tap: HUE/VARIATION  •  Double-Tap: LUMINANCE/CHROMA  •  Triple-Tap: SIZE", 20, 30);
    uiGraphics.text("Use pencil to draw/ edit", 20, 50);
    // uiGraphics.text("Pencil down:" + penDown + " x" + penX + "y" + penY + " fingers:" + fingersDown, 20, 30);
    // uiGraphics.text("Can decrease:" + fingerState.canDecreaseCount + " Peak:" + fingerState.peakCount, 20, 50);
    // uiGraphics.text("startX " + penStartX + " startY " + penStartY, 20, 70);
    // // wip logging text
    // ongoingTouches.forEach((touch, index) => {
    //   if (touch !== undefined) {
    //     uiGraphics.text(
    //       touch.clientX + " " + touch.clientY + 
    //       " force:" + touch.force + 
    //       " id:" + touch.identifier, 
    //       20, 90 + index * 20
    //     );
    //   }
    // });
  }

  // bottom left text
  uiGraphics.text("okLCH: " + brushLuminance.toFixed(3) +
      " • " + brushChroma.toFixed(3) +
      " • " + brushHue.toFixed(1) +
      "     noise: " + map(brushVar, 4, 600, 0, 100).toFixed(1) + "%",
    20, height - 20
  );

  const lessTextLum = constrain(bgLuminance + (bgLuminance > 0.5 ? -0.15 : 0.15), 0, 1.0);
  uiGraphics.fill(okhex(lessTextLum, min(bgChroma, 0.2), bgHue));

  if (refLuminance !== undefined) {
    uiGraphics.text("okLCH: " + refLuminance.toFixed(3) +
        " • " + refChroma.toFixed(3) +
        " • " + refHue.toFixed(1) +
        "     noise: " + map(refVar, 4, 600, 0, 100).toFixed(1) + "%",
      20, height - 40
    );
  }


  // Update the indicator buffer with the current brush color and size
  const brushHex = okhex(brushLuminance, brushChroma, brushHue);
  const refHex = okhex(refLuminance, refChroma, refHue);
  uiGraphics.noStroke();
  uiGraphics.fill(brushHex);

  // With color menus open, show the current color as a circle made out of arcs showing the hue variation
  function drawEditedColor() {
    uiGraphics.fill(brushHex);
    const easedSize = easeInCirc(brushSize, 4, 600);
    uiGraphics.ellipse(refX, refY, easedSize);

    const varSegments = 32;
    for (let i = 0; i < varSegments; i++) {
      const start = (TWO_PI / varSegments) * i;
      const stop = start + TWO_PI / varSegments;
      const varHex = okhex(
        brushLuminance,
        brushChroma,
        brushHue + varStrengths[i] * easedHueVar()
      );
      uiGraphics.fill(varHex);
      uiGraphics.arc(refX, refY, easedSize, easedSize, start, stop);
    }
  }

  // draw the input menus

  if (inputMode() === "hue") {

    // draw hue circle

    // Compute circle center position from reference
    const startAngle = TWO_PI * (brushHue / 360) - HALF_PI;
    const startRadius = constrain(gadgetRadius * (1 - brushVar / 360), 0, gadgetRadius);
    const centerX = refX - cos(startAngle) * startRadius;
    const centerY = refY - sin(startAngle) * startRadius;

    // Draw center
    uiGraphics.fill(visHex);
    uiGraphics.noStroke();
    uiGraphics.ellipse(centerX, centerY, 20);

    // Draw hue circle around center
    uiGraphics.stroke(brushHex);
    drawHueCircle(createVector(centerX, centerY), gadgetRadius, 36);
    uiGraphics.noStroke();

    // Show color at reference position
    drawEditedColor();

  } else if (inputMode() === "lc") {

    const radius = gadgetRadius;
    const boxBaseX = refX + radius;
    const boxBaseY = refY + radius;

    const boxAddX = radius * 2 * (brushChroma * 2);
    const boxAddY = radius * 2 * (1 - brushLuminance);

    uiGraphics.push();
    uiGraphics.translate(boxBaseX - boxAddX, boxBaseY - boxAddY);

    // gray left
    let startLCHarr = [1.0, 0.0, brushHue];
    let endLCHarr = [0.0, 0.0, brushHue];
    drawGradientLine(-radius, -radius, -radius, radius, startLCHarr, endLCHarr);
    // top
    uiGraphics.fill("white");
    startLCHarr = [1.0, 0.5, brushHue];
    endLCHarr = [1.0, 0.0, brushHue];
    drawGradientLine(radius, -radius, -radius, -radius, startLCHarr, endLCHarr);
    uiGraphics.noStroke();
    uiGraphics.ellipse(-radius, -radius, 20);
    // colorful right
    uiGraphics.fill(okhex(1, 0.5, brushHue));
    startLCHarr = [0.0, 0.5, brushHue];
    endLCHarr = [1.0, 0.5, brushHue];
    drawGradientLine(radius, radius, radius, -radius, startLCHarr, endLCHarr);
    uiGraphics.noStroke();
    uiGraphics.ellipse(radius, -radius, 20);
    // bottom
    uiGraphics.stroke("black");
    uiGraphics.fill("black");
    uiGraphics.line(-radius, radius, radius, radius);
    uiGraphics.noStroke();
    uiGraphics.ellipse(-radius, radius, 20);
    uiGraphics.fill(okhex(0.0, 0.5, brushHue));
    uiGraphics.ellipse(radius, radius, 20);

    uiGraphics.noStroke();
    uiGraphics.pop();

    // Show color at reference position
    drawEditedColor();

  } else if (inputMode() === "size") {

    // scale
    const lineBaseY = refY - gadgetRadius;
    const lineAddY = gadgetRadius * 2 * map(brushSize, 4, 600, 0, 1);
    const lineTranslateY = lineBaseY + lineAddY;

    uiGraphics.fill(visHex);
    uiGraphics.ellipse(refX, lineTranslateY + gadgetRadius, 10);
    uiGraphics.ellipse(refX, lineTranslateY - gadgetRadius, 20);

    uiGraphics.fill(visHex);
    drawStamp(uiGraphics, refX, refY);
    // uiGraphics.stroke(visHex);
    // uiGraphics.lin

  } else if (visited && useMouse) {

    // draw at the pen position
    drawStamp(uiGraphics, penX, penY);
  }
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

    uiGraphics.stroke(mixedOkLCH.hex());
    uiGraphics.line(lastX, lastY, toX, toY);

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

function drawHueCircle(center, radius, numSegments) {
  let segmentAngle = TWO_PI / numSegments; // angle of each segment

  for (let i = 0; i < numSegments; i++) {
    let cHue = map(i, 0, numSegments, 0, 360); // map segment index to hue value
    let brushHex = okhex(brushLuminance, brushChroma, cHue);
    uiGraphics.stroke(brushHex); // set stroke color based on hue
    let startAngle = i * segmentAngle - HALF_PI; // starting angle of segment
    let endAngle = startAngle + segmentAngle; // ending angle of segment
    let start = createVector(
      cos(startAngle) * radius,
      sin(startAngle) * radius
    ); // starting point of segment
    let end = createVector(cos(endAngle) * radius, sin(endAngle) * radius); // ending point of segment
    start.add(center); // add center point to starting point
    end.add(center); // add center point to ending point
    uiGraphics.line(start.x, start.y, end.x, end.y); // draw segment
  }
}

function okhex(l, c, h) {
  return chroma.oklch(l, c, h).hex();
}

function easeInCirc(x, from, to) {
  if (from === undefined) {
    return 1 - Math.sqrt(1 - Math.pow(x, 2));
  }
  return (
    (1 - Math.sqrt(1 - Math.pow((x - from) / (to - from), 2))) * (to - from) +
    from
  );
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
