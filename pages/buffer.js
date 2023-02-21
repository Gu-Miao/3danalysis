/** @type {import('cesium')} */
const _Cesium = window.Cesium

const {
  Viewer,
  UrlTemplateImageryProvider,
  Cartesian3,
  Color,
  PolygonHierarchy,
  ClassificationType,
  createWorldTerrain,
  HeightReference,
  ScreenSpaceEventType,
  Cartographic,
  Math: CesiumMath
} = _Cesium

/** @type {import('@turf/turf')} */
const turf = window.turf

const viewer = new Viewer('cesiumContainer', {
  imageryProvider: new UrlTemplateImageryProvider({
    url: 'http://111.203.245.98:8080/styles/street/{z}/{x}/{y}.png',
    maximumLevel: 17
  }),
  terrainProvider: createWorldTerrain()
})

viewer.scene.debugShowFramesPerSecond = true
viewer.scene.postProcessStages.fxaa.enabled = true

// 设置相机视角
viewer.camera.setView({
  destination: new Cartesian3(-1570795.9719130592, 5327277.730494421, 3128433.1008217977),
  orientation: {
    up: new Cartesian3(-0.17430765224609449, 0.3677310310561233, 0.9134499062164576),
    direction: new Cartesian3(0.1775905498820547, -0.9006997216776103, 0.3964865798012147)
  }
})

/** 当前模式，0 为点，1 为线，2 为面 */
let mode = 0
let drawing = false
let positions = []

const bufferInput = document.getElementById('bufferInput')
const tip = document.querySelector('.tip')
document.getElementById('toolbar').addEventListener('click', e => {
  if ('BUTTON' !== e.target.tagName) return
  document.querySelector('button.active').classList.remove('active')
  e.target.classList.add('active')
  mode = Number(e.target.dataset.mode)
  if (drawing) {
    drawing = false
    positions = []
    viewer.entities.removeAll()
  }
  if (mode === 0) {
    tip.style.display = 'none'
  } else {
    tip.style.display = ''
  }
})

viewer.screenSpaceEventHandler.setInputAction(movement => {
  const position = viewer.scene.pickPosition(movement.position)
  if (mode === 0) {
    createPointBuffer(position)
  } else if ([1, 2].includes(mode)) {
    createDrawingPoint(position)
  }
}, ScreenSpaceEventType.LEFT_CLICK)

viewer.screenSpaceEventHandler.setInputAction(() => {
  if (!drawing) return
  if (mode === 1) {
    createPolylineBuffer()
  } else if (mode === 2) {
    createPolygonBuffer()
  }
}, ScreenSpaceEventType.RIGHT_CLICK)

/** 创建面缓冲区 */
function createPolygonBuffer() {
  if (positions.length < 3) {
    alert('点数过少，不能成面')
    return
  }
  const coordinates = getMultiCoordinates(positions)
  const lineString = turf.lineString(coordinates)
  const feature = turf.lineToPolygon(lineString)
  const buffer = turf.buffer(feature, Number(bufferInput.value))
  createPolygon(positions)
  createBufferPolygon(Cartesian3.fromDegreesArray(buffer.geometry.coordinates[0].flat()))
  drawing = false
  positions = []
}

/**
 * 创建面
 * @param {Cartesian3} positions 位置
 */
function createPolygon(positions) {
  viewer.entities.add({
    polygon: {
      hierarchy: new PolygonHierarchy(positions),
      material: Color.YELLOW.withAlpha(0.6)
    }
  })
}

/** 创建线缓冲区 */
function createPolylineBuffer() {
  const coordinates = getMultiCoordinates(positions)
  const feature = turf.lineString(coordinates)
  const buffer = turf.buffer(feature, Number(bufferInput.value))
  createPolyline(positions)
  createBufferPolygon(Cartesian3.fromDegreesArray(buffer.geometry.coordinates[0].flat()))
  drawing = false
  positions = []
}

/**
 * 创建线
 * @param {Cartesian3} positions 坐标
 */
function createPolyline(positions) {
  viewer.entities.add({
    polyline: {
      positions,
      material: Color.YELLOW,
      width: 2,
      clampToGround: true
    }
  })
}

/**
 * 创建绘制线上的点
 * @param {Cartesian3} position 位置
 */
function createDrawingPoint(position) {
  if (!drawing) {
    viewer.entities.removeAll()
    drawing = true
  }
  positions.push(position)
  createPoint(position)
}

/**
 * 创建点
 * @param {Cartesian3} position 位置
 */
function createPoint(position) {
  viewer.entities.add({
    point: {
      pixelSize: 10,
      color: Color.YELLOW,
      outlineColor: Color.YELLOW,
      heightReference: HeightReference.CLAMP_TO_GROUND
    },
    position: position
  })
}

/**
 * 创建点缓冲区
 * @param {Cartesian3} position 位置
 */
function createPointBuffer(position) {
  viewer.entities.removeAll()
  createPoint(position)
  const coordinates = getCoordinates(position)
  const feature = turf.point(coordinates)
  const buffer = turf.buffer(feature, Number(bufferInput.value))
  createBufferPolygon(Cartesian3.fromDegreesArray(buffer.geometry.coordinates[0].flat()))
}

/**
 * 创建缓冲区多边形
 * @param {Cartesian3[]} positions 位置
 */
function createBufferPolygon(positions) {
  const entity = viewer.entities.add({
    polygon: {
      hierarchy: new PolygonHierarchy(positions),
      material: Color.RED.withAlpha(0.6)
    }
  })
  viewer.flyTo(entity, { duration: 1 })
}

/**
 * 获取经纬度坐标
 * @param {Cartesian3} cartesian 笛卡尔坐标
 * @returns {[number,number]} 增高后的坐标
 */
function getCoordinates(cartesian) {
  const { longitude, latitude } = Cartographic.fromCartesian(cartesian)
  return [CesiumMath.toDegrees(longitude), CesiumMath.toDegrees(latitude)]
}

/**
 * 获取经纬度坐标
 * @param {Cartesian3[]} cartesians 笛卡尔坐标
 * @returns 增高后的坐标
 */
function getMultiCoordinates(cartesians) {
  return cartesians.map(cartesian => getCoordinates(cartesian))
}
