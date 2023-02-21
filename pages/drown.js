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
  Math: CesiumMath,
  CompositeProperty,
  TimeInterval,
  SampledProperty,
  JulianDate,
  ConstantProperty,
  sampleTerrainMostDetailed
} = _Cesium

/** @type {import('@turf/turf')} */
const turf = window.turf

const viewer = new Viewer('cesiumContainer', {
  imageryProvider: new UrlTemplateImageryProvider({
    url: 'http://111.203.245.98:8080/styles/street/{z}/{x}/{y}.png',
    maximumLevel: 17
  }),
  terrainProvider: createWorldTerrain(),
  shouldAnimate: true
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

let analysing = false
let drawing = false
let positions = []

viewer.screenSpaceEventHandler.setInputAction(movement => {
  if (analysing) return
  const position = viewer.scene.pickPosition(movement.position)
  createDrawingPoint(position)
}, ScreenSpaceEventType.LEFT_CLICK)

viewer.screenSpaceEventHandler.setInputAction(() => {
  if (!drawing) return
  createPolygon()
}, ScreenSpaceEventType.RIGHT_CLICK)

const minInput = document.getElementById('min')
const maxInput = document.getElementById('max')
const speedInput = document.getElementById('speed')
const startBtn = document.getElementById('start')
const cancelBtn = document.getElementById('cancel')
startBtn.addEventListener('click', () => {
  analysing = true
  startBtn.disabled = true
  cancelBtn.style.display = ''
  const min = Number(minInput.value)
  const max = Number(maxInput.value)
  const speed = Number(speedInput.value)
  const duration = (max - min) / speed
  const sampled = new SampledProperty(Number)
  const now = JulianDate.now()
  const end = JulianDate.addSeconds(now, duration, new JulianDate())
  const far = JulianDate.addDays(end, 2000, new JulianDate())
  sampled.addSample(now, min)
  sampled.addSample(end, max)
  const composite = new CompositeProperty()
  composite.intervals.addInterval(
    TimeInterval.fromIso8601({
      iso8601: `${JulianDate.toIso8601(now)}/${JulianDate.toIso8601(end)}`,
      data: sampled
    })
  )
  composite.intervals.addInterval(
    TimeInterval.fromIso8601({
      iso8601: `${JulianDate.toIso8601(end)}/${JulianDate.toIso8601(far)}`,
      data: new ConstantProperty(max)
    })
  )
  viewer.entities.removeAll()
  viewer.entities.add({
    polygon: {
      hierarchy: new PolygonHierarchy(positions),
      material: Color.CYAN.withAlpha(0.6),
      height: 0,
      extrudedHeight: composite
    }
  })
})
cancelBtn.addEventListener('click', () => {
  analysing = false
  viewer.entities.removeAll()
  cancelBtn.style.display = 'none'
})

/** 创建面 */
function createPolygon() {
  if (positions.length < 3) {
    alert('点数过少，不能成面')
    return
  }

  viewer.entities.add({
    polygon: {
      hierarchy: new PolygonHierarchy(positions),
      material: Color.YELLOW.withAlpha(0.6),
      heightReference: HeightReference.CLAMP_TO_GROUND
    }
  })

  getMinMaxHeight(positions)

  drawing = false
}

/**
 * 创建绘制线上的点
 * @param {Cartesian3} position 位置
 */
function createDrawingPoint(position) {
  if (!drawing) {
    viewer.entities.removeAll()
    drawing = true
    positions = []
    startBtn.disabled = true
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
 *
 * @param {Cartesian3[]} positions
 */
async function getMinMaxHeight(positions) {
  minInput.disabled = true
  maxInput.disabled = true
  const _coordinates = getMultiCoordinates(positions)
  const coordinates = [[..._coordinates, _coordinates[0]]]
  const polygon = turf.polygon(coordinates)
  const bbox = turf.bbox(polygon)
  const [minLong, minLat, maxLong, maxLat] = bbox
  const units = clamp(Math.max(maxLong - minLong, maxLat - minLat) * 1000, 15, 100)
  const pointGrid = turf.pointGrid(bbox, units, { units: 'meters', mask: polygon })
  const pointGridCoordinates = pointGrid.features.map(feature => feature.geometry.coordinates)
  const cartographics = pointGridCoordinates.map(coordinate =>
    Cartographic.fromDegrees(...coordinate)
  )
  const results = await sampleTerrainMostDetailed(viewer.terrainProvider, cartographics)
  let max = 0
  let min = Number.MAX_SAFE_INTEGER
  const len = results.length
  for (let i = 0; i < len; i++) {
    const { height } = results[i] || {}
    if (!height) continue
    if (height > max) max = height
    if (height < min) min = height
  }
  maxInput.value = max
  minInput.value = min
  minInput.disabled = undefined
  maxInput.disabled = undefined
  startBtn.disabled = undefined
}

/**
 * 获取经纬度坐标
 * @param {Cartesian3[]} cartesians 笛卡尔坐标
 * @returns 增高后的坐标
 */
function getMultiCoordinates(cartesians) {
  return cartesians.map(cartesian => getCoordinates(cartesian))
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
 * 约束数字大小
 * @param {Number} value 数字
 * @param {Number} min 最小值
 * @param {Number} max 最大值
 */
function clamp(value, min, max) {
  return Math.max(Math.min(value, max), min)
}
