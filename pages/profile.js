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

/** @type {import('echarts')} */
const echarts = window.echarts

const viewer = new Viewer('cesiumContainer', {
  terrainProvider: createWorldTerrain(),
  shouldAnimate: true
})

viewer.scene.debugShowFramesPerSecond = true
viewer.scene.postProcessStages.fxaa.enabled = true

// 设置相机视角
viewer.camera.setView({
  destination: new Cartesian3(-2351760.5229918757, 4588345.355301249, 3745560.8606326426),
  orientation: {
    up: new Cartesian3(-0.12270675752791883, 0.5755375770238973, 0.8085168823781271),
    direction: new Cartesian3(0.7191911108411699, -0.5098230076851441, 0.472064240249055)
  }
})

let drawing = false
let positions = []

viewer.screenSpaceEventHandler.setInputAction(movement => {
  const position = viewer.scene.pickPosition(movement.position)
  createDrawingPoint(position)
}, ScreenSpaceEventType.LEFT_CLICK)

viewer.screenSpaceEventHandler.setInputAction(() => {
  if (!drawing) return
  createPolyline()
}, ScreenSpaceEventType.RIGHT_CLICK)

/** 创建线 */
function createPolyline() {
  if (positions.length < 2) {
    alert('点数过少，不能成线')
    return
  }

  viewer.entities.add({
    polyline: {
      positions,
      material: Color.YELLOW.withAlpha(0.6),
      clampToGround: true,
      width: 3
    }
  })

  getHeights(positions)

  drawing = false
}

/**
 * 获取切面高度
 * @param {Cartesian3[]} positions
 */
async function getHeights(positions) {
  const coordinates = getMultiCoordinates(positions)
  const polyline = turf.lineString(coordinates)
  const length = turf.length(polyline, { units: 'meters' })
  const interval = clamp(length / 1000, 15, 50)
  const count = Math.ceil(length / interval)
  const cartographics = []
  const distances = []

  for (let i = 0; i < count; i++) {
    const percent = i / count
    const distance = percent * length
    const feature = turf.along(polyline, distance, { units: 'meters' })
    cartographics.push(Cartographic.fromDegrees(...feature.geometry.coordinates))
    distances.push(distance)
  }

  const results = await sampleTerrainMostDetailed(viewer.terrainProvider, cartographics)
  draw(distances, results)
}

const chartWrapper = document.querySelector('.chart-wrapper')
const chartContainer = document.getElementById('chart')
let chart
/**
 * 绘制图表
 * @param {Number[]} distances
 * @param {Cartographic[]} cartographics
 */
function draw(distances, cartographics) {
  const xData = distances.map(distance => distance.toFixed(0))
  const yData = cartographics.map(cartographic => cartographic.height.toFixed(0))
  const option = {
    grid: {
      top: 40,
      right: 70,
      bottom: 30,
      left: 50
    },
    xAxis: {
      name: '距离/米',
      type: 'category',
      boundaryGap: false,
      data: xData
    },
    yAxis: {
      name: '海拔/米',
      nameTextStyle: {
        align: 'right'
      },
      type: 'value'
    },
    series: [
      {
        data: yData,
        type: 'line',
        symbol: 'none',
        smooth: true,
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: 'rgb(255, 158, 68)'
            },
            {
              offset: 1,
              color: 'rgb(255, 70, 131)'
            }
          ])
        },
        lineStyle: {
          color: 'rgb(255,77,144)'
        }
      }
    ],
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100
      }
    ],
    tooltip: {
      trigger: 'axis',
      formatter(params) {
        const { data, dataIndex } = params[0]
        const { longitude, latitude } = cartographics[dataIndex]
        return `当前位置<br/>
距起点：${xData[dataIndex]}米<br/>
海拔：${data}米<br/>
经度：${CesiumMath.toDegrees(longitude)}<br/>
纬度：${CesiumMath.toDegrees(latitude)}`
      }
    }
  }

  chartWrapper.style.display = ''
  if (!chart) {
    chart = echarts.init(chartContainer)
  }
  chart.setOption(option)
}

window.addEventListener('resize', () => {
  if (!chart || !chart.resize) return
  chart.resize()
})

/**
 * 创建绘制线上的点
 * @param {Cartesian3} position 位置
 */
function createDrawingPoint(position) {
  if (!drawing) {
    viewer.entities.removeAll()
    chartWrapper.style.display = 'none'
    drawing = true
    positions = []
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
