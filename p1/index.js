//////////////////////
// APPLICATION START
//////////////////////

console.clear();
window.onload = init;

function init() {
  // Grab the canvas from the dom.
  var el = document.querySelector("canvas");

  // Define the scene as simply an object with an array of children. 
  var scene = {
    children: []
  };

  // Setup the camera. We can just use THREE.PerspectiveCamera, 
  // and let it convert the values into the correct matrices. 
  var fieldOfView = 80;
  var aspectRatio = el.clientWidth / el.clientHeight;
  var camera = new THREE.PerspectiveCamera(fieldOfView, aspectRatio);
  // Move the camera back so we can see the whole mesh.
  camera.position.set(0, 0, 400);

  // Create the renderer.
  var renderer = new Renderer(el);

  // Define the mesh.
  var mesh = {
    // Define the geometry: a rectangle (plane) 200 by 100 units.
    geometry: {
      // Array containing the vertices of the geometry: 4 vertices centered around {x: 0, y: 0, z: 0}.
      // We use THREE.Vector3 for compatibility with the math API.
      vertices: [
        // top left
        { position: new THREE.Vector3(-100, 50, 0) },
        // top right
        { position: new THREE.Vector3(100, 50, 0) },
        // bottom right
        { position: new THREE.Vector3(100, -50, 0) },
        // bottom left
        { position: new THREE.Vector3(-100, -50, 0) }
      ],
      // Array descriping how to create faces for the vertices.
      // Each face is described by three consecutive numbers (indices), referencing the vertex index in the vertex array.
      indices: [
        // first face
        0, 1, 3,
        // second face
        1, 2, 3
      ]
    },
    // Define the material.
    material: {
      // The color that will be applied to the geometry. Any canvas2D friendly format.
      color: '#ff0000',
      // Set to true to show the faces.
      wireframe: false,
      // Reference to the emulated shaders defined below the Renderer.
      vertexShader: basicVertexShader,
      fragmentShader: basicFragmentShader
    },
    // These properties define transformation (which will be used to update the world matrix for this mesh).
    position: new THREE.Vector3(0.0, 0.0, 0.0),
    rotation: new THREE.Euler(0.0, 0.0, 0.0), // An Euler describes rotation around each axis in radians.
    scale: new THREE.Vector3(1.0, 1.0, 1.0),
  };

  // Add the mesh to the scene.
  scene.children.push(mesh);

  // Render loop.
  function tick() {
    // Proof that it's actually 3D!
    mesh.rotation.y += 0.01;

    // Render the scene as seen through the camera.
    renderer.render(scene, camera);

    // Next frame.
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Resize handling.
  function resize() {
    camera.aspect = el.clientWidth / el.clientHeight;
    renderer.resize();
  }

  window.addEventListener('resize', resize); 
  resize();
}

//////////////////////
// RENDERER CLASS
//////////////////////

// The renderer encapsulates our render logic emulating the 3D graphics pipeline.
function Renderer(el) {
  // The canvas element.
  this.el = el;
  // Clear / background color.
  this.clearColor = "#ffffff";
  // The 2D rendering context we will use to draw.
  this.ctx = el.getContext("2d");
}
Renderer.prototype = {
  // renders a scene viewed through a given camera
  render: function(scene, camera) {
    
    // STEP 1: Clear previous frame by filling with the clear color.
    
    this.ctx.fillStyle = this.clearColor;
    // fillRect in Normalized Device Coordinates!
    this.ctx.fillRect(-1, -1, 2, 2);
    
    // STEP 2: Update camera matrices.
    
    // Make sure the camera projection matrix is up to date.
    // The projection matrix describes the transformation from 3D world coordinates
    // to 2D Normalized Device Coordinates (projected on the screen).
    // The projected matrix neeeds to be updated at the start
    // and whenever the field of view or aspect ratio change
    camera.updateProjectionMatrix();
    // The world matrix describes the transformation (position and rotation) of the camera relative to the scene.
    // While techinally a camera can have scale (because it extends Object3D),
    // scaling the camera doesn't really make sense because it has no volume.
    // To zoom in, you can use the 'zoom' property of the camera, which augments the projection matrix calculation.
    camera.updateMatrixWorld();
    // We need the transformation of the camera in the world for the projection calculation.
    // But because we are looking *through* the camera, this transformation needs to be inversed.
    camera.matrixWorldInverse.getInverse(camera.matrixWorld);
    
    // STEP 3: Render each child.
    
    // Traverse the 'scene graph', and render each child using the given camera.
    scene.children.forEach(function(child) {
      this.renderChild(child, camera);
    }.bind(this));
  },
  
  // renders a child of the scene through a given camera
  renderChild: function(child, camera) {
    
    // STEP 3.1: Create child world matrix.
    
    // The world matrix describes the transformation (position, rotation, and scale) of the child relative to the scene.
    var matrixWorld = new THREE.Matrix4();
    // A quaternion is an alternative way of describing rotation. We use it here to conform to the api for THREE.Matrix4.compose.
    var quaternion = new THREE.Quaternion().setFromEuler(child.rotation);
    // Store the child transformation in the matrix.
    matrixWorld.compose(child.position, quaternion, child.scale);
    
    // STEP 3.2: Create model view matrix.
    
    // The model view matrix describes the transformation of the child relative (as viewed through) the camera.
    // We get this by multiplying the inverse of the camera world matrix by the world matrix of the child.
    var modelViewMatrix = new THREE.Matrix4().multiplyMatrices(
      camera.matrixWorldInverse,
      matrixWorld
    );
    
    // We will be using modelViewMatrix, projectionMatrix, and material.color in our shader as uniforms.
    var uniforms = {
      modelViewMatrix: modelViewMatrix,
      projectionMatrix: camera.projectionMatrix,
      color: child.material.color
    };
    
    // STEP 3.3: Render the mesh.
    
    var vertices = child.geometry.vertices;
    var indices = child.geometry.indices;
    var indexCount = indices.length;
    var faceCount = indexCount / 3;
    
    // We will render the mesh face by face, using the vertices and indices of the geometry.
    for (var i = 0; i < faceCount; i++) {
      // Get the index of the first vertex for this face from the indices array.
      var vertex0Index = indices[i * 3 + 0];
      // Use this index to retrieve the corresponding vertex from the vertices array.
      var vertex0 = vertices[vertex0Index];
      
      // Repeat for the second vertex.
      var vertex1Index = indices[i * 3 + 1];
      var vertex1 = vertices[vertex1Index];
      
      // Repeat for the third vertex.
      var vertex2Index = indices[i * 3 + 2];
      var vertex2 = vertices[vertex2Index];
        
      // Once we know which vertices to draw, we can start applying the shaders.
      // The vertex shader will run once for each vertex in this face.
      // In addition, we will supply the vertex shader with the uniforms defined earlier.
      // As you can see, these uniforms will be the same for each vertex, hence the name.
      var p0 = this.applyVertexShader(child.material.vertexShader, uniforms, vertex0);
      var p1 = this.applyVertexShader(child.material.vertexShader, uniforms, vertex1);
      var p2 = this.applyVertexShader(child.material.vertexShader, uniforms, vertex2);

      // At this point the vertices have been transformed from 3D coordinates to 2D Normalized Device Coordinates.
      // Now we can draw the shape using the 2D canvas API.
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.lineTo(p0.x, p0.y);
      this.ctx.lineTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.closePath();
      
      // After the face is positioned on the screen, the 3D graphics pipeline will determine the color of each pixel (fragment)
      // covered by that face. This is where the fragment shader comes in: it will run once for each pixel covered by the face.
      // Emulating this process goes beyond the scope of this exercise (and frankly, I'm not even sure how to do it),
      // so we will just use the 2D canvas API to draw our shape.
      
      // Stroke the shape if we want to render a wireframe, fill the shape if not.
      if (child.material.wireframe) {
        this.ctx.strokeStyle = this.applyFragmentShader(child.material.fragmentShader, uniforms);
        this.ctx.stroke();
      }
      else {
        this.ctx.fillStyle = this.applyFragmentShader(child.material.fragmentShader, uniforms);
        this.ctx.fill();  
      }
      
      // Part of the 2D canvas API, ignore.
      this.ctx.restore();
    }
  },
  
  // Utility method for applying a vertex shader.
  applyVertexShader: function(shader, uniforms, vertex) {
    // create a context object the shader will be applied to (see the shaders below).
    var context = {
      attributes: {
        // clone the position because attributes are immutable in shaders.
        position: vertex.position.clone()
      },
      uniforms: uniforms
    }
    // Apply the shader to the context, and return the value (gl_Position);
    return shader.apply(context);
  },
  
  // Utility method for applying a fragment shader.
  applyFragmentShader: function(shader, uniforms) {
    // create a context object the shader will be applied to (see the shaders below).
    var context = {
      uniforms: uniforms
    }
    // Apply the shader to the context, and return the value (gl_FragColor);
    return shader.apply(context);
  },
  
  // Resize the 2D canvas context based on the size of the element in the dom.
  resize: function() {
    // Apply width and height.
    this.width = this.el.width = this.el.clientWidth;
    this.height = this.el.height = this.el.clientHeight;
    
    // Since the fragment shader outputs its values in Normalized Device Coordinates (ranging from -1 to 1 on both axes),
    // we will transform the canvas context to match this coordinate system.
    this.ctx.save();
    // center
    this.ctx.translate(this.width * 0.5, this.height * 0.5);
    // scale (and invert y to match NDC)
    this.ctx.scale(this.width, -this.height);
    // descrease the line width to match the new dimensions.
    this.ctx.lineWidth = 1 / (Math.max(this.width, this.height));
  }
};

//////////////////////
// SHADER DEFINITIONS
//////////////////////

// The vertex shader runs once for each vertex in a face of a geometry.
// It is essentially a function that can be injected into the 3D graphics pipeline.
// The vertex shader can have a great number of inputs (attributes and uniforms).
// The vertex shader has one main output: gl_Position. This is the position of the vertex in Normalized Device Coordinates.
// It can also transfer values to the fragment shader using 'varying' properties, but this is not part of our emulation.

// Shaders in WebGL are written in a special languange called GLSL. 
// This language is very limited in scope, and is not hard to learn.
// It has very strict syntax rules (never forget a semicolon!), and many conveniences for math.
// For instance, you can simply use operators (+, -, *, /) on things like matrices and vectors in stead of relying on objects and functions. Neat!

// The vertexShader function below is the JavaScript equivalent of the most basic GLSL vertex shader:
/**
  attribute vec3 position;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  
  void main() {
    mat4 modelViewProjectionMatrix = projectionMatrix * modelViewMatrix;
  
    gl_Position = position * modelViewProjectionMatrix;
  }
**/
function basicVertexShader() {
  // attribute vec3 position;
  var position = this.attributes.position;
  // uniform mat4 modelViewMatrix;
  var modelViewMatrix = this.uniforms.modelViewMatrix;
  // uniform mat4 projectionMatrix;
  var projectionMatrix = this.uniforms.projectionMatrix;
  
  // mat4 modelViewProjectionMatrix = projectionMatrix * modelViewMatrix;
  var modelViewProjectionMatrix = new THREE.Matrix4().multiplyMatrices(
    projectionMatrix,
    modelViewMatrix
  );
  
  // gl_Position = position * modelViewProjectionMatrix;
  return position.applyMatrix4(modelViewProjectionMatrix);
}

// The fragment shader runs once for each fragment (pixel) covered by a face after the vertex shader has run.
// Like the vertex shader, the fragment shader is also an injectable function.
// The single output for a fragment shader is gl_FragColor.

// The vertexShader function below is the JavaScript equivalent of the most basic GLSL fragment shader:
/**
  uniform vec4 color;
  
  void main() {
    gl_FragColor = color;
  }
**/
function basicFragmentShader() {
  // uniform vec3 color;
  var color = this.uniforms.color;
  
  // gl_FragColor = color;
  return color;
}
