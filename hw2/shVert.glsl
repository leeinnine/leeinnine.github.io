#version 300 es

layout(location = 0) in vec3 aPos;

uniform vec2 uSquarePos;

void main() {
    gl_Position = vec4(aPos.xy + uSquarePos.xy, aPos.z, 1.0);
}
