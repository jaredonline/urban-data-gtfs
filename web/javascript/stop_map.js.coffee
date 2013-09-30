class LeafletMap
  CITY_CENTER =
    "san-francisco": [37.783333, -122.216667]
  CITY_ZOOM =
    "san-francisco": 10

  DEFAULT_ROUTES =
    'san-francisco': '01'

  constructor: (@mapContainerId, @city) ->
    @_generateMap()
    @_generateSvg()
    @_generateMapData()

    @_loadData()
    @busStopRadius  = 3
    @currentRouteID = null

    @_previousPoint = null

  # Convert back to lat-long coordinates
  projection: (x) ->
    if (x[1] > 0)
      point = @_map.latLngToLayerPoint(new L.LatLng(x[1], x[0]))
      @_previousPoint = point
      [point.x, point.y]
    else if (@_previousPoint?)
      [@_previousPoint.x, @_previousPoint.y]
    else
      [0, 0]

  getWidth: ->
    $('#' + @mapContainerId).width()
  getHeight: ->
    $('#' + @mapContainerId).height()

  redraw: ->
    return if @_bounds is `undefined`

    bottomLeft = @projection(@_bounds[0])
    topRight   = @projection(@_bounds[1])

    @_svgMap
      .attr
        width:  topRight[0] - bottomLeft[0]
        height: bottomLeft[1] - topRight[1]
      .style
        "margin-left": "#{bottomLeft[0]}px"
        "margin-top":  "#{topRight[1]}px"


    @g.attr("transform", translate(-bottomLeft[0], -topRight[1]))

    if @_busStops isnt `undefined`
      @_busStops.attr
        cx: (d, i) => @projection(@_stopCoordinates[i])[0]
        cy: (d, i) => @projection(@_stopCoordinates[i])[1]

    if @_busRoutes isnt `undefined`
      @_busRoutes.attr("d", @_path)

    return


  _generateMap: ->
    @_map = L.map(@mapContainerId, {
      center: CITY_CENTER[@city],
      zoom:   CITY_ZOOM[@city]
      zoomControl: false}).addLayer(new L.tileLayer("http://{s}.tile.cloudmade.com/62541519723e4a6abd36d8a4bb4d6ac3/998/256/{z}/{x}/{y}.png", {
        attribution: "",
        maxZoom: 16,
    }))

    @_layerControl = new L.Control.Zoom({ position: 'bottomleft' })
    @_layerControl.addTo(@_map)

    d3.select('.leaflet-control-attribution').remove()
    return

  _generateSvg: ->
    __this = @
    @_svgMap     = d3.select(@_map.getPanes().overlayPane).append("svg")
    @g          = @_svgMap.append("g").attr("class", "leaflet-zoom-hide")
    @_path       = d3.geo.path().projection((x) -> __this.projection(x))
    @_tooltip    = d3.select("#tooltip")
    return

  _colorScale: (d) ->
    if @__colorScale is `undefined`
      @__colorScale = d3.scale.category20()

    @__colorScale(d)

  _generateMapData: ->
    @_busRoutes       = `undefined`
    @_busStops        = `undefined`
    @_stopCoordinates = `undefined`
    @_bounds          = `undefined`
    @_remoteRequests  = []
    @visTimers        = []
    return

  _busStopMouseover: (elem, d) ->
    dot = d3.select(elem)
    dot.attr("r", 10).classed("hover", true)
    xPosition = parseFloat(dot.attr("cx"))
    yPosition = parseFloat(dot.attr("cy"))
    @_tooltip.style
      left: (xPosition + 10) + "px"
      top: (yPosition + 10) + "px"
    @_tooltip.select(".route-name").text(d.properties.name_route)
    @_tooltip.select(".stop-name").text(d.properties.name_stop)
    @_tooltip.classed("hidden", false)

  _busStopMouseout: (elem, d) ->
    d3.select(elem).attr("r", 5).classed "hover", false
    @_tooltip.classed "hidden", true

  _routeMouseover: (elem, d) ->
    route = d3.select(elem)
    route.classed "highlighted", true

  _routeMouseout: (elem, d) ->
    route = d3.select(elem)
    route.classed "highlighted", false

  cancelOtherVis: () =>
    # stop loading any other route data
    req.abort() for req in @_remoteRequests
    # cancel the timers from existing visualizations
    clearTimeout(timerId) for timerId in @visTimers
    @_remoteRequests = []
    @visTimers = []

    # clear out any existing visualizations
    d3.selectAll('#route_vis > svg').remove()

    #unhighight stops
    @g.selectAll("circle.bus-stop")
      .classed('highlighted', false)


  newRouteVis: () =>
    self = @
    newDate = $('select#weekday option:selected').val()
    url = "http://hidden-cove-4519.herokuapp.com/schedule?" +
      "route_id=#{@currentRouteID}" # + "&date=#{newDate}"

    console.log('loading', url)
    $('#loading-msg').show()

    call_ts_vis = (error, data) -> 
      $('#loading-msg').hide() # loaded
      show_ts(error, data, self)
    @_remoteRequests.push(d3.json(url, call_ts_vis))

  dateChange: () =>
    @cancelOtherVis()
    @newRouteVis()

  advanceDate: () =>
    curDate = +$('select#weekday option:selected').val()

    nextDay = if curDate < 20121007 then curDate+1 else 20121001
    $('select#weekday').val(nextDay)
    @dateChange()

  _routeClick: (elem, d) =>
    __this = @
    route = d3.select(elem)
    route_id = d.properties.route_id
    @currentRouteID = route_id
    d3.selectAll('#route_name').text(d.properties.route_long_name)

    @cancelOtherVis()
    # load up the timeseries data for the route
    @newRouteVis()

  _loadData: ->
    d3.json "/data/#{@city}/stops.json", (stops) =>
      __this = @
      @_stopCoordinates = topojson.object(stops,
        type: "MultiPoint"
        coordinates: stops.objects.stops.geometries.map((d) -> d.coordinates)
      ).coordinates

      @_busStops = @g.selectAll("circle.bus-stop")
        .data(stops.objects.stops.geometries).enter()
        .append("circle")
          .attr
            r: @busStopRadius
            class: (d) -> "bus-stop bus-stop-#{d.properties.stop_id}"
          .on("mouseover", (d) -> __this._busStopMouseover(this, d))
          .on("mouseout",  (d) -> __this._busStopMouseout(this, d))

      @_bounds = [
        [
          d3.min(@_stopCoordinates, (d) -> d[0]) - 10,
          d3.min(@_stopCoordinates, (d) -> d[1]) - 10
        ],
        [
          d3.max(@_stopCoordinates, (d) -> d[0]) + 10,
          d3.max(@_stopCoordinates, (d) -> d[1]) + 10
        ]
      ]

      @_map.on("viewreset", () -> __this.redraw())
      @redraw()

      d3.json "/data/#{@city}/routes.json", (routes) =>
        @_busRoutes = @g.selectAll("path.bus-route")
          .data(topojson.object(routes, routes.objects.routes).geometries).enter()
          .append("path").attr(
            class: (d) -> "bus-route bus-route-#{d.properties.route_id}"
            d: @_path
          )
            .style("stroke", (d) -> '#' + d.properties.route_color)
            .on("mouseover", (d) -> __this._routeMouseover(this, d))
            .on("mouseout", (d) -> __this._routeMouseout(this, d))
            .on("click", (d) -> __this._routeClick(this, d))

        # set up a date picker
        $('select#weekday').change(@dateChange)
        # start the thing off with a default route

        defaultRoute = routes.objects.routes.geometries.filter (route) ->
          "#{route.properties.route_id}" == "#{DEFAULT_ROUTES[__this.city]}"

        @_routeClick(null, defaultRoute[0])
        return
      return

# add the previous weeks dates to the select weekday option
addDateOpt = (date) ->
  $('select#weekday').append(
    $("<option></option>")
      .attr("value", d3.time.format('%Y%m%d')(date))
      .text(d3.time.format('%A')(date)))
today = new Date()
dates = {}
_.range(7).forEach (n) ->
  d = addDays(today, -1 * n)
  dates[d.getDay()] = d
_.range(1,7).forEach (n) ->
  addDateOpt(dates[n])
addDateOpt(dates[0])

new LeafletMap "map", window.city_name
