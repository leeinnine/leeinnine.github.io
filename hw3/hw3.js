/*-------------------------------------------------------------------------
07_LineSegments.js

left mouse button을 click하면 선분을 그리기 시작하고, 
button up을 하지 않은 상태로 마우스를 움직이면 임시 선분을 그리고, 
button up을 하면 최종 선분을 저장하고 임시 선분을 삭제함.

임시 선분의 color는 회색이고, 최종 선분의 color는 빨간색임.

이 과정을 반복하여 여러 개의 선분 (line segment)을 그릴 수 있음. 
---------------------------------------------------------------------------*/
import { resizeAspectRatio, setupText, updateText, Axes } from './util.js';
import { Shader, readShaderFile } from './shader.js';

// Global variables
let isInitialized = false; // global variable로 event listener가 등록되었는지 확인
const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');
let shader;
let vao;
let positionBuffer;
let isDrawing = false;
let startPoint = null;
let tempEndPoint = null;
let lines = [];
let textOverlay;
let textOverlay2;
let textOverlay3;
let axes = new Axes(gl, 0.85);
let mode = 'circle'; 
let circle = null;   

// DOMContentLoaded event
// 1) 모든 HTML 문서가 완전히 load되고 parsing된 후 발생
// 2) 모든 resource (images, css, js 등) 가 완전히 load된 후 발생
// 3) 모든 DOM 요소가 생성된 후 발생
// DOM: Document Object Model로 HTML의 tree 구조로 표현되는 object model 
// 모든 code를 이 listener 안에 넣는 것은 mouse click event를 원활하게 처리하기 위해서임

// mouse 쓸 때 main call 방법
document.addEventListener('DOMContentLoaded', () => {
    if (isInitialized) {
        console.log("Already initialized");
        return;
    }

    main().then(success => { // call main function
        if (!success) {
            console.log('프로그램을 종료합니다.');
            return;
        }
        isInitialized = true;
    }).catch(error => {
        console.error('프로그램 실행 중 오류 발생:', error);
    });
});

function initWebGL() {
    if (!gl) {
        console.error('WebGL 2 is not supported by your browser.');
        return false;
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.7, 0.8, 0.9, 1.0);
    
    return true;
}

function setupCanvas() {
    canvas.width = 700;
    canvas.height = 700;
    resizeAspectRatio(gl, canvas);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.1, 0.2, 0.3, 1.0);
}

function setupBuffers(shader) {
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    shader.setAttribPointer('a_position', 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
}

// 좌표 변환 함수: 캔버스 좌표를 WebGL 좌표로 변환
// 캔버스 좌표: 캔버스 좌측 상단이 (0, 0), 우측 하단이 (canvas.width, canvas.height)
// WebGL 좌표 (NDC): 캔버스 좌측 상단이 (-1, 1), 우측 하단이 (1, -1)
function convertToWebGLCoordinates(x, y) {
    return [
        (x / canvas.width) * 2 - 1,
        -((y / canvas.height) * 2 - 1)
    ];
}

function findCircleLineIntersections(circleCenter, circleRadius, line) {
    let [cx, cy] = circleCenter;
    let [x1, y1, x2, y2] = line;

    let dx = x2 - x1;
    let dy = y2 - y1;

    let A = dx * dx + dy * dy;
    let B = 2 * (dx * (x1 - cx) + dy * (y1 - cy));
    let C = (x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy) - circleRadius * circleRadius;

    let discriminant = B * B - 4 * A * C;

    let intersections = [];
    if (discriminant >= 0) {
        let sqrtD = Math.sqrt(discriminant);
        let t1 = (-B + sqrtD) / (2 * A);
        let t2 = (-B - sqrtD) / (2 * A);

        if (t1 >= 0 && t1 <= 1) {
            intersections.push([x1 + t1 * dx, y1 + t1 * dy]);
        }
        if (t2 >= 0 && t2 <= 1) {
            intersections.push([x1 + t2 * dx, y1 + t2 * dy]);
        }
    }
    return intersections;
}

/* 
    browser window
    +----------------------------------------+
    | toolbar, address bar, etc.             |
    +----------------------------------------+
    | browser viewport (컨텐츠 표시 영역)       | 
    | +------------------------------------+ |
    | |                                    | |
    | |    canvas                          | |
    | |    +----------------+              | |
    | |    |                |              | |
    | |    |      *         |              | |
    | |    |                |              | |
    | |    +----------------+              | |
    | |                                    | |
    | +------------------------------------+ |
    +----------------------------------------+

    *: mouse click position

    event.clientX = browser viewport 왼쪽 경계에서 마우스 클릭 위치까지의 거리
    event.clientY = browser viewport 상단 경계에서 마우스 클릭 위치까지의 거리
    rect.left = browser viewport 왼쪽 경계에서 canvas 왼쪽 경계까지의 거리
    rect.top = browser viewport 상단 경계에서 canvas 상단 경계까지의 거리

    x = event.clientX - rect.left  // canvas 내에서의 클릭 x 좌표
    y = event.clientY - rect.top   // canvas 내에서의 클릭 y 좌표
*/

function setupMouseEvents() {
    function handleMouseDown(event) {
        event.preventDefault(); // 존재할 수 있는 기본 동작을 방지
        event.stopPropagation(); // event가 상위 요소로 전파되지 않도록 방지

        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        if (!isDrawing) { // 1번 또는 2번 선분을 그리고 있는 도중이 아닌 경우
            // 캔버스 좌표를 WebGL 좌표로 변환하여 선분의 시작점을 설정
            let [glX, glY] = convertToWebGLCoordinates(x, y);
            startPoint = [glX, glY];
            isDrawing = true; // 이제 mouse button을 놓을 때까지 계속 true로 둠. 
        }
    }

    function handleMouseMove(event) {
        if (isDrawing) { // 1번 또는 2번 선분을 그리고 있는 도중인 경우
            const rect = canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            let [glX, glY] = convertToWebGLCoordinates(x, y);
            tempEndPoint = [glX, glY];
            render();
        }
    }

    function handleMouseUp() {
        if (isDrawing && tempEndPoint) {

            if (mode == 'circle'){
                const dx = tempEndPoint[0] - startPoint[0];
                const dy = tempEndPoint[1] - startPoint[1];
                const radius = Math.sqrt(dx * dx + dy * dy);
                circle = {
                    center: startPoint,
                    radius: radius
                };

                updateText(textOverlay, `Circle: Center (${startPoint[0].toFixed(2)}, ${startPoint[1].toFixed(2)}), Radius ${radius.toFixed(2)}`);

                mode = 'line';

            }else if (mode == 'line'){
                lines.push([...startPoint, ...tempEndPoint]);

                updateText(textOverlay2, `Line: (${startPoint[0].toFixed(2)}, ${startPoint[1].toFixed(2)}) ~ (${tempEndPoint[0].toFixed(2)}, ${tempEndPoint[1].toFixed(2)})`);
                mode = 'done';

            }

            isDrawing = false;
            startPoint = null;
            tempEndPoint = null;
            render();

        }
    }

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
}

function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    shader.use();
    
    // 저장된 선들 그리기
    let num = 0;
    for (let line of lines) {
        if (num == 0) { // 첫 번째 선분인 경우, yellow
            shader.setVec4("u_color", [1.0, 1.0, 0.0, 1.0]);
        }
        else { // num == 1 또는 2번째 선분인 경우, red
            shader.setVec4("u_color", [1.0, 0.0, 1.0, 1.0]);
        }
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(line), gl.STATIC_DRAW);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.LINES, 0, 2);
        num++;

        // Compute and draw intersection points
        let intersections = findCircleLineIntersections(circle.center, circle.radius, line);
        if (intersections.length == 0) {
            updateText(textOverlay3, "No intersection");
        } else if (intersections.length == 1) {
            updateText(textOverlay3, `Intersection Points: 1 Point 1: (${intersections[0][0].toFixed(2)}, ${intersections[0][1].toFixed(2)})`);
        } else if (intersections.length == 2) {
            updateText(textOverlay3, `Intersection Points: 2 Point 1: (${intersections[0][0].toFixed(2)}, ${intersections[0][1].toFixed(2)}) Point 2: (${intersections[1][0].toFixed(2)}, ${intersections[1][1].toFixed(2)})`);
        }
        shader.setVec4("u_color", [1, 1, 0, 1]); // yellow intersection points
        intersections.forEach(point => {
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(point), gl.STATIC_DRAW);
            gl.drawArrays(gl.POINTS, 0, 1);
        });
    }

    // 임시 선 그리기
    if (isDrawing && startPoint && tempEndPoint) {
        if (mode === 'circle') {
            // Draw preview circle
            const dx = tempEndPoint[0] - startPoint[0];
            const dy = tempEndPoint[1] - startPoint[1];
            const radius = Math.sqrt(dx * dx + dy * dy);
    
            const segments = 100;
            const circlePoints = [];
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const x = startPoint[0] + Math.cos(angle) * radius;
                const y = startPoint[1] + Math.sin(angle) * radius;
                circlePoints.push(x, y);
            }
    
            shader.setVec4("u_color", [1.0, 1.0, 1.0, 1.0]); // preview circle
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(circlePoints), gl.STATIC_DRAW);
            gl.bindVertexArray(vao);
            gl.drawArrays(gl.LINE_STRIP, 0, segments + 1);
        } else if (mode === 'line') {
            // Draw preview line
            shader.setVec4("u_color", [1.0, 1.0, 1.0, 1.0]);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([...startPoint, ...tempEndPoint]), gl.STATIC_DRAW);
            gl.bindVertexArray(vao);
            gl.drawArrays(gl.LINES, 0, 2);
        } else if (mode === 'done') {
            // Ban drawing
            alert("Refresh the page to make new segments.");
            isDrawing = false;
            startPoint = null;
            tempEndPoint = null;
        }
    }


    // Draw circle
    if (circle) {
        const segments = 100;
        const circlePoints = [];
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            const x = circle.center[0] + Math.cos(angle) * circle.radius;
            const y = circle.center[1] + Math.sin(angle) * circle.radius;
            circlePoints.push(x, y);
        }

        shader.setVec4("u_color", [1.0, 0.0, 1.0, 1.0]); // color for circle
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(circlePoints), gl.STATIC_DRAW);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.LINE_STRIP, 0, segments + 1);
    }

    // axes 그리기
    axes.draw(mat4.create(), mat4.create());
}

async function initShader() {
    const vertexShaderSource = await readShaderFile('shVert.glsl');
    const fragmentShaderSource = await readShaderFile('shFrag.glsl');
    return new Shader(gl, vertexShaderSource, fragmentShaderSource);
}

async function main() {
    try {
        if (!initWebGL()) {
            throw new Error('WebGL 초기화 실패');
        }

        // 셰이더 초기화
        shader = await initShader();
        
        // 나머지 초기화
        setupCanvas();
        setupBuffers(shader);
        shader.use();

        // 텍스트 초기화
        textOverlay = setupText(canvas, "No line segment", 1);
        textOverlay2 = setupText(canvas, "Click mouse button and drag to draw line segments", 2);
        textOverlay3 = setupText(canvas, "", 3);

        
        // 마우스 이벤트 설정
        setupMouseEvents();
        
        // 초기 렌더링
        render();

        return true;
    } catch (error) {
        console.error('Failed to initialize program:', error);
        alert('프로그램 초기화에 실패했습니다.');
        return false;
    }
}
