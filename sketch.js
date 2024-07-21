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

  // react to events on the fullscreen canvas
  const canvasElement = document.getElementById("myCanvas");
  canvasElement.addEventListener("pointerdown",   Interaction.pointerStart);
  canvasElement.addEventListener("pointerup",     Interaction.pointerEnd);
  canvasElement.addEventListener("pointercancel", Interaction.pointerCancel);
  canvasElement.addEventListener("pointermove",   Interaction.pointerMove);
  canvasElement.addEventListener("wheel",         Interaction.wheelScrolled);
  canvasElement.addEventListener("pointerout",    Interaction.pointerCancel);

  // fix for apple pencil scribble
  canvasElement.addEventListener("touchmove", (event) => {event.preventDefault();}, false);

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
  Interaction.resetViewTransform();
  const INITIAL_CANVAS_COLOR = new HSLColor(0.2, 0.25, 0.5);
  const smaller_window_side = Math.min(width, height);
  const INITIAL_CANVAS_DIMENSIONS = { // start with square canvas for now
    x: Math.round(smaller_window_side*0.9),
    y: Math.round(smaller_window_side*0.9)
  }
  const INITIAL_BRUSH_SETTINGS = new BrushSettings(
    new HSLColor(Math.random(), 0.6, 0.7), 
    0.35, 0.5, 
    PRESET_TOOLS[0].tool, PRESET_TOOLS[0].texture
  );
  openPainting = new Painting(INITIAL_CANVAS_DIMENSIONS.x, INITIAL_CANVAS_DIMENSIONS.y, INITIAL_CANVAS_COLOR, INITIAL_BRUSH_SETTINGS);
  document.body.style.backgroundColor = INITIAL_CANVAS_COLOR.behind().hex;
}

function draw() {
  // behind everything
  background(openPainting.canvasColor.behind().hex);
  
  // correctly center and rotate
  push();
  translate(Interaction.viewTransform.centerPos().x, Interaction.viewTransform.centerPos().y);
  rotate(Interaction.viewTransform.rotation);
  // WIP: should also take into account current cropping amount here and make the interactions offset to match.
  translate(-Interaction.viewTransform.scale * openPainting.width/2, -Interaction.viewTransform.scale * openPainting.height/2);

  const scaledSize = {
    x: Math.round(Interaction.viewTransform.scale * openPainting.width),
    y: Math.round(Interaction.viewTransform.scale * openPainting.height)
  };

  // gradient shadow behind painting
  const gradient = drawingContext.createRadialGradient(
    scaledSize.x * openPainting.cropWidthMultiplier/2, scaledSize.y * openPainting.cropHeightMultiplier/2, 0,
    scaledSize.x * openPainting.cropWidthMultiplier/2, scaledSize.y * openPainting.cropHeightMultiplier/2, Math.min(scaledSize.x, scaledSize.y) * Math.min(openPainting.cropHeightMultiplier, openPainting.cropWidthMultiplier) * 1.5/2
  );
  gradient.addColorStop(0, color(0, 0, 0, 100));
  gradient.addColorStop(1, 'transparent');
  drawingContext.fillStyle = gradient;
  noStroke();
  ellipse(scaledSize.x * openPainting.cropWidthMultiplier * 1/2 , scaledSize.y * openPainting.cropHeightMultiplier * 1/2, 
    scaledSize.x * openPainting.cropWidthMultiplier * 1.5, scaledSize.y * openPainting.cropHeightMultiplier * 1.5);

  // draw the painting buffers

  // in rounded rectangle area
  drawingContext.save();
  fill(openPainting.canvasColor.hex);
  rect(0, 0, scaledSize.x * openPainting.cropWidthMultiplier, scaledSize.y * openPainting.cropHeightMultiplier, UI.ELEMENT_RADIUS);
  drawingContext.clip();

  openPainting.updateCombinedBuffer();
  if (Interaction.viewTransform.scale === 1) {
    // original scale
    image(openPainting.combinedBuffer, 0, 0);
  } else {
    // scaled
    image(openPainting.combinedBuffer, 0, 0, scaledSize.x, scaledSize.y);
  }

  drawingContext.restore();
  pop();

  // draw the new UI to the buffer, then show on top of the screen
  UI.redrawInterface(); 
  image(UI.buffer, 0, 0);
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
  constructor(color, size, colorVar, tool, texture, exactSize) {
    this.color = color.copy();
    this.size = size;
    this.colorVar = colorVar;
    this.tool = tool;
    this.texture = texture;
    this.exactSize = exactSize ?? null;
  }

  copy() {
    return new BrushSettings(
      this.color, this.size, this.colorVar, this.tool, this.texture, this.exactSize
    );
  }

  /**
   * Not linear. Pressure is optional.
   * @param {number} pressure The pressure value, in the range [0-1].
   * @returns {number} The size in pixels.
   */
  sizeInPixels(pressure, alignedness) {

    let size;
    if (this.exactSize === null) {
      size = map(easeInCirc(this.size), 0, 1, 4, 600);
    } else {
      size = this.exactSize;
    }

    // modify based on tool
    size *= (this.texture === "Round" ? 0.7 : 1);

    // if size not exactly set, take into account dynamics
    if (this.exactSize === null) {
      if (pressure !== undefined) {
        size *= map(pressure, 0, 1, 0.1, 2.0, true);
      }
      if (alignedness !== undefined) {
        size *= map(alignedness, 0, 1, 1 * 1.3, 1 / 1.3, true);
      }
    }
    return size;
  }

  /**
   * @param {number} pxSize The size in pixels.
   */
  setExactSize(pxSize) {
    this.size = null;
    this.exactSize = pxSize;
    //if (this.texture === "Round") this.exactSize /= 0.7;
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
    this.timeStamp = timeStamp;
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
    this.compositeOperation = "source-over";
  }

  get bounds() {
    const margin = this.settings.sizeInPixels()*0.5;
    const xmin = this.points.reduce((a, b) => Math.min(a, b.x),  Infinity) - margin;
    const xmax = this.points.reduce((a, b) => Math.max(a, b.x), -Infinity) + margin;
    const ymin = this.points.reduce((a, b) => Math.min(a, b.y),  Infinity) - margin;
    const ymax = this.points.reduce((a, b) => Math.max(a, b.y), -Infinity) + margin;
    return {x: xmin, y:ymin, width: xmax-xmin, height: ymax-ymin};
  }

  get center() {
    const bounds = this.bounds;
    return {x: bounds.x + bounds.width/2, y: bounds.y + bounds.height/2};
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
    const lastPoint = this.points[this.points.length - 1];

    // don't add if too close to last point
    if (lastPoint === undefined || (Interaction.distance2d(lastPoint, point) > 3)) { // && (point.timeStamp - lastPoint.timeStamp) > 5)) {
      
      // pressure should be smoothed out
      if (point.pressure !== undefined) {
        if (lastPoint !== undefined && lastPoint.pressure !== undefined) {
          point.pressure = lerp(lastPoint.pressure, point.pressure, 0.2);
        } else {
          point.pressure *= 0.5; // start lower
        }
      }
      this.points.push(new BrushPoint(point.x,  point.y,  point.azimuth, point.pressure, point.timeStamp));
    }
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
    this.points.forEach((endPoint, index) => {
      const startPoint = this.points[index - 1];
      const beforePoint = (index > 1) ? this.points[index - 2] : undefined;
      if (startPoint !== undefined && endPoint !== undefined) {
        this.drawPart(startPoint, endPoint, beforePoint);
      }
    });
  }

  // WIP, currently ignores tool
  /**
   * Render two points of the stroke.
   * @param {BrushPoint} start The first point of the stroke segment.
   * @param {BrushPoint} end The second point of the stroke segment.
   * @param {BrushPoint} beforePoint Data from the previous stroke segment.
   * @returns 
   */
  drawPart(start, end, beforePoint) {

    // for now, ignore .azimuth besides for slightly changing the width of strokes.
    // barrel rotation should have an effect instead, which is not yet supported and I couldn't use myself...
    function angleAtV(v) {
      const a = createVector(v.x, v.y).heading();
      return (a + Math.PI/2).mod(Math.PI * 2); //map(a + Math.PI/2, -Math.PI, Math.PI, 0, Math.PI*2) % (Math.PI*2);
    }

    // 0 to 2PI clockwise from the right
    const endAngle = angleAtV({x: end.x-start.x, y: end.y-start.y});
    const startAngle = (beforePoint !== undefined) ? angleAtV({x: start.x-beforePoint.x, y: start.y-beforePoint.y}) : endAngle;
    const averageAngle = getAverageAngle(startAngle, endAngle);

    // 0 to 2PI clockwise from the left
    const averageAzimuth = (start.azimuth !== undefined) ? getAverageAngle(start.azimuth, end.azimuth) : undefined;

      end.pressure ??= start.pressure;
      end.pressure ??= (openPainting.averagePressure ?? 0.5);
    start.pressure ??= (openPainting.averagePressure ?? 0.5);
    const avgPressure = (start.pressure + end.pressure) / 2;

    // calculate width of the bruststroke
    const avgBrushWidth = this.settings.sizeInPixels(openPainting.averagePressure) ?? this.settings.sizeInPixels();
    function widthAtPoint(t, pressure, strokeAngle, azimuthAngle) {
      let alignedness = undefined;
      if (azimuthAngle !== undefined && strokeAngle !== undefined) {
        // calculate how aligned the stroke is with the azimuth
        alignedness = Math.abs((azimuthAngle % Math.PI*2) - (strokeAngle % Math.PI*2)) / (Math.PI*2);
        alignedness = Math.min(alignedness, 1 - alignedness) * 2;
      }
      return t.settings.sizeInPixels(pressure, alignedness);
    }


    // // normalize
    // let alignedness = Math.abs((averageAzimuth % Math.PI*2) - (averageAngle % Math.PI*2)) / (Math.PI*2);
    // alignedness = Math.min(alignedness, 1 - alignedness);
    // //differenceInAngle = 1 - Math.abs(Math.abs(differenceInAngle * 4 - 2) - 1);

    // // differenceInAngle = Math.abs(averageAzimuth - averageAngle) / (Math.PI);
    // // //differenceInAngle = Math.abs(differenceInAngle * -2 - 1)Math.min(differenceInAngle * 2, 1 - differenceInAngle * 2);
    // // differenceInAngle = -Math.abs(-2 * differenceInAngle + 2) + 2;

    // // transform space from 0-1 to 0-1-0
    // //differenceInAngle = Math.abs(differenceInAngle * 2 - 1);
    
    // //this.buffer.stroke(map(startAngle, 0, Math.PI * 2, 0, 255), 0, map(start.azimuth, 0, Math.PI * 2, 0, 255));
    // //this.buffer.stroke((((start.azimuth + Math.PI) % (Math.PI * 2)) / (Math.PI*2)) * 255);
    // //this.buffer.stroke((differenceInAngle / (Math.PI*2)) * 255);
    // this.buffer.strokeWeight(differenceInAngle * 10);
    // this.buffer.push();

    // this.buffer.line(start.x, start.y, end.x, end.y);

    // this.buffer.translate(start.x, start.y);
    // this.buffer.rotate(start.azimuth ?? 0);
    
    // if (start.pressure === 0) {
    //   this.buffer.line(-25, 0, +25, 0);
    //   //this.buffer.stroke(new HSLColor(0, 1, 0.5, 0).hex);
    //   this.buffer.pop();
    // } else {
    //   let p = Math.log(start.pressure + 1) * 100
    //   let s = 5 * (start.pressure * 50 ?? 1);
    //   this.buffer.line(-s, 0, +s, 0);
    //   this.buffer.pop();
    // }
    // return;



    // if (beforePoint === undefined) {
    //   //draw a circle at start point

    //   this.buffer.push();
    //   this.buffer.translate(start.x, start.y);

    //   this.buffer.noStroke();
    //   this.buffer.fill(this.settings.color.hex);
    //   const startSize = this.settings.sizeInPixels(start.pressure) ?? brushSize;
    //   this.buffer.ellipse(0, 0, startSize);

    //   const varSegments = 48;
    //   for (let i = 0; i < varSegments; i++) {
    //     const start = (TWO_PI / varSegments) * i;
    //     const stop = start + TWO_PI / varSegments; 
    //     this.buffer.fill(this.settings.getColorWithVar(i).hex);
    //     this.buffer.arc(0, 0, startSize, startSize, start, stop);
    //   }

    //   this.buffer.pop();
    // }
    
    // randomness matches increasing variation
    const randFactor = 3 * this.settings.colorVar * this.settings.colorVar; 
    const strips = Math.floor(map(avgBrushWidth, 10, 300, 10, 200) * (this.settings.texture === "Round" ? 0.7 : 1));

    // draw background shape
    this.buffer.noStroke();
    if (this.settings.texture !== "Rake") {
      const lowSideLerpPart = HSLColor.symmetricalNoise(0 + end.seed) * 0.5 + 0.5;
      const highSideLerpPart = HSLColor.symmetricalNoise(strips-1 + end.seed) * 0.5 + 0.5;
      const lowSideMiddlePos = {x: lerp(start.x, end.x, lowSideLerpPart), y: lerp(start.y, end.y, lowSideLerpPart)};
      const highSideMiddlePos = {x: lerp(start.x, end.x, highSideLerpPart), y: lerp(start.y, end.y, highSideLerpPart)};
  
      const startEdgeVectorLower  = p5.Vector.fromAngle(  startAngle, -0.5*widthAtPoint(this, start.pressure,   startAngle, start.azimuth));
      const startEdgeVectorHigher = p5.Vector.fromAngle(  startAngle,  0.5*widthAtPoint(this, start.pressure,   startAngle, start.azimuth));
      const endEdgeVectorLower    = p5.Vector.fromAngle(    endAngle, -0.5*widthAtPoint(this,   end.pressure,     endAngle,   end.azimuth));
      const endEdgeVectorHigher   = p5.Vector.fromAngle(    endAngle,  0.5*widthAtPoint(this,   end.pressure,     endAngle,   end.azimuth));
      const midEdgeVectorLower    = p5.Vector.fromAngle(averageAngle, -0.5*widthAtPoint(this,    avgPressure, averageAngle, averageAzimuth));
      const midEdgeVectorHigher   = p5.Vector.fromAngle(averageAngle,  0.5*widthAtPoint(this,    avgPressure, averageAngle, averageAzimuth));
  
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

      // draw in specific order so that changing the number of strips looks centered
      const idTowardsCenter = (i < strips/2) ? i * 2 : (strips - i) * 2 - 1;

      if (drawThisStrip) {
        const lowerSide = i/strips - 0.5; 
        const higherSide = (i+1)/strips - 0.5;

        const lerpPart = HSLColor.symmetricalNoise(idTowardsCenter + end.seed) * 0.5 + 0.5;
        const middleX = lerp(start.x, end.x, lerpPart);
        const middleY = lerp(start.y, end.y, lerpPart);

        const startEdgeVectorLower  = p5.Vector.fromAngle(  startAngle,  lowerSide*widthAtPoint(this, start.pressure,   startAngle, start.azimuth));
        const startEdgeVectorHigher = p5.Vector.fromAngle(  startAngle, higherSide*widthAtPoint(this, start.pressure,   startAngle, start.azimuth));
        const endEdgeVectorLower    = p5.Vector.fromAngle(    endAngle,  lowerSide*widthAtPoint(this,   end.pressure,     endAngle,   end.azimuth));
        const endEdgeVectorHigher   = p5.Vector.fromAngle(    endAngle, higherSide*widthAtPoint(this,   end.pressure,     endAngle,   end.azimuth));
        const midEdgeVectorLower    = p5.Vector.fromAngle(averageAngle,  lowerSide*widthAtPoint(this,    avgPressure, averageAngle, averageAzimuth));
        const midEdgeVectorHigher   = p5.Vector.fromAngle(averageAngle, higherSide*widthAtPoint(this,    avgPressure, averageAngle, averageAzimuth));


        const brushCol = this.settings.getColorWithVar(idTowardsCenter + start.seed)
          .varyComponents(idTowardsCenter + this.brushstrokeSeed, 
          0.1 + this.settings.colorVar * 0.3);

        if (this.settings.texture === "Round") {
          this.buffer.stroke(brushCol.hex);
          this.buffer.strokeWeight(2 * avgBrushWidth / strips);
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
          this.randomizedVertex(this.buffer, sX, startEdgeVectorLower.x ,    sY, startEdgeVectorLower.y ,    0);
          this.randomizedVertex(this.buffer, sX, startEdgeVectorHigher.x,    sY, startEdgeVectorHigher.y,    0);
          this.randomizedVertex(this.buffer, middleX, midEdgeVectorHigher.x, middleY, midEdgeVectorHigher.y, randFactor);
          this.randomizedVertex(this.buffer, middleX, midEdgeVectorLower.x,  middleY, midEdgeVectorLower.y,  randFactor);
          this.buffer.endShape();
        }
        const brushCol2 = this.settings.getColorWithVar(idTowardsCenter + end.seed)
          .varyComponents(idTowardsCenter + this.brushstrokeSeed, 
          0.1 + this.settings.colorVar * 0.3);

        if (this.settings.texture === "Round") {
          this.buffer.stroke(brushCol2.hex);
          this.buffer.strokeWeight(2 * avgBrushWidth / strips);
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
          this.randomizedVertex(this.buffer, middleX, midEdgeVectorLower.x , middleY, midEdgeVectorLower.y , randFactor);
          this.randomizedVertex(this.buffer, middleX, midEdgeVectorHigher.x, middleY, midEdgeVectorHigher.y, randFactor);
          this.randomizedVertex(this.buffer, eX  , endEdgeVectorHigher.x, eY  , endEdgeVectorHigher.y, 0);
          this.randomizedVertex(this.buffer, eX  , endEdgeVectorLower.x , eY  , endEdgeVectorLower.y , 0);
          this.buffer.endShape();
        }
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
    this.cropWidthMultiplier = 1;
    this.cropHeightMultiplier = height/width;
    this.lowestBuffer = createGraphics(width, height); // all older bruststrokes that are no longer editable
    this.combinedBuffer = createGraphics(width, height); // final image
    this.temporaryCompositionBuffer = createGraphics(width, height); // for composition of specific editable buffers
    this.snapshotBuffer = createGraphics(UI.KNOB_SIZE * 2, UI.KNOB_SIZE * 2);
    this.editableStrokesInUse = 0;
    this.editableStrokes = Array.from({ length: 16 }, () => new Brushstroke(createGraphics(width, height), startingBrush));
    this.currentBrush = startingBrush;
    this.previousBrushes = [];
    this.canvasColor = backgroundColor;
    this.hueRotation = 0;
    this.previousHueRotation = 0;
    this.averagePressure = undefined;
    this.totalStrokesCount = 0;

    // initial fill
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

  get latestStroke() {
    if (this.editableStrokesInUse === 0) {
      console.log("no stroke to get!");
      return;
    }
    return this.editableStrokes[this.editableStrokesInUse-1];
  }

  get latestParentStroke() {
    if (this.editableStrokesInUse === 0) {
      console.log("no stroke to get!");
      return;
    }
    for (let i = this.editableStrokesInUse-1; i >= 0; i--) {
      const stroke = this.editableStrokes[i];
      if (stroke.compositeOperation === "source-over") return stroke;
    }
    console.log("no parent stroke found!");
    return;
  }

  get brushSettingsToAdjust() {
    if (Interaction.editingLastStroke) return this.latestStroke.settings;
    return openPainting.currentBrush;
  }

  // WIP, color could be applied under the buffers instead
  // so that this doesn't actually clear anything
  clearWithColor(color) {
    this.lowestBuffer.background(color.hex);
    this.editableStrokes.forEach((stroke) => {
      stroke.reset();
    });
    this.editableStrokesInUse = 0;
    this.totalStrokesCount = 0;

    // reset snapshot
    this.updateCombinedBuffer();
    this.updateSnapshotBuffer({x: width/2, y: height/2});
  }

  // WIP: this is currently called every frame, which isn't necessary.
  // but seems fast enough for now.
  updateCombinedBuffer() {
    this.combinedBuffer.image(this.lowestBuffer, 0, 0);

    let usingTempBuffer = false;
    this.usedEditableStrokes.forEach((stroke, index) => {

      const nextStroke = this.usedEditableStrokes.length > (index+1) ? this.usedEditableStrokes[index+1] : undefined;
      const drawToTemporaryBuffer = (nextStroke && nextStroke.compositeOperation !== "source-over") || stroke.compositeOperation !== "source-over";
      const drawToCombinedBuffer = (!nextStroke) || (nextStroke && nextStroke.compositeOperation === "source-over");

      if (drawToTemporaryBuffer) {
        if (!usingTempBuffer) {
          // initialize first
          // create temporary buffer and don't draw yet
          this.temporaryCompositionBuffer.clear();
          usingTempBuffer = true;
        }
        this.temporaryCompositionBuffer.drawingContext.globalCompositeOperation = stroke.compositeOperation;
        this.temporaryCompositionBuffer.image(stroke.buffer, 0, 0);
      } 
      
      if (drawToCombinedBuffer) {
        if (nextStroke === undefined && Interaction.currentCompositionMode !== "source-over") {
          // softly blinking shadow on stroke that is being erased/ drawn in
          const contrastingLightness = (stroke.settings.color.lightness > 0.5 ? 0.5 : 2) * stroke.settings.color.lightness;
          this.combinedBuffer.drawingContext.shadowColor = stroke.settings.color.copy().setLightness(contrastingLightness).hex;
          this.combinedBuffer.drawingContext.shadowBlur = 10 + (sin(millis()/100)/2 + 0.5) * 20;
        }
        if (usingTempBuffer) {
          this.combinedBuffer.image(this.temporaryCompositionBuffer, 0, 0);
          usingTempBuffer = false;
        } else {
          this.combinedBuffer.image(stroke.buffer, 0, 0);
        }
        this.combinedBuffer.drawingContext.shadowBlur = 0; // reset
      } 
    });
  }

  updateSnapshotBuffer(point) {
    this.snapshotBuffer.clear();

    //constrain point to canvas
    const snapshotSize = UI.KNOB_SIZE * 2;
    point.x = constrain(point.x, snapshotSize/2, this.width - snapshotSize/2);
    point.y = constrain(point.y, snapshotSize/2, this.height - snapshotSize/2);

    //get crop around the point with width and height of snapshotSize
    this.snapshotBuffer.image(this.combinedBuffer, 
      0, 0, snapshotSize, snapshotSize, //destination
      point.x - snapshotSize/2, point.y - snapshotSize/2, snapshotSize, snapshotSize //source
    );
  }

  flattenOldestStroke() {
    // remove stroke, get buffer
    const oldestStrokeIsParent = this.editableStrokes.length>1 && this.editableStrokes[1].compositeOperation !== "source-over";
    const flattenedStroke = oldestStrokeIsParent ? this.editableStrokes.splice(1, 1)[0] : this.editableStrokes.shift();
    const destinationBuffer = oldestStrokeIsParent ? this.editableStrokes[0].buffer : this.lowestBuffer;

    // draw to destination
    destinationBuffer.drawingContext.globalCompositeOperation = flattenedStroke.compositeOperation;
    destinationBuffer.image(flattenedStroke.buffer, 0, 0);
    destinationBuffer.drawingContext.globalCompositeOperation = "source-over";

    // add again to the end after clearing
    flattenedStroke.reset();
    flattenedStroke.compositeOperation = "source-over";
    this.editableStrokes.push(flattenedStroke);
    this.editableStrokesInUse -= 1;
  }

  startStroke(brushSettings) {
    if (this.editableStrokesInUse > 0) this.averagePressure = this.latestStroke.averagePressureInLast(20);
    if (this.editableStrokesInUse > this.editableStrokes.length - 1) this.flattenOldestStroke();
    this.editableStrokesInUse++;
    this.totalStrokesCount++;
    //console.log("started new stroke:", this.editableStrokesInUse);
    const currentStroke = this.editableStrokes[this.editableStrokesInUse-1];
    currentStroke.reset();
    currentStroke.compositeOperation = Interaction.currentCompositionMode;
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
    this.latestStroke.compositeOperation = "source-over";
    this.editableStrokesInUse--;
    this.totalStrokesCount--;
    console.log(this.editableStrokesInUse, "editable strokes still present.")
  }

  download() {
    const timestamp = new Date().toLocaleString().replace(/[-:T.]/g, "-").replace(/, /g, "_");
    const exportCrop = {
      x: Math.floor(this.width * this.cropWidthMultiplier),
      y: Math.floor(this.height * this.cropHeightMultiplier)
    }
    const exportBuffer = createGraphics(exportCrop.x, exportCrop.y);
    exportBuffer.image(this.combinedBuffer, 0, 0);
    saveCanvas(exportBuffer, "drawlab-canvas_" + timestamp, "png");
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
    const beforePoint = (this.latestStroke.points.length > 2) ? this.latestStroke.points[this.latestStroke.points.length-3] : undefined;

    this.latestStroke.drawPart(lastPoint, newPoint, beforePoint);
  }

  getPointRGB(point) {
    const buffer = openPainting.combinedBuffer;

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

  static currentCompositionMode = "source-over";

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
  static elementTypeAtPointer = null; // starting/hover type if there is an element at the pointer

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
      fill: 'fillButton',
      format: 'formatButton'
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
    },
    cloverButton: {
      hueAndVar: 'hueAndVarButton',
      satAndLum: 'satAndLumButton',
      size: 'sizeButton',
      eyedropper: 'eyeDropperButton'
    }
  };

  static get isAlreadyDown() {
    return (Interaction.currentType !== null && Interaction.currentType !== Interaction.TYPES.painting.hover);
  }

  static adjustCanvasSize(windowWidth, windowHeight) {
    resizeCanvas(windowWidth, windowHeight);
    UI.buffer.resizeCanvas(width, height);
    UI.updateDimensionsForBreakpoint(width, height);
  }

  static lostFocus() {
    Interaction.currentType = null;
    Interaction.changeCursorTo('auto');
    Interaction.currentSequence = [];
    Interaction.currentUI = Interaction.UI_STATES.nothing_open;
  }

  static changeCursorTo(keyword) {
    // console.log("changed cursor to ", keyword)
    if (keyword === 'crosshair') {
      document.body.style.cursor = 'url(assets/crosshair.svg) 12 12, ' + keyword;
      return;
    }
    document.body.style.cursor = keyword;
  }

  static changeCursorToHover(element) {
    // console.log("switched hover to element ", element)

    if (element === undefined) {
      // default hover
      if (Interaction.currentUI === Interaction.UI_STATES.nothing_open) {
        if (Interaction.editingLastStroke) {
          Interaction.changeCursorTo('move');
          return;
        }
        Interaction.changeCursorTo('crosshair');
        return;
      } 
      
      if (Interaction.currentUI === Interaction.UI_STATES.eyedropper_open) {
        Interaction.changeCursorTo('crosshair');
        return;
      } 
      
      // default, for any other UI right now.
      Interaction.changeCursorTo('grab');
      return;
    }

    if (Object.values(Interaction.TYPES.knob).includes(element)) {
      Interaction.changeCursorTo('ew-resize');
    } else if (Object.values(Interaction.TYPES.slider).includes(element)) {
      Interaction.changeCursorTo('auto');
    } else if (Object.values(Interaction.TYPES.button).includes(element)) {
      Interaction.changeCursorTo('pointer');
    } else if (Object.values(Interaction.TYPES.cloverButton).includes(element)) {
      Interaction.changeCursorTo('grab');
    } else { 
      // WIP, this is currently used for leaving buttons in edit mode for some reason.
      // Should probably just be 'auto' and not occur.
      Interaction.changeCursorToHover();
    }
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
    // take into account the painting format
    const cropOffset = {
      x: (openPainting) ? openPainting.width * (1-openPainting.cropWidthMultiplier)/2 : 0,
      y: (openPainting) ? openPainting.height * (1-openPainting.cropHeightMultiplier)/2 : 0
    }
    Interaction.viewTransform.scale = 1;
    Interaction.viewTransform.panX = cropOffset.x;
    Interaction.viewTransform.panY = cropOffset.y; // start slightly lower than centered
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

  static eyedrop(new_interaction) {
    Interaction.currentSequence = [new_interaction];
    const brushToAdjust = openPainting.brushSettingsToAdjust;
    const combinedRGB = openPainting.getPointRGB(new_interaction.addPaintingTransform());
    brushToAdjust.color = HSLColor.fromRGBwithFallback(combinedRGB[0], combinedRGB[1], combinedRGB[2], brushToAdjust.color);
    if (Interaction.editingLastStroke) openPainting.redrawLatestStroke();
  }

  static updateSnapshotAt(interaction) {
    let focusPoint = interaction.addPaintingTransform();

    // TODO: neat but makes little sense with eyedropper.
    // if (openPainting.editableStrokesCount > 0) {
    //   const center = openPainting.latestStroke.center;
    //   focusPoint.x = lerp(center.x, focusPoint.x, 0.5);
    //   focusPoint.y = lerp(center.y, focusPoint.y, 0.5);
    // }

    openPainting.updateSnapshotBuffer(focusPoint);
  }

  static keyStart(key) {

    // if a pointer is currently down, don't even register most keys and just do nothing.
    const validWhileDown = ["Shift"];
    if (!validWhileDown.includes(key) && Interaction.currentType !== Interaction.TYPES.painting.hover && Interaction.currentType !== null) return;

    // also ignore ANY additional keypress on top of an existing one. this could later be changed
    // to allow specific multi-key combos.
    if (Interaction.pressedKeys.size > 0) return;

    // otherwise, keep track of which key was pressed and react to the keypress.
    Interaction.pressedKeys.add(key);
    if (dev_mode) console.log('Keys held:', Array.from(Interaction.pressedKeys).join(', '));

    if (key === "f") {
      Interaction.rotateHueAction();
      if (Interaction.editingLastStroke) {
        openPainting.redrawLatestStroke();
        Interaction.stopEditing();
      }
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      //console.log('rotate to: '+ openPainting.hueRotation, 'current hue: '+ openPainting.currentBrush.color.hue);
    } else if (key === "s") {
      Interaction.saveAction();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.changeCursorToHover();
      Interaction.resetCurrentSequence();
    } else if (key === "u") {
      Interaction.undoAction();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.changeCursorToHover();
      Interaction.resetCurrentSequence();
    } else if (key === "e") {
      Interaction.editAction();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.changeCursorToHover();
      Interaction.resetCurrentSequence();
    } else if (key === "1") {
      Interaction.addToBrushHistory();
      Interaction.currentUI = Interaction.UI_STATES.satAndLum_open;
      Interaction.changeCursorTo('grab');
      Interaction.resetCurrentSequence();
    } else if (key === "2") {
      Interaction.addToBrushHistory();
      Interaction.currentUI = Interaction.UI_STATES.hueAndVar_open;
      Interaction.changeCursorTo('grab');
      Interaction.resetCurrentSequence();
    } else if (key === "3") {
      Interaction.addToBrushHistory();
      Interaction.currentUI = Interaction.UI_STATES.size_open;
      Interaction.changeCursorTo('grab');
      Interaction.resetCurrentSequence();
    } else if (key === "4") {
      Interaction.addToBrushHistory();
      Interaction.currentUI = Interaction.UI_STATES.eyedropper_open;
    } else if (key === "r") {
      Interaction.resetViewTransform();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.changeCursorToHover();
      Interaction.resetCurrentSequence();
    } else if (key === "h") {
      Interaction.toggleHelp();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.changeCursorToHover();
      Interaction.resetCurrentSequence();
    } else if (key === "c") {
      Interaction.clipCompositionMode();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.changeCursorToHover();
      Interaction.resetCurrentSequence();
    } else if (key === "x") {
      Interaction.eraseCompositionMode();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.changeCursorToHover();
      Interaction.resetCurrentSequence();
    } 
    // else if (key === "z") {
    //   // print current brush in all forms
    //   console.log(openPainting.currentBrush);
    // }
  }

  static resetCurrentSequence() {
    Interaction.currentType = null;
    if (Interaction.currentSequence.length > 0) {
      Interaction.lastInteractionEnd = Interaction.currentSequence[Interaction.currentSequence.length-1];
    } else {
      if (dev_mode) console.log("last interaction was not overwritten");
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

    // TODO: Modifier keys should be in an array in the class, easier to check.
    if (key !== "e" && key !== "Shift") {
      Interaction.stopEditing();
    }

    Interaction.resetCurrentSequence();
    Interaction.changeCursorToHover();
  }

  static addToBrushHistory() {
    // adds a copy of the brush settings that are about to be changed to the
    // brush history. wip: if there was no change, this should be reverted
    openPainting.previousBrushes.push(openPainting.brushSettingsToAdjust.copy());
    if (openPainting.previousBrushes.length > Interaction.MAX_BRUSH_HISTORY_LENGTH) {
      openPainting.previousBrushes.shift();
    }
    openPainting.previousHueRotation = openPainting.hueRotation;
  }

  static saveAction() {
    // commit strokes to the painting
    openPainting.updateCombinedBuffer();
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

  static nextCanvasFormat() {
    Interaction.stopEditing();
    if (openPainting.cropWidthMultiplier === openPainting.cropHeightMultiplier) {
      // was square
      openPainting.cropWidthMultiplier  = 3/4;
      openPainting.cropHeightMultiplier = 1;
    } else if (openPainting.cropWidthMultiplier < openPainting.cropHeightMultiplier) {
      // was portrait
      openPainting.cropWidthMultiplier  = 1;
      openPainting.cropHeightMultiplier = 3/4;
    } else {
      // was landscape
      openPainting.cropWidthMultiplier  = 1;
      openPainting.cropHeightMultiplier = 1;
    }
    Interaction.resetViewTransform();
  }

  static undoAction() {
    openPainting.popLatestStroke();
    Interaction.stopEditing();
  }

  static clipCompositionMode() {
    if (openPainting.editableStrokesCount === 0) return;
    if (Interaction.currentCompositionMode === "source-atop") {
      Interaction.currentCompositionMode = "source-over";
    } else {
      Interaction.currentCompositionMode = "source-atop";
    }
  }

  static eraseCompositionMode() {
    if (openPainting.editableStrokesCount === 0) return;
    if (Interaction.currentCompositionMode === "destination-out") {
      Interaction.currentCompositionMode = "source-over";
    } else {
      Interaction.currentCompositionMode = "destination-out";
    }
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

  static processSlider(new_interaction) {
    const middle_width = UI.SLIDER_WIDTH + 120;
    const xInMiddleSection = new_interaction.x - width/2 + middle_width/2;
    const brushToAdjust = openPainting.brushSettingsToAdjust;
    const percentOfSlider = (sliderNumber) => map(xInMiddleSection - UI.KNOB_SIZE, UI.SLIDER_RANGE_MARGIN, UI.SLIDER_WIDTH-UI.SLIDER_RANGE_MARGIN, 0, 1);

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

    if (x < UI.BUTTON_WIDTH && y < UI.BUTTON_HEIGHT) {
      // first button
      return Interaction.TYPES.button.undo;

    } else if (x < UI.BUTTON_WIDTH * 2 && y < UI.BUTTON_HEIGHT) {
      // second button
      return Interaction.TYPES.button.edit;

    } else if (x > width - UI.BUTTON_WIDTH && y < UI.BUTTON_HEIGHT) {
      // rightmost button
      return Interaction.TYPES.button.save;

    } else if (x > width - UI.BUTTON_WIDTH*2 && y < UI.BUTTON_HEIGHT) {
      // second to last
      return Interaction.TYPES.button.clear;

    } else {

      const middle_width = UI.SLIDER_WIDTH + 120;
      const xInMiddleSection = x - width/2 + middle_width/2;
      const sliderSectionStart = (UI.topAlignSliderSection ? 0 : UI.BUTTON_HEIGHT);

      if (xInMiddleSection > 0 && xInMiddleSection < UI.KNOB_SIZE && 
        y > sliderSectionStart && y < UI.KNOB_SIZE + sliderSectionStart) {
        return Interaction.TYPES.knob.size;
      } 
      if (xInMiddleSection > 60 && xInMiddleSection < (60 + UI.SLIDER_WIDTH) && 
        y > sliderSectionStart && y < UI.SLIDER_HEIGHT * 3 + sliderSectionStart) {
          if ( y < UI.SLIDER_HEIGHT + sliderSectionStart) {
            return Interaction.TYPES.slider.lightness;
          } else if (y < UI.SLIDER_HEIGHT * 2 + sliderSectionStart) {
            return Interaction.TYPES.slider.saturation;
          } else if (y < UI.SLIDER_HEIGHT * 3 + sliderSectionStart) {
            return Interaction.TYPES.slider.hue;
          }
        } 
      if (xInMiddleSection > (UI.KNOB_SIZE + UI.SLIDER_WIDTH) && xInMiddleSection < (UI.KNOB_SIZE*2 + UI.SLIDER_WIDTH) && 
        y > sliderSectionStart && y < UI.KNOB_SIZE + sliderSectionStart) {
          return Interaction.TYPES.knob.jitter;
      }
    }

    if ((x < UI.BUTTON_WIDE || x > width-UI.BUTTON_WIDE) && Interaction.currentUI === Interaction.UI_STATES.clover_open) {
      const buttonY = y - UI.BUTTON_WIDTH; // how far down these buttons start
      const buttonIndex = Math.floor(buttonY / UI.BUTTON_HEIGHT);

      if (x<UI.BUTTON_WIDE) {
        // left side
        if (buttonIndex === 0) {
          return Interaction.TYPES.button.tool0;
        } else if (buttonIndex === 1) {
          return Interaction.TYPES.button.tool1;
        } else if (buttonIndex === 2) {
          return Interaction.TYPES.button.tool2;
        }
      } else {
        // right side
        if (buttonIndex === 0) {
          return Interaction.TYPES.button.fill;
        } else if (buttonIndex === 1) {
          return Interaction.TYPES.button.format;
        } 
      }
      
    }

    if (x > width - UI.BUTTON_WIDTH && y > height - UI.BUTTON_HEIGHT && width > UI.MOBILE_WIDTH_BREAKPOINT) {
      return Interaction.TYPES.button.help;
    }

    // clover buttons
    if (Interaction.currentUI === Interaction.UI_STATES.clover_open) {
      const deltaFromCenter = {
        x: x - Interaction.lastInteractionEnd.x,
        y: y - Interaction.lastInteractionEnd.y
      };
      if (Math.abs(deltaFromCenter.x) < 10 && Math.abs(deltaFromCenter.y) < 10) {
        return null; // near center
      }
      if (Math.abs(deltaFromCenter.x) > Math.abs(deltaFromCenter.y)) {
        // horizontal
        if (deltaFromCenter.x < 0) {
          return Interaction.TYPES.cloverButton.size;
        } 
        return Interaction.TYPES.cloverButton.hueAndVar;
      } else {
        // vertical
        if (deltaFromCenter.y < 0) {
          return Interaction.TYPES.cloverButton.eyedropper;
        } 
        return Interaction.TYPES.cloverButton.satAndLum;
      }
    }

    return null;
  }

  static isAboveDragThreshhold(sequence) {
    if (sequence.length < 2) return false;

    const totalDeltaTime = sequence[sequence.length-1].timeStamp - sequence[0].timeStamp;
    const boxDistance = Interaction.distance2d(sequence[sequence.length-1], sequence[0]);
    const totalDistance = sequence.reduce((sum, currentPoint, index, arr) => {
      if (index < arr.length - 1) {
        return sum + Interaction.distance2d(currentPoint, arr[index + 1]);
      }
      return sum;
    }, 0);

    return (totalDeltaTime > 200 || totalDistance > 10 || boxDistance > 4);
  }

  static pointerStart(event) {

    event.preventDefault();
    const new_interaction = Interaction.fromEvent(event);

    if (!event.isPrimary && event.pointerType === "touch") {
      if (Interaction.currentType === Interaction.TYPES.painting.initStroke) {
        Interaction.currentType = Interaction.TYPES.painting.zoom;
        Interaction.currentSequence.push(new_interaction);
      } else if (Interaction.currentType === Interaction.TYPES.painting.zoom) {
        // third finger resets all transforms.
        Interaction.resetViewTransform();
        Interaction.currentSequence = [];
      }
      return;
    }

    // tapped on an element?
    Interaction.elementTypeAtPointer = Interaction.typeFromCoords(new_interaction.x, new_interaction.y) ?? null;
    
    // when no second pointer was already down
    if (Interaction.elementTypeAtPointer !== null && !Interaction.isAlreadyDown) {

      Interaction.currentType = Interaction.elementTypeAtPointer;

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
        
      } else if (Object.values(Interaction.TYPES.button).includes(Interaction.currentType)) {

        Interaction.currentSequence = [new_interaction];

      } else if (Object.values(Interaction.TYPES.cloverButton).includes(Interaction.currentType)) {

        Interaction.currentSequence = [new_interaction];

      }
      return;
    }

    if (!Interaction.isAlreadyDown) {
      // new pointer down! no existing gesture.

      if (Interaction.currentUI === Interaction.UI_STATES.satAndLum_open) {

        Interaction.currentSequence = [new_interaction];
        Interaction.currentType = Interaction.TYPES.gizmo.satAndLum;
        Interaction.changeCursorTo('grabbing');

      } else if (Interaction.currentUI === Interaction.UI_STATES.hueAndVar_open) {

        Interaction.currentSequence = [new_interaction];
        Interaction.currentType = Interaction.TYPES.gizmo.hueAndVar;
        Interaction.changeCursorTo('grabbing');
        
      } else if (Interaction.currentUI === Interaction.UI_STATES.size_open) {

        Interaction.currentSequence = [new_interaction];
        Interaction.currentType = Interaction.TYPES.gizmo.size;
        Interaction.changeCursorTo('grabbing');
        
      } else if (Interaction.currentUI === Interaction.UI_STATES.eyedropper_open) {

        Interaction.currentSequence = [new_interaction];
        openPainting.updateCombinedBuffer();
        Interaction.currentType = Interaction.TYPES.painting.eyedropper;
        Interaction.changeCursorTo('none');
        Interaction.eyedrop(new_interaction); // eyedrop right away
        
      } else if (Interaction.currentUI === Interaction.UI_STATES.nothing_open) {

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
        console.log("could not find a point that corresponds to one of the zoom touches!")
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
    // only actually do this if there is no ongoing gesture, for example drawing - in which case no hover state should be shown.
    const PREVIOUS_ELEMENT_TYPE_AT_POINTER = Interaction.elementTypeAtPointer;

    const detect_leaving_element = PREVIOUS_ELEMENT_TYPE_AT_POINTER !== null;
    const detect_entering_without_gesture = (Interaction.currentType === null || Interaction.currentType === Interaction.TYPES.painting.hover);
    if (detect_leaving_element || detect_entering_without_gesture) {
      Interaction.elementTypeAtPointer = Interaction.typeFromCoords(new_interaction.x, new_interaction.y);
    }

    if (Object.values(Interaction.TYPES.button).includes(Interaction.currentType)) {

      // started on a button
      if (Interaction.elementTypeAtPointer !== Interaction.currentType) {
        // if no longer on the button, reset 
        console.log("left the button")
        Interaction.currentType = null;
        Interaction.changeCursorTo('auto');
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

      // not over an element, not in edit mode
      if (Interaction.elementTypeAtPointer === null 
        && !Interaction.editingLastStroke) {

        // start hover
        Interaction.currentType = Interaction.TYPES.painting.hover;
        Interaction.changeCursorToHover();
        Interaction.currentSequence.push(new_interaction);

      } else if (PREVIOUS_ELEMENT_TYPE_AT_POINTER !== Interaction.elementTypeAtPointer) {
        // react if the hover element has changed by adjusting the cursor.
        Interaction.changeCursorToHover(Interaction.elementTypeAtPointer);
      }

    } else if (Interaction.currentType === Interaction.TYPES.painting.hover) {

      // stop if hover goes over an element
      if (Interaction.elementTypeAtPointer !== null) {
        Interaction.currentType = null;
        Interaction.changeCursorToHover(Interaction.elementTypeAtPointer);
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

    } else if (Object.values(Interaction.TYPES.cloverButton).includes(Interaction.currentType)) {

      // dragging over a clover button starts this mode.
      // switch to gizmo if dragged far enough.
      
      Interaction.currentSequence.push(new_interaction);
      if (Interaction.isAboveDragThreshhold(Interaction.currentSequence)) {
        if (Interaction.currentType === Interaction.TYPES.cloverButton.size) {

          // start size gizmo
          Interaction.addToBrushHistory();
          Interaction.currentUI = Interaction.UI_STATES.size_open;
          Interaction.currentType = Interaction.TYPES.gizmo.size;
          Interaction.changeCursorTo('grabbing');
          Interaction.currentSequence = [Interaction.currentSequence[0]]; //start with just the last point as reference

        } else if (Interaction.currentType === Interaction.TYPES.cloverButton.hueAndVar) {

          // start hue and var gizmo
          Interaction.addToBrushHistory();
          Interaction.currentUI = Interaction.UI_STATES.hueAndVar_open;
          Interaction.currentType = Interaction.TYPES.gizmo.hueAndVar;
          Interaction.changeCursorTo('grabbing');
          Interaction.currentSequence = [Interaction.currentSequence[0]]; //start with just the last point as reference

        } else if (Interaction.currentType === Interaction.TYPES.cloverButton.eyedropper) {

          // start eyedropper
          Interaction.addToBrushHistory();
          openPainting.updateCombinedBuffer();
          Interaction.currentType = Interaction.TYPES.painting.eyedropper;
          Interaction.changeCursorTo('none');
          Interaction.currentUI = Interaction.UI_STATES.eyedropper_open;
          Interaction.currentSequence = [Interaction.currentSequence[0]]; //start with just the last point as reference

        } else if (Interaction.currentType === Interaction.TYPES.cloverButton.satAndLum) {

          // start sat and lum gizmo
          Interaction.addToBrushHistory();
          Interaction.currentUI = Interaction.UI_STATES.satAndLum_open;
          Interaction.currentType = Interaction.TYPES.gizmo.satAndLum;
          Interaction.changeCursorTo('grabbing');
          Interaction.currentSequence = [Interaction.currentSequence[0]]; //start with just the last point as reference
        }

        // otherwise, will count as a click and close the clover menu on pointerEnd.
      }

    } else if (Interaction.currentType === Interaction.TYPES.painting.initStroke) { 

      // dragging over the canvas first starts this mode.
      // switch to drawing/moving if dragged far enough.
      // otherwise, the interaction counts as a click: the clover gizmo will open when the interaction ends.
      Interaction.currentSequence.push(new_interaction);
      if (Interaction.isAboveDragThreshhold(Interaction.currentSequence)) {

        if (Interaction.editingLastStroke) {
          // move brushstroke
          Interaction.currentType = Interaction.TYPES.painting.move;
          // WIP, should this already lead to movement in this first interaction?

        } else {

          // start brushstroke
          Interaction.currentType = Interaction.TYPES.painting.draw;
          openPainting.startStroke(openPainting.currentBrush.copy());

          // draw the existing segments that have not been drawn yet all at once
          // this code isn't pretty but seems to works
          const segmentsToAddImmediately = Interaction.currentSequence;
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

      Interaction.eyedrop(new_interaction);

    } else if (Interaction.currentType === Interaction.TYPES.gizmo.satAndLum) { 

      Interaction.currentSequence[1] = new_interaction;
      const brushToAdjust = openPainting.brushSettingsToAdjust;
      const brushToReference = openPainting.previousBrush;

      const deltaX = Interaction.currentSequence[1].x - Interaction.currentSequence[0].x;
      const deltaY = Interaction.currentSequence[1].y - Interaction.currentSequence[0].y;
      const rangeX = UI.GIZMO_SIZE * 2;
      const rangeY = UI.GIZMO_SIZE * 2;

      // WIP: this can work if the previousBrush also comes with a hueRotation value

      //Map to chroma and lightness
      const preMultSat = 0.5 + brushToReference.color.saturation * (openPainting.previousHueRotation === 0 ? 0.5 : - 0.5);
      const newSat = map( deltaX + rangeX * (preMultSat), 0, rangeX, -1, 1, true);
      // this range thing does not work.

      if (newSat < 0 && openPainting.hueRotation === 0) {
        Interaction.rotateHueAction();
      } else if (newSat >= 0 && openPainting.hueRotation !== 0) {
        Interaction.rotateHueAction();
      }
      brushToAdjust.color.setSaturation(Math.abs(newSat));
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
      Interaction.changeCursorTo('auto');
      Interaction.currentSequence = [];
      // other pointer end will be ignored
    }

    if (!event.isPrimary && event.pointerType === "touch") return;

    // const new_interaction = Interaction.fromEvent(event);

    if (Object.values(Interaction.TYPES.button).includes(Interaction.currentType)) {

      // ended on button
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      
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
        Interaction.elementTypeAtPointer = null;
      } else if (Interaction.currentType === Interaction.TYPES.button.tool1) {
        Interaction.pickToolAction(1);
        Interaction.elementTypeAtPointer = null;
      } else if (Interaction.currentType === Interaction.TYPES.button.tool2) {
        Interaction.pickToolAction(2);
        Interaction.elementTypeAtPointer = null;
      } else if (Interaction.currentType === Interaction.TYPES.button.fill) {
        Interaction.fillAction();
        Interaction.elementTypeAtPointer = null;
      } else if (Interaction.currentType === Interaction.TYPES.button.format) {
        Interaction.nextCanvasFormat();
        Interaction.elementTypeAtPointer = null;
      }
      Interaction.resetCurrentSequence();

    } else if (Object.values(Interaction.TYPES.knob).includes(Interaction.currentType)) {

      // started on a knob
      Interaction.resetCurrentSequence();
      Interaction.changeCursorToHover();
      Interaction.stopEditing();

    } else if (Object.values(Interaction.TYPES.slider).includes(Interaction.currentType)) {

      // started on a slider
      Interaction.resetCurrentSequence();
      Interaction.changeCursorToHover();
      Interaction.stopEditing();
      
      // TODO: reset hover info only if the pointer does not actually support hover.
      // The same goes for the knob and button types.
      //Interaction.elementTypeAtPointer = null;

    } else if (Interaction.currentType === Interaction.TYPES.painting.draw) {

      // try drawing here still,wip?
      Interaction.resetCurrentSequence();

      // update snapshot around end of brushstroke
      openPainting.updateCombinedBuffer(); // TODO: is this overkill on every stroke? maybe keep track to avoid doing twice in some frames
      Interaction.updateSnapshotAt(Interaction.lastInteractionEnd);

    } else if (Interaction.currentType === Interaction.TYPES.painting.move) {

      // try moving here still,wip?
      Interaction.resetCurrentSequence();
      Interaction.stopEditing();
      Interaction.changeCursorToHover();

    } else if (Interaction.currentType === Interaction.TYPES.painting.initStroke) {

      // open menu
      Interaction.currentUI = Interaction.UI_STATES.clover_open;
      Interaction.changeCursorToHover();
      Interaction.resetCurrentSequence();

    } else if (Object.values(Interaction.TYPES.cloverButton).includes(Interaction.currentType)) {

      // clicked clover instead of dragging
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.elementTypeAtPointer = null;
      Interaction.changeCursorToHover();
      Interaction.stopEditing();
      Interaction.resetCurrentSequence();

    } else if (Object.values(Interaction.TYPES.gizmo).includes(Interaction.currentType)) {

      Interaction.changeCursorToHover();
      if (Interaction.pressedKeys.has("1") || Interaction.pressedKeys.has("2") || Interaction.pressedKeys.has("3")) { // keep open because key is still held
        Interaction.currentType = null;
        Interaction.addToBrushHistory();
        return;
      } 
      Interaction.resetCurrentSequence();
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.stopEditing();

    } else if (Interaction.currentType === Interaction.TYPES.painting.eyedropper) {

      Interaction.changeCursorToHover();
      if (Interaction.pressedKeys.has("4")) { // keep open because key is still held
        Interaction.currentType = null;
        Interaction.addToBrushHistory();
        return;
      } 
      Interaction.resetCurrentSequence();
      Interaction.updateSnapshotAt(Interaction.lastInteractionEnd);
      Interaction.currentUI = Interaction.UI_STATES.nothing_open;
      Interaction.stopEditing();

    } else {

      if (Interaction.currentUI === Interaction.UI_STATES.clover_open) {
        // close clover
        Interaction.currentUI = Interaction.UI_STATES.nothing_open;
        Interaction.elementTypeAtPointer = null;
        Interaction.stopEditing();
        Interaction.changeCursorToHover();
      } else {
        if (dev_mode) console.log("pointerEnd with unknown type: " + Interaction.currentType);
        Interaction.changeCursorToHover();
      }
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
    Interaction.changeCursorToHover();
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
    return (noise(seed * 10000)) * 2 - 1;
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
    const rgbArray = okhsl_to_srgb(this.hue, this.saturation, this.lightness); // from conversion helpers file
    // make sure none are below 0
    // TODO: why does this even happen? Should investigate and remove this fix if not needed anymore.
    return rgbArray.map((value) => Math.max(0, value));
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
    return new HSLColor(this.h, Math.min(this.s, 0.1), this.l * 0.8, this.a);
  }

  brighter() {
    return new HSLColor(this.h, this.s, Math.min(this.l + 0.2, 1), this.a);
  }

  varyComponents(seed, chaos = 0.5) {
    if (chaos === 0) return this;

    const lowCurve = (x) => (x * x * x) * 0.5;
    const highCurve = (x) => 1 - Math.pow(1 - x, 3);
    const customColorEasing = (value, chaos) => lerp(lowCurve(value), highCurve(value), chaos * chaos);

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
    this.s = Math.max(-1, Math.min(1, this.s));
    if (this.s < 0) {
      //flip hue and saturation
      this.s = - this.s;
      this.h += 0.5;
    }

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

  static ELEMENT_MARGIN = 2;
  static ELEMENT_RADIUS = 16;

  static BUTTON_WIDTH = 70;
  static BUTTON_WIDE = 120;
  static BUTTON_HEIGHT = 50;

  // sliders can be dragged over a 200 pixel range that corresponds to 0-1, but are a bit wider
  // so that they include the start and end color with the width of one half of the slider height.
  // this would make especially much sense for completely rounded sliders, but feels better to me in general.
  // the button height already contains the UI.ELEMENT_MARGIN, which was previously added to the slider width instead.
  
  static KNOB_SIZE = 70;
  static SLIDER_RANGE_MARGIN = 18; // can't be too low, or the slider roundness intersects.
  static SLIDER_WIDTH = 200 + UI.SLIDER_RANGE_MARGIN*2; // default
  static SLIDER_HEIGHT = 36;
  static HANDLE_MARGIN = 4;
  
  static updateDimensionsForBreakpoint(width, height) {
    const freeSpace = UI.SLIDER_RANGE_MARGIN;
    UI.SLIDER_WIDTH = width - UI.KNOB_SIZE*2 - UI.BUTTON_WIDTH*4 - freeSpace*2;
    UI.SLIDER_WIDTH = constrain(UI.SLIDER_WIDTH, 160, 600);
  }

  static get topAlignSliderSection() {
    return (width > UI.KNOB_SIZE*2 + UI.BUTTON_WIDTH*4 + UI.SLIDER_WIDTH);
  }

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
      .setLightness(lerp(openPainting.currentBrush.color.lightness, (openPainting.currentBrush.color.lightness>0.5) ? 0 : 1, 0.5))
      .setSaturation(openPainting.currentBrush.color.saturation * 0.2)
      .setHue(UI.palette.bg.hue);
    UI.palette.warning = new HSLColor(0.1, 0.8, (UI.palette.fg.lightness > 0.5) ? 0.7 : 0.4);
    
    // MENUS
    // when clover open
    if (Interaction.currentUI === Interaction.UI_STATES.clover_open) {
      // tool buttons on left
      PRESET_TOOLS.forEach((preset, index) => {
        const x = 0;
        const y = UI.BUTTON_HEIGHT * index + UI.BUTTON_WIDTH; // lower by button width
        UI.displayTool(preset.tool, preset.texture, x, y, preset.menuName);
      });

      // menu on right
      UI.drawRightButton("fill all",    UI.BUTTON_HEIGHT * 0 + UI.BUTTON_WIDTH, Interaction.TYPES.button.fill, UI.palette.warning);
      UI.drawRightButton("change crop", UI.BUTTON_HEIGHT * 1 + UI.BUTTON_WIDTH, Interaction.TYPES.button.fill, UI.palette.fg);
    }
  
    // top menu buttons
    UI.buffer.textAlign(CENTER);
    UI.buffer.textFont(FONT_MEDIUM);
  
    const noEditableStrokes = (openPainting.editableStrokesCount === 0);
    const noStrokes = (openPainting.totalStrokesCount === 0);
    UI.drawButton("undo" ,       UI.BUTTON_WIDTH*0, 0, Interaction.TYPES.button.undo , noEditableStrokes ? UI.palette.fgDisabled : UI.palette.fg);
    UI.drawButton("edit" ,       UI.BUTTON_WIDTH*1, 0, Interaction.TYPES.button.edit , noEditableStrokes ? UI.palette.fgDisabled : UI.palette.fg);
    UI.drawButton("clear", width-UI.BUTTON_WIDTH*2, 0, Interaction.TYPES.button.clear, noStrokes ? UI.palette.fgDisabled : UI.palette.warning);
    UI.drawButton("save" , width-UI.BUTTON_WIDTH*1, 0, Interaction.TYPES.button.save , noStrokes ? UI.palette.fgDisabled : UI.palette.fg);

    if (width > UI.MOBILE_WIDTH_BREAKPOINT) {
      UI.drawButton("help" , width-UI.BUTTON_WIDTH, height-UI.BUTTON_HEIGHT, Interaction.TYPES.button.help, UI.showingHelp ? UI.palette.fgDisabled : UI.palette.fg);
    }
    
    UI.buffer.textAlign(LEFT);
    UI.buffer.textFont(FONT_MEDIUM);
  
    // draw the sliders and knobs at the top
    const sliderStart = width/2 - UI.SLIDER_WIDTH * 0.5;

    // MIDDLE SECTION
    UI.buffer.push();
    if (!UI.topAlignSliderSection) UI.buffer.translate(0, UI.BUTTON_HEIGHT);

    // palette
    // if (![Interaction.UI_STATES.nothing_open, Interaction.UI_STATES.size_open].includes(Interaction.currentUI)) {

    //   const uniqueColors = [];
    //   const seenColors = new Set();

    //   for (const item of [...openPainting.previousBrushes, openPainting.currentBrush]) {
    //     const key = `${item.color.hue}-${item.color.saturation}-${item.color.lightness}`;
    
    //     if (!seenColors.has(key)) {
    //       seenColors.add(key);
    //       uniqueColors.push(item);
    //     }
    //   }

    //   UI.drawPalette(uniqueColors, width/2, UI.SLIDER_HEIGHT * 3 + 10, 30, 10);
    // }


    // bg
    //UI.buffer.fill(UI.palette.constrastBg.hex);
    //UI.buffer.rect(sliderStart-60, 0,  UI.SLIDER_WIDTH + 120, UI.BUTTON_HEIGHT, UI.ELEMENT_RADIUS + UI.ELEMENT_MARGIN);

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

    //size knob
    UI.drawSizeKnob(sliderStart - UI.KNOB_SIZE, 0, pressureForSizeIndicator);

    // sliders
    const relevantElements = [...Object.values(Interaction.TYPES.knob),...Object.values(Interaction.TYPES.slider)];
    // for displaying the hover for whichever slider is currently interacted with. If none, show regular hover state.
    const currentElement = relevantElements.includes(Interaction.currentType) ? Interaction.currentType : Interaction.elementTypeAtPointer;
    
    // draw the sliders themselves first
    let baseColor = openPainting.brushSettingsToAdjust.color;
    const rotatedBaseHue = (baseColor.hue+openPainting.hueRotation) % 1;
    const correctlyFlippedSaturation = (openPainting.hueRotation === 0) ? (1 + baseColor.saturation)/2 : (1 - baseColor.saturation)/2;
    const showVarOnSliders = (currentElement === Interaction.TYPES.knob.jitter);

    UI.drawGradientSlider(sliderStart, 0                       , UI.SLIDER_WIDTH, UI.SLIDER_HEIGHT, 
      baseColor.copy().setLightness(0), baseColor.copy().setLightness(1), baseColor.lightness, showVarOnSliders);
    UI.drawGradientSlider(sliderStart, 0 + UI.SLIDER_HEIGHT    , UI.SLIDER_WIDTH, UI.SLIDER_HEIGHT, 
      baseColor.copy().setSaturation(0), baseColor.copy().setSaturation(1), correctlyFlippedSaturation, showVarOnSliders, "double");
    UI.drawGradientSlider(sliderStart, 0 + UI.SLIDER_HEIGHT * 2, UI.SLIDER_WIDTH, UI.SLIDER_HEIGHT, 
      baseColor.copy().setHue(0+openPainting.hueRotation), baseColor.copy().setHue(1+openPainting.hueRotation), rotatedBaseHue, showVarOnSliders, "wrap");

    // show tooltip
    const tooltipXinSlider = (percent) => map(percent, 0, 1, UI.SLIDER_RANGE_MARGIN, UI.SLIDER_WIDTH-UI.SLIDER_RANGE_MARGIN);

    if (currentElement === Interaction.TYPES.slider.lightness) {

      const x = sliderStart + tooltipXinSlider(baseColor.lightness);
      const text = "L " + Math.floor(baseColor.lightness * 100) + "%";
      UI.drawTooltipBelow(x, UI.SLIDER_HEIGHT, text);

    } else if (currentElement === Interaction.TYPES.slider.saturation) {

      const horizontalOfSlider = (openPainting.hueRotation === 0) ? (1 + baseColor.saturation)/2 : (1 - baseColor.saturation)/2;
      const x = sliderStart + tooltipXinSlider(horizontalOfSlider);
      const text = "S " + ((openPainting.hueRotation === 0) ? "" : "-") +  Math.floor(baseColor.saturation * 100) + "%";
      UI.drawTooltipBelow(x, UI.SLIDER_HEIGHT * 2, text);


    } if (currentElement === Interaction.TYPES.slider.hue) {

      const horizontalOfSlider = (baseColor.hue+openPainting.hueRotation) % 1;
      const x = sliderStart + tooltipXinSlider(horizontalOfSlider);
      const text = "H " + Math.floor(baseColor.hue * 360) + "°";
      UI.drawTooltipBelow(x, UI.SLIDER_HEIGHT * 3, text);

    } else if (currentElement === Interaction.TYPES.knob.jitter) {

      UI.drawTooltipBelow(sliderStart + UI.SLIDER_WIDTH + UI.KNOB_SIZE/2, UI.KNOB_SIZE, Math.round(openPainting.brushSettingsToAdjust.colorVar * 100) + "%");

    } else if (currentElement === Interaction.TYPES.knob.size) {

      UI.drawTooltipBelow(sliderStart - UI.KNOB_SIZE/2, UI.KNOB_SIZE, Math.round(openPainting.brushSettingsToAdjust.sizeInPixels()) + "px");

    }
    
    // draw the variation knob
    UI.buffer.drawingContext.save();
    UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(0.5));
    UI.buffer.rect(sliderStart + UI.SLIDER_WIDTH*1 + UI.ELEMENT_MARGIN, UI.ELEMENT_MARGIN, UI.KNOB_SIZE - UI.ELEMENT_MARGIN*2, UI.KNOB_SIZE - UI.ELEMENT_MARGIN*2, UI.ELEMENT_RADIUS);
    UI.buffer.drawingContext.clip();
    UI.drawVariedColorCircle(openPainting.brushSettingsToAdjust, UI.KNOB_SIZE + 20, sliderStart + UI.SLIDER_WIDTH*1 + UI.KNOB_SIZE / 2, UI.KNOB_SIZE / 2);
    UI.buffer.drawingContext.restore();
    // outline
    UI.buffer.noFill();
    UI.buffer.strokeWeight(1);
    UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
    UI.buffer.rect(sliderStart + UI.SLIDER_WIDTH*1 + UI.ELEMENT_MARGIN, UI.ELEMENT_MARGIN, UI.KNOB_SIZE - UI.ELEMENT_MARGIN*2, UI.KNOB_SIZE - UI.ELEMENT_MARGIN*2, UI.ELEMENT_RADIUS);
    UI.buffer.noStroke();

    // center section DONE
    UI.buffer.pop();
  
    UI.buffer.textAlign(LEFT);

    // help window
    if (UI.showingHelp) {
      UI.buffer.fill(UI.palette.bg.hex);
      UI.buffer.stroke(UI.palette.constrastBg.hex);
      UI.buffer.strokeWeight(1);
      const helpShortcuts = {
        "H ": "Toggle shortcuts help",
        "1 ": "Lightness and Saturation",
        "2 ": "Hue and Variation",
        "3 ": "Brush size",
        "4 ": "Eyedropper",
        "U ": "Undo last stroke",
        "E ": "Edit last stroke",
        "X ": "Erase in last stroke",
        "C ": "Draw in last stroke",
        "S ": "Save image",
        "R ": "Reset view",
        "F ": "Flip hue",
        "Click to toggle menu": "",
        "Scroll to zoom": "",
        "Shift + scroll to rotate": ""
      }
      const helpWindowWidth = 240;
      const helpWindowHeight = 30 * Object.keys(helpShortcuts).length;
      UI.buffer.rect(
        width - helpWindowWidth - 12, 
        height - UI.BUTTON_HEIGHT - helpWindowHeight - 12, 
        helpWindowWidth + 8, 
        helpWindowHeight + 8, 
        UI.ELEMENT_RADIUS
      );
      UI.buffer.fill(UI.palette.fg.hex);
      UI.buffer.noStroke();
      Object.keys(helpShortcuts).forEach((keyString, index) => {
        UI.buffer.text(keyString, width - helpWindowWidth, 4 + height - UI.BUTTON_HEIGHT - helpWindowHeight + index * 30);
        UI.buffer.text(helpShortcuts[keyString], width - helpWindowWidth + 20, 4 + height - UI.BUTTON_HEIGHT - helpWindowHeight + index * 30);
      });
    }

    const bubbleLabels = [];
  
    // draw rectangle around stroke being edited
    if (Interaction.editingLastStroke) {
      UI.drawBounds(openPainting.latestStroke.bounds);
      bubbleLabels.push({text: "Editing last", color: UI.palette.fg});
    }

    if (Interaction.currentCompositionMode !== "source-over") {
      let label = Interaction.currentCompositionMode;
      let color = UI.palette.fg;
      if (label === "source-atop") {
        label = "Drawing inside stroke";
      } else if (label === "destination-out") {
        label = "Erasing inside stroke";
        color = UI.palette.warning;
      }
      //UI.drawBounds(openPainting.latestParentStroke.bounds);
      bubbleLabels.push({text: label, color})
    }

    UI.buffer.noStroke();
    UI.drawStateBubbles(bubbleLabels);
  
    // draw the right gadget
    if (Interaction.currentUI !== Interaction.UI_STATES.nothing_open) {
      UI.drawCurrentGizmo();
    }
    
    // DEV STUFF, normally not visible
    if (dev_mode) {
      UI.buffer.strokeWeight(2);
      UI.buffer.fill(UI.palette.fg.hex)
      UI.buffer.textAlign(LEFT);
      UI.buffer.text('ui: '         + (Interaction.currentUI ?? 'none'),              20,  80);
      UI.buffer.text('gesture: '    + (Interaction.currentType ?? 'none'),            20, 100);
      UI.buffer.text('points: '     + (Interaction.currentSequence.length ?? 'none'), 20, 120);
      UI.buffer.text('on ui: '      + (Interaction.elementTypeAtPointer ?? 'none'),   20, 140);
      UI.buffer.text('zoom: '       + (Interaction.viewTransform.scale ?? 'none'),    20, 160);
      UI.buffer.text('rotation: '   + (Interaction.viewTransform.rotation ?? 'none'), 20, 180);
      //UI.buffer.text('fps: '        + Math.round(frameRate()) + ", " + frameCount,    20, 180);

      UI.buffer.text(openPainting.usedEditableStrokes.length, 20, 220);
      openPainting.editableStrokes.forEach((stroke, index) => {
        if (index === openPainting.editableStrokesCount) UI.buffer.fill(UI.palette.fg.toHexWithSetAlpha(0.5))
        UI.buffer.text(stroke.compositeOperation, 20, 240 + index * 20);
      });
      UI.buffer.fill(UI.palette.fg.hex)

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
        UI.buffer.push();
        UI.buffer.translate(point.x, point.y);
        UI.buffer.rotate(point.azimuth ?? 0);
        const s = 5 * (point.pressure * 50 ?? 1);
        UI.buffer.line(-s, 0, +s, 0);
        UI.buffer.rect(0, 0, 2, 2)
        UI.buffer.fill(new HSLColor(0.1, 1, 0.4).hex);
        UI.buffer.noStroke()
        UI.buffer.rect(0, 0, 2, 2);
        UI.buffer.pop();
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

    // translate to end, save difference
    UI.buffer.push();
    UI.buffer.translate(endInteraction.x, endInteraction.y);
    UI.buffer.scale(Interaction.viewTransform.scale);

    const deltaPosition = {
      x: endInteraction.x - startInteraction.x,
      y: endInteraction.y - startInteraction.y
    }

    const start = new BrushPoint(-deltaPosition.x, -deltaPosition.y, startInteraction.angle);
    const end = new BrushPoint(0, 0, endInteraction.angle);

    new Brushstroke(UI.buffer, openPainting.currentBrush.copy()).drawPart(start, end);
    UI.buffer.pop();
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
    UI.buffer.rect(UI.ELEMENT_MARGIN, UI.ELEMENT_MARGIN, UI.BUTTON_WIDE - UI.ELEMENT_MARGIN, UI.BUTTON_HEIGHT-UI.ELEMENT_MARGIN*2, UI.ELEMENT_RADIUS, UI.ELEMENT_RADIUS);
    UI.buffer.drawingContext.clip();

    // draw example
    // wip, not sure why the angle 86 even makes sense.
    const start = new BrushPoint( UI.BUTTON_WIDE*0.2, UI.BUTTON_HEIGHT * 0.2, 86, undefined);
    const end   = new BrushPoint( UI.BUTTON_WIDE*0.8, UI.BUTTON_HEIGHT * 0.8, 86, undefined);
    
    new Brushstroke(UI.buffer, settings).drawPart(start, end);

    UI.buffer.noStroke();
    UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(isSelected ? 0.8 : 0.3));
    UI.buffer.rect(UI.ELEMENT_MARGIN, UI.ELEMENT_MARGIN, UI.BUTTON_WIDE - UI.ELEMENT_MARGIN, UI.BUTTON_HEIGHT-UI.ELEMENT_MARGIN*2, UI.ELEMENT_RADIUS, UI.ELEMENT_RADIUS);
    

    UI.buffer.textAlign(CENTER);
    UI.buffer.fill(isSelected ? UI.palette.fgDisabled.hex : UI.palette.fg.hex);
    UI.buffer.text(menuName, UI.BUTTON_WIDE/2, UI.BUTTON_HEIGHT/2-2);
    UI.buffer.textFont(FONT_MEDIUM);
    
  
    UI.buffer.pop();

    UI.buffer.textAlign(LEFT);
    UI.buffer.drawingContext.restore();
  }

  static drawRightButton(text, y, type, textColor) {
    const isHover = (type === Interaction.elementTypeAtPointer);
    const bgColor = UI.palette.constrastBg;
    UI.buffer.fill(isHover ? bgColor.brighter().toHexWithSetAlpha(0.5) : bgColor.toHexWithSetAlpha(0.5));
    UI.buffer.rect(
      width - UI.BUTTON_WIDE + UI.ELEMENT_MARGIN, y+UI.ELEMENT_MARGIN, 
      UI.BUTTON_WIDE - UI.ELEMENT_MARGIN*2, UI.BUTTON_HEIGHT-UI.ELEMENT_MARGIN*2, 
      UI.ELEMENT_RADIUS
    );
    UI.buffer.fill(textColor.hex);
    UI.buffer.textAlign(CENTER);
    UI.buffer.text(text, width - UI.BUTTON_WIDE, y, UI.BUTTON_WIDE, UI.BUTTON_HEIGHT - 8);
    UI.buffer.textAlign(LEFT);
  }

  static drawButton(text, x, y, type, textColor) {
    const isHover = (type === Interaction.elementTypeAtPointer);
    const bgColor = UI.palette.constrastBg;
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
    UI.buffer.fill(openPainting.currentBrush.color.hex);
    UI.buffer.rect(topLeft.x, topLeft.y, totalWidth, tileHeight, UI.ELEMENT_RADIUS);
    UI.buffer.drawingContext.clip();

    settingsArray.forEach((setting, index) => {
      UI.buffer.fill(setting.color.hex);
      UI.buffer.rect(topLeft.x + index * tileWidth, topLeft.y, tileWidth, tileHeight);
    });

    UI.buffer.drawingContext.restore();
  }

  static drawVariedColorCircle(brush, size, x, y) {

    UI.buffer.fill(brush.color.hex);
    UI.buffer.ellipse(x, y, size);

    // TODO: still gets scaled with pressure somehow.
    const scaledBrush = brush.copy();
    scaledBrush.setExactSize(size * 0.5); // half, so that it fills the space exactly since the brushstroke is centered.
    UI.drawJitterDonut(scaledBrush, size * 0.5, x, y)
  }

  static drawJitterDonut(brush, radius, x, y) {
    UI.buffer.push();
    UI.buffer.translate(x, y);
    const intensityAngle = brush.colorVar * Math.PI * 2;
    if (intensityAngle !== undefined) UI.buffer.rotate(intensityAngle);
    const donut = new Brushstroke(UI.buffer, brush);
    const cornerCount = 12;
    for (let i = 0; i <= cornerCount; i++) {
      const angle = TWO_PI / cornerCount * i;
      const rotatedPoint = new BrushPoint(radius * Math.cos(angle) * 0.5, radius * Math.sin(angle) * 0.5);
      donut.addPoint(rotatedPoint);
    }
    donut.drawWhole();
    UI.buffer.pop();
  }

  static drawSizeKnob(x, y, pressure) {

    UI.buffer.drawingContext.save();

    UI.buffer.fill(UI.palette.onBrush.hex);
    UI.buffer.rect(x + UI.ELEMENT_MARGIN, y + UI.ELEMENT_MARGIN, UI.KNOB_SIZE - UI.ELEMENT_MARGIN*2, UI.KNOB_SIZE - UI.ELEMENT_MARGIN*2, UI.ELEMENT_RADIUS);
    
    UI.buffer.drawingContext.clip();

    // draw snapshot for easier reference of color
    // darken when changing size
    const isChangingSize = (
      [Interaction.TYPES.knob.size, Interaction.TYPES.gizmo.size].includes(Interaction.currentType)
      || (Interaction.currentType === null && Interaction.elementTypeAtPointer === Interaction.TYPES.knob.size)
    );
    if (!isChangingSize) { 
      // draw snapshot at correct scale, twice as large as knob.
      const snapshotSize = UI.KNOB_SIZE * Interaction.viewTransform.scale * 2;
      const centerOffset = (snapshotSize - UI.KNOB_SIZE) / 2;
      UI.buffer.drawingContext.save();
      UI.buffer.rect(x - centerOffset, y - centerOffset, snapshotSize, snapshotSize, UI.ELEMENT_RADIUS * (snapshotSize / UI.KNOB_SIZE));
      UI.buffer.drawingContext.clip();
      UI.buffer.image(openPainting.snapshotBuffer, x - centerOffset, y - centerOffset, snapshotSize, snapshotSize);
      UI.buffer.drawingContext.restore();
    }

    //UI.buffer.tint(255, 255);

    // draw brushstroke
    UI.drawSizeIndicator(x + UI.KNOB_SIZE / 2, y + UI.KNOB_SIZE / 2, pressure);

    UI.buffer.drawingContext.restore();

    // outline
    UI.buffer.noFill();
    UI.buffer.strokeWeight(1);
    UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
    UI.buffer.rect(x + UI.ELEMENT_MARGIN, y + UI.ELEMENT_MARGIN, UI.KNOB_SIZE - UI.ELEMENT_MARGIN*2, UI.KNOB_SIZE - UI.ELEMENT_MARGIN*2, UI.ELEMENT_RADIUS);
    UI.buffer.noStroke();

    // show average pressure with overlay
    const indicatorSize = openPainting.brushSettingsToAdjust.sizeInPixels(openPainting.averagePressure) * Interaction.viewTransform.scale;
    UI.drawSizeOverlay(x + UI.KNOB_SIZE / 2, y + UI.KNOB_SIZE / 2, indicatorSize, isChangingSize);
    
  }

  static drawSizeIndicator(x, y, pressure) {
    UI.buffer.push();
    UI.buffer.translate(x, y);
    UI.buffer.scale(Interaction.viewTransform.scale);
    UI.buffer.rotate(Math.PI * 0.25);

    // draw example
    // angle 86 is a bit arbitrary, but looked good. currently no effect.
    const start = new BrushPoint(-(UI.KNOB_SIZE*0.125)/Interaction.viewTransform.scale, 0, undefined, pressure);
    const end = new BrushPoint((UI.KNOB_SIZE*0.6)/Interaction.viewTransform.scale, 0, undefined, pressure);
    const settings = openPainting.brushSettingsToAdjust; //.copy();
    new Brushstroke(UI.buffer, settings).drawPart(start, end);
    
    UI.buffer.pop();
  }

  static drawSizeOverlay(x, y, size, editingEnabled) {
    UI.buffer.push();
    UI.buffer.translate(x, y);
    UI.buffer.rotate(Math.PI * 0.25);
    const fromCenterOffset = -UI.KNOB_SIZE * 0.125;
    UI.buffer.noFill();
    
    if (editingEnabled) {
      UI.buffer.strokeWeight(6);
      UI.buffer.stroke(new HSLColor(0,0,0,0.4).hex);
      UI.buffer.line(fromCenterOffset, -size*0.5, fromCenterOffset, size*0.5);
      UI.buffer.strokeWeight(2);
      UI.buffer.stroke(new HSLColor(0,0,1,0.4).hex);
      UI.buffer.line(fromCenterOffset, -size*0.5, fromCenterOffset, size*0.5);

      UI.buffer.stroke(new HSLColor(0,0,1,0.8).hex);
      UI.buffer.line(fromCenterOffset, -size*0.5, fromCenterOffset,-size*0.5+0.1);
      UI.buffer.line(fromCenterOffset,  size*0.5, fromCenterOffset, size*0.5-0.1);
      UI.buffer.line(fromCenterOffset, -0.1, fromCenterOffset, 0.1);
    } else {
      UI.buffer.strokeWeight(4);
      UI.buffer.stroke(new HSLColor(0,0,0,0.5).hex);
      UI.buffer.line(fromCenterOffset, -size*0.5, fromCenterOffset, size*0.5);
      UI.buffer.strokeWeight(2);
      UI.buffer.stroke(new HSLColor(0,0,1,0.5).hex);
      UI.buffer.line(fromCenterOffset, -size*0.5, fromCenterOffset,size*0.5);
    }
    UI.buffer.noStroke();
    UI.buffer.pop();
    // UI.buffer.strokeWeight(4);
    // UI.buffer.stroke(UI.palette.constrastBg.toHexWithSetAlpha(0.5));
    // UI.buffer.ellipse(x, y, size*0.2, size);
    // UI.buffer.strokeWeight(2);
    // UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.7));
    // UI.buffer.ellipse(x, y, (size*0.2)+2, size+2);
    // UI.buffer.noStroke();
  }

  static drawColorAxis(thickness, xStart, yStart, xEnd, yEnd, startColor, endColor, radius, specialType) {
    UI.buffer.strokeWeight(thickness);
    const segments = Math.floor(radius);

    const colorLerpAmt = specialType === "double" 
      ? (i) => {return map((i + 0.5)/segments, 0, 1, -1, 1, true)}
      : (i) => {return (i - 0.5) / segments};

    let doubleLerpedColor = (colorLerpAmt) => { 
      return ((colorLerpAmt * (openPainting.hueRotation === 0 ? 1 : -1)) > 0) 
      ? HSLColor.lerpColorInHSL(startColor, endColor, Math.abs(colorLerpAmt))
      : HSLColor.lerpColorInHSL(startColor.copy().setHue((startColor.hue + 0.5) % 1), endColor.copy().setHue((endColor.hue + 0.5) % 1), Math.abs(colorLerpAmt));
    }

    // round end caps first
    UI.buffer.stroke((specialType === "double") ? doubleLerpedColor(-1).hex : startColor.hex);
    UI.buffer.line(xStart, yStart, (xStart+xEnd)/2, (yStart+yEnd)/2);
    UI.buffer.stroke((specialType === "double") ? doubleLerpedColor(1).hex : endColor.hex);
    UI.buffer.line((xStart+xEnd)/2, (yStart+yEnd)/2, xEnd, yEnd);

    UI.buffer.strokeCap(SQUARE);
    let lastX = xStart;
    let lastY = yStart;
    for (let i = 1; i < segments + 1; i++) {
      let lerpedColor = (specialType === "double") ? doubleLerpedColor(colorLerpAmt(i)) : HSLColor.lerpColorInHSL(startColor, endColor, colorLerpAmt(i));
      if (specialType === "variation") lerpedColor = lerpedColor.varyComponents(i, (i - 0.5) / segments);
      
      UI.buffer.stroke(lerpedColor.hex);
      UI.buffer.line(lastX, lastY, xEnd, yEnd);
  
      lastX = lerp(xStart, xEnd, i / segments);
      lastY = lerp(yStart, yEnd, i / segments);
    }
    UI.buffer.strokeCap(ROUND);
  }

  static drawGradientSlider(x, y, width, height, startColor, endColor, sliderPercent, showVar, sliderType) {

    // TODO: sliders do not show the color variation even when the jitter knob is used (showVar) for now
    // as the effect looked odd and was not very useful. It might be nice to show it differently?

    width -= UI.ELEMENT_MARGIN * 2;
    height -= UI.ELEMENT_MARGIN * 2;
    x += UI.ELEMENT_MARGIN;
    y += UI.ELEMENT_MARGIN;
    const outside_range_of_width = (UI.SLIDER_RANGE_MARGIN - UI.ELEMENT_MARGIN) / width;

    if (sliderPercent !== 1) sliderPercent = sliderPercent % 1;

    UI.buffer.drawingContext.save();
    UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(0.5));
    UI.buffer.rect(x, y, width, height, UI.ELEMENT_RADIUS);
    UI.buffer.drawingContext.clip();
      
    const segments = width / 2;

    if (sliderType === "double") {
      for (let i = 0; i < segments; i++) {
        const colorLerpAmt = map((i + 0.5)/segments, outside_range_of_width, 1-outside_range_of_width, -1, 1, true);
        let lerpedColor = ((colorLerpAmt * (openPainting.hueRotation === 0 ? 1 : -1)) > 0) 
          ? HSLColor.lerpColorInHSL(startColor, endColor, Math.abs(colorLerpAmt))
          : HSLColor.lerpColorInHSL(startColor.copy().setHue((startColor.hue + 0.5) % 1), endColor.copy().setHue((endColor.hue + 0.5) % 1), Math.abs(colorLerpAmt));
        // if (showVar) lerpedColor = lerpedColor.varyComponents(i, openPainting.brushSettingsToAdjust.colorVar);

        UI.buffer.fill(lerpedColor.hex);
        UI.buffer.rect(x + (i/segments) * width, y, width/segments, height);
      }  
    } else {
      for (let i = 0; i < segments; i++) {
        const colorLerpAmt = map((i + 0.5)/segments, outside_range_of_width, 1-outside_range_of_width, 0, 1, sliderType !== "wrap");
        let lerpedColor = HSLColor.lerpColorInHSL(startColor, endColor, colorLerpAmt);
        // if (showVar) lerpedColor = lerpedColor.varyComponents(i, openPainting.brushSettingsToAdjust.colorVar);
    
        UI.buffer.fill(lerpedColor.hex);
        UI.buffer.rect(x + (i/segments) * width, y, width/segments, height);
      }  
    }

    // slider handle
    const handleMargin = 4 + UI.HANDLE_MARGIN;
    const handleWidth = UI.SLIDER_RANGE_MARGIN*2 - UI.ELEMENT_MARGIN*2 - handleMargin;
    const handleHeight = height - handleMargin;
    const handleX = x - handleWidth/2 + width * map(sliderPercent, 0, 1, outside_range_of_width, 1-outside_range_of_width);
    const handleY = y - handleHeight/2 + height / 2;
    const handleRoundness = UI.ELEMENT_RADIUS - handleMargin/2;

    UI.buffer.noFill();
    UI.buffer.strokeWeight(4);
    UI.buffer.stroke(new HSLColor(0,0,0,0.8).hex);
    UI.buffer.rect(handleX, handleY, handleWidth, handleHeight, handleRoundness);
    UI.buffer.strokeWeight(2);
    UI.buffer.stroke(new HSLColor(0,0,1,0.8).hex);
    UI.buffer.rect(handleX+1, handleY+1, handleWidth-2, handleHeight-2, handleRoundness-1);

    if (sliderType === "wrap") {
      const wrapPos = handleX + (sliderPercent < 0.5 ? 1 : -1) * width * (1-outside_range_of_width*2);
      UI.buffer.strokeWeight(4);
      UI.buffer.stroke(new HSLColor(0,0,0,0.8).hex);
      UI.buffer.rect(wrapPos, handleY, handleWidth, handleHeight, handleRoundness);
      UI.buffer.strokeWeight(2);
      UI.buffer.stroke(new HSLColor(0,0,1,0.8).hex);
      UI.buffer.rect(wrapPos+1, handleY+1, handleWidth-2, handleHeight-2, handleRoundness-1);
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
      y: y + 8
    }
    let bbox = FONT_MEDIUM.textBounds(text, textPos.x, textPos.y);
    UI.buffer.fill(UI.palette.constrastBg.toHexWithSetAlpha(0.5));
    UI.buffer.rect(bbox.x - bbox.w/2 - 13, bbox.y + bbox.h/2 - 4, bbox.w+26, bbox.h+12, UI.ELEMENT_RADIUS);
    UI.buffer.fill(UI.palette.fg.hex);
    UI.buffer.text(text, textPos.x, textPos.y);
  }

  static drawStateBubbles(labelsArray) {
    UI.buffer.textAlign(CENTER);
    labelsArray.forEach((labelObj, index) => {
      let bbox = FONT_MEDIUM.textBounds(labelObj.text, width/2, height-(1+index) * 40);
      bbox.w = bbox.w*1.4 + 20;
      bbox.h += 20;
      UI.buffer.fill(labelObj.color.hex);
      UI.buffer.rect(bbox.x - bbox.w/2 -4, bbox.y - bbox.h/2 + 8, bbox.w+8, bbox.h+8, UI.ELEMENT_RADIUS);
      UI.buffer.fill(UI.palette.constrastBg.hex);
      UI.buffer.text(labelObj.text, width/2, height-(1+index) * 40);
    });
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
      
      UI.drawCrosshair(position.x, position.y, size * 0.5);

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

      UI.buffer.drawingContext.save();
      UI.buffer.fill(UI.palette.constrastBg.hex);
      UI.buffer.ellipse(basePosition.x, basePosition.y, outerSize, outerSize);
      UI.buffer.drawingContext.clip();
      UI.buffer.strokeWeight(1);
      UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
      UI.buffer.line(basePosition.x - outerSize/2, basePosition.y - outerSize/2, basePosition.x + outerSize/2, basePosition.y + outerSize/2);
      UI.buffer.line(basePosition.x - outerSize/2, basePosition.y + outerSize/2, basePosition.x + outerSize/2, basePosition.y - outerSize/2);
      UI.buffer.noStroke();
      UI.buffer.drawingContext.restore();

      drawGadgetDirection(basePosition.x, basePosition.y, -1,  0, Interaction.TYPES.cloverButton.size);
      drawGadgetDirection(basePosition.x, basePosition.y,  1,  0, Interaction.TYPES.cloverButton.hueAndVar);
      drawGadgetDirection(basePosition.x, basePosition.y,  0, -1, Interaction.TYPES.cloverButton.eyedropper);
      drawGadgetDirection(basePosition.x, basePosition.y,  0,  1, Interaction.TYPES.cloverButton.satAndLum);

      UI.buffer.drawingContext.save();
      UI.buffer.drawingContext.beginPath();
      UI.buffer.drawingContext.arc(basePosition.x, basePosition.y, 10, 0, 2 * Math.PI);
      UI.buffer.drawingContext.clip();
      UI.buffer.drawingContext.clearRect(0, 0, width, height);
      UI.buffer.drawingContext.restore();

      function drawGadgetDirection(x, y, xDir, yDir, type) {

        const size = 54;
        const centerOffset = 40;
        const posX = x+centerOffset*xDir;
        const posY = y+centerOffset*yDir;

        // hover/ active
        if (type === Interaction.elementTypeAtPointer) {
          UI.buffer.fill(UI.palette.constrastBg.brighter().hex);
          const startAngle = 0.25 * Math.PI - (xDir * 0.5 * Math.PI) + (Math.min(0, yDir) * Math.PI);
          UI.buffer.arc(basePosition.x, basePosition.y, outerSize, outerSize, startAngle, startAngle + 0.5 * Math.PI);
        }

        if (type === Interaction.TYPES.cloverButton.hueAndVar) {
          UI.buffer.stroke('pink'); // WTFFF why is this needed?
          UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
          UI.buffer.strokeWeight(8);
          UI.buffer.line(posX, posY - size/3, posX, posY + size/3);
          UI.drawColorAxis(6, posX, posY + size/3, posX, posY - size/3, brushToVisualize.color, brushToVisualize.color, size, "variation");

          UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
          UI.buffer.strokeWeight(8);
          UI.buffer.line(posX - size/3, posY, posX + size/3, posY);
          const startColorHue = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue - 0.5); 
          const endColorHue   = brushToVisualize.color.copy().setHue(brushToVisualize.color.hue + 0.5);
          UI.drawColorAxis(6, posX - size/3, posY, posX + size/3, posY, startColorHue, endColorHue, size);

        } else if (type === Interaction.TYPES.cloverButton.satAndLum) {

          UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
          UI.buffer.strokeWeight(8);
          UI.buffer.line(posX, posY - size/3, posX, posY + size/3);
          const startColorSat = brushToVisualize.color.copy().setSaturation(0);
          const endColorSat   = brushToVisualize.color.copy().setSaturation(1);
          UI.drawColorAxis(6, posX - size/3, posY, posX + size/3, posY, startColorSat, endColorSat, size, "double");
          
          UI.buffer.stroke(UI.palette.fg.toHexWithSetAlpha(0.2));
          UI.buffer.strokeWeight(8);
          UI.buffer.line(posX - size/3, posY, posX + size/3, posY);
          const startColorLum = brushToVisualize.color.copy().setLightness(1);
          const endColorLum   = brushToVisualize.color.copy().setLightness(0);
          UI.drawColorAxis(6, posX, posY - size/3, posX, posY + size/3, startColorLum, endColorLum, size);

        } else if (type === Interaction.TYPES.cloverButton.size) {

          UI.buffer.noStroke();
          UI.buffer.fill(UI.palette.fg.toHexWithSetAlpha(0.7));
          UI.buffer.ellipse(posX, posY - (size/3) * 0.8, size/6, size/6);
          UI.buffer.ellipse(posX, posY + (size/3) * 0.8, size/9, size/9);

        } else if (type === Interaction.TYPES.cloverButton.eyedropper) {
          
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
    
    } else if (Interaction.currentUI === Interaction.UI_STATES.hueAndVar_open) {

      const radius = UI.GIZMO_SIZE;
      UI.buffer.push();
      UI.buffer.translate(ankerX, ankerY);

      UI.buffer.fill("black")
      UI.buffer.ellipse(0, 0, constrain(brushToVisualize.sizeInPixels(), 8, UI.GIZMO_SIZE/3)+2)

      // var
      UI.buffer.stroke("black");
      UI.buffer.strokeWeight(16);
      UI.buffer.line(0, radius*2 * (brushToVisualize.colorVar - 1), 0, radius*2 * brushToVisualize.colorVar);
      UI.drawColorAxis(14, 0, radius*2 * (brushToVisualize.colorVar), 0, radius*2 * (brushToVisualize.colorVar - 1), brushToVisualize.color, brushToVisualize.color, UI.GIZMO_SIZE, "variation");

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
      UI.drawVariedColorCircle(brushToVisualize, 40, ankerX, ankerY);

    } else if (Interaction.currentUI === Interaction.UI_STATES.satAndLum_open) {

      const radius = UI.GIZMO_SIZE;
      UI.buffer.push();
      UI.buffer.translate(ankerX, ankerY);

      UI.buffer.fill("black")
      UI.buffer.ellipse(0, 0, constrain(brushToVisualize.sizeInPixels(), 8, UI.GIZMO_SIZE/3)+2)

      const startColorLum = brushToVisualize.color.copy().setLightness(1);
      const endColorLum   = brushToVisualize.color.copy().setLightness(0);
      UI.buffer.stroke("black");
      UI.buffer.strokeWeight(16);
      UI.buffer.line(0, radius*2 * (-1 + brushToVisualize.color.lightness), 0, radius*2 * brushToVisualize.color.lightness);
      UI.drawColorAxis(14, 0, radius*2 * (-1 + brushToVisualize.color.lightness), 0, radius*2 * brushToVisualize.color.lightness, startColorLum, endColorLum, UI.GIZMO_SIZE);

      const startColorSat = brushToVisualize.color.copy().setSaturation(0);
      const endColorSat   = brushToVisualize.color.copy().setSaturation(1);
      const currentSat = 0.5 + (brushToVisualize.color.saturation * (openPainting.hueRotation === 0 ? 0.5 : -0.5));
      UI.buffer.stroke("black");
      UI.buffer.strokeWeight(16);
      UI.buffer.line(radius*2 * -currentSat, 0, radius*2 * (1-currentSat), 0);
      UI.drawColorAxis(14, radius*2 * -currentSat, 0, radius*2 * (1-currentSat), 0, startColorSat, endColorSat, UI.GIZMO_SIZE, "double");
      
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

      const visualSize = brushToVisualize.sizeInPixels(openPainting.averagePressure) * Interaction.viewTransform.scale;

      // UI.drawSizeOverlay(posX, ankerY, visualSize);
      UI.drawCrosshair(posX, ankerY, visualSize);
    }
  }

  static drawCrosshair(x, y, size) {
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

  static screenToViewTransform(x, y) {
    x -= openPainting.width / 2;
    y -= openPainting.height / 2;

    ({x, y} = rotatePoint(x, y, Interaction.viewTransform.rotation));

    x *= Interaction.viewTransform.scale;
    y *= Interaction.viewTransform.scale;

    x += Interaction.viewTransform.centerPos().x;
    y += Interaction.viewTransform.centerPos().y;

    return {x, y};
  }

  static drawBounds(bounds) {
    if (bounds.width === 0 || bounds.height === 0) return;

    const topLeft  = UI.screenToViewTransform(bounds.x               , bounds.y);
    const topRight = UI.screenToViewTransform(bounds.x + bounds.width, bounds.y);
    const botRight = UI.screenToViewTransform(bounds.x + bounds.width, bounds.y + bounds.height);
    const botLeft  = UI.screenToViewTransform(bounds.x               , bounds.y + bounds.height);
    
    UI.buffer.stroke(UI.palette.constrastBg.hex);
    UI.buffer.strokeWeight(5);
    UI.buffer.line(topLeft.x, topLeft.y, topRight.x, topRight.y);
    UI.buffer.line(topLeft.x, topLeft.y, botLeft.x, botLeft.y);
    UI.buffer.line(botRight.x, botRight.y, topRight.x, topRight.y);
    UI.buffer.line(botRight.x, botRight.y, botLeft.x, botLeft.y);

    UI.buffer.stroke(UI.palette.fg.hex);
    UI.buffer.strokeWeight(2);
    UI.buffer.line(topLeft.x, topLeft.y, topRight.x, topRight.y);
    UI.buffer.line(topLeft.x, topLeft.y, botLeft.x, botLeft.y);
    UI.buffer.line(botRight.x, botRight.y, topRight.x, topRight.y);
    UI.buffer.line(botRight.x, botRight.y, botLeft.x, botLeft.y);

    UI.buffer.strokeWeight(6);
    UI.buffer.noStroke();

    UI.drawTooltipBelow((botLeft.x+botRight.x)/2, (botLeft.y+botRight.y)/2 + 6, Math.round(bounds.width) + " x " + Math.round(bounds.height));
  }
}


// math utils
const pointsToAngle = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
const getAverageAngle = (first, second) => Math.abs(first - second) < Math.PI ? (first + second) / 2 : (first + second + Math.PI * 2) / 2;
//const getAverageAngle = (first, second) => Math.atan2(Math.sin(first)+Math.sin(second), Math.cos(first)+Math.cos(second));
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
Number.prototype.mod = function(n) {
  return ((this%n)+n)%n;
}