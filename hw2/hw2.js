import { resizeAspectRatio, setupText } from './util.js';
import { Shader, readShaderFile } from './shader.js';

const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2');
let shader;
let vao;
let squarePosition = [0.0, 0.0];
const squareSize = 0.2;
const halfSize = squareSize/2;

function initWebGL() {
    if (!gl) {
        console.error('WebGL 2 is not supported by your browser.');
        return false;
    }

    canvas.width = 600;
    canvas.height = 600;

    resizeAspectRatio(gl, canvas);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    return true;
}

async function initShader() {
    const vertexShaderSource = await readShaderFile('shVert.glsl');
    const fragmentShaderSource = await readShaderFile('shFrag.glsl');
    return new Shader(gl, vertexShaderSource, fragmentShaderSource);
}

function setupKeyboardEvents() {
    document.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowUp') {
            squarePosition[1] += 0.01;
        } else if (event.key === 'ArrowDown') {
            squarePosition[1] -= 0.01;
        } else if (event.key === 'ArrowLeft') {
            squarePosition[0] -= 0.01;
        } else if (event.key === 'ArrowRight') {
            squarePosition[0] += 0.01;
        }
        
        // clamp the position
        if (squarePosition[1] > 1-halfSize){
            squarePosition[1] = 1-halfSize
        } else if (squarePosition[1] < -1+halfSize){
            squarePosition[1] = -1+halfSize
        } else if (squarePosition[0] > 1-halfSize){
            squarePosition[0] = 1-halfSize
        } else if (squarePosition[0] < -1+halfSize){
            squarePosition[0] = -1+halfSize;
        }
    });
}

function setupBuffers(shader) {
    const vertices = new Float32Array([
        -squareSize / 2, -squareSize / 2, 0.0,
         squareSize / 2, -squareSize / 2, 0.0,
         squareSize / 2,  squareSize / 2, 0.0,
        -squareSize / 2,  squareSize / 2, 0.0
    ]);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    shader.setAttribPointer('aPos', 3, gl.FLOAT, false, 0, 0);

    return vao;
}

function render(vao, shader) {
    gl.clear(gl.COLOR_BUFFER_BIT);

    // let vertex shader know that uSquarePos <- squarePosition
    shader.setVec2("uSquarePos", squarePosition); 

    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);   // changed to draw along four coordinates

    requestAnimationFrame(() => render(vao, shader));
}

async function main() {
    try {

        // WebGL 초기화
        if (!initWebGL()) {
            throw new Error('WebGL 초기화 실패');
        }

        // 셰이더 초기화
        shader = await initShader();

        setupText(canvas, "Use arrow keys to move the rectangle", 1);

        // 키보드 이벤트 설정
        setupKeyboardEvents();
        
        // 나머지 초기화
        vao = setupBuffers(shader);
        shader.use();
        
        // 렌더링 시작
        render(vao, shader);

        return true;

    } catch (error) {
        console.error('Failed to initialize program:', error);
        alert('프로그램 초기화에 실패했습니다.');
        return false;
    }
}

// call main function
main().then(success => {
    if (!success) {
        console.log('프로그램을 종료합니다.');
        return;
    }
}).catch(error => {
    console.error('프로그램 실행 중 오류 발생:', error);
});
