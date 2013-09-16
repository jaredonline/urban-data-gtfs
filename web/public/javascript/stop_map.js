(function() {
  var LeafletMap,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  LeafletMap = (function() {
    var CITY_CENTER, CITY_ZOOM, DEFAULT_ROUTES;

    CITY_CENTER = {
      "san-francisco": [37.783333, -122.216667]
    };

    CITY_ZOOM = {
      "san-francisco": 10
    };

    DEFAULT_ROUTES = {
      'san-francisco': '01'
    };

    function LeafletMap(mapContainerId, city) {
      this.mapContainerId = mapContainerId;
      this.city = city;
      this._routeClick = __bind(this._routeClick, this);
      this.advanceDate = __bind(this.advanceDate, this);
      this.dateChange = __bind(this.dateChange, this);
      this.newRouteVis = __bind(this.newRouteVis, this);
      this.cancelOtherVis = __bind(this.cancelOtherVis, this);
      this._generateMap();
      this._generateSvg();
      this._generateMapData();
      this._loadData();
      this.busStopRadius = 3;
      this.currentRouteID = null;
      this._previousPoint = null;
    }

    LeafletMap.prototype.projection = function(x) {
      var point;

      if (x[1] > 0) {
        point = this._map.latLngToLayerPoint(new L.LatLng(x[1], x[0]));
        this._previousPoint = point;
        return [point.x, point.y];
      } else if ((this._previousPoint != null)) {
        return [this._previousPoint.x, this._previousPoint.y];
      } else {
        return [0, 0];
      }
    };

    LeafletMap.prototype.getWidth = function() {
      return $('#' + this.mapContainerId).width();
    };

    LeafletMap.prototype.getHeight = function() {
      return $('#' + this.mapContainerId).height();
    };

    LeafletMap.prototype.redraw = function() {
      var bottomLeft, topRight,
        _this = this;

      if (this._bounds === undefined) {
        return;
      }
      bottomLeft = this.projection(this._bounds[0]);
      topRight = this.projection(this._bounds[1]);
      this._svgMap.attr({
        width: topRight[0] - bottomLeft[0],
        height: bottomLeft[1] - topRight[1]
      }).style({
        "margin-left": "" + bottomLeft[0] + "px",
        "margin-top": "" + topRight[1] + "px"
      });
      this.g.attr("transform", translate(-bottomLeft[0], -topRight[1]));
      if (this._busStops !== undefined) {
        this._busStops.attr({
          cx: function(d, i) {
            return _this.projection(_this._stopCoordinates[i])[0];
          },
          cy: function(d, i) {
            return _this.projection(_this._stopCoordinates[i])[1];
          }
        });
      }
      if (this._busRoutes !== undefined) {
        this._busRoutes.attr("d", this._path);
      }
    };

    LeafletMap.prototype._generateMap = function() {
      this._map = L.map(this.mapContainerId, {
        center: CITY_CENTER[this.city],
        zoom: CITY_ZOOM[this.city],
        zoomControl: false
      }).addLayer(new L.tileLayer("http://{s}.tile.cloudmade.com/62541519723e4a6abd36d8a4bb4d6ac3/998/256/{z}/{x}/{y}.png", {
        attribution: "",
        maxZoom: 16
      }));
      this._layerControl = new L.Control.Zoom({
        position: 'bottomleft'
      });
      this._layerControl.addTo(this._map);
      d3.select('.leaflet-control-attribution').remove();
    };

    LeafletMap.prototype._generateSvg = function() {
      var __this;

      __this = this;
      this._svgMap = d3.select(this._map.getPanes().overlayPane).append("svg");
      this.g = this._svgMap.append("g").attr("class", "leaflet-zoom-hide");
      this._path = d3.geo.path().projection(function(x) {
        return __this.projection(x);
      });
      this._tooltip = d3.select("#tooltip");
    };

    LeafletMap.prototype._colorScale = function(d) {
      if (this.__colorScale === undefined) {
        this.__colorScale = d3.scale.category20();
      }
      return this.__colorScale(d);
    };

    LeafletMap.prototype._generateMapData = function() {
      this._busRoutes = undefined;
      this._busStops = undefined;
      this._stopCoordinates = undefined;
      this._bounds = undefined;
      this._remoteRequests = [];
      this.visTimers = [];
    };

    LeafletMap.prototype._busStopMouseover = function(elem, d) {
      var dot, xPosition, yPosition;

      dot = d3.select(elem);
      dot.attr("r", 10).classed("hover", true);
      xPosition = parseFloat(dot.attr("cx"));
      yPosition = parseFloat(dot.attr("cy"));
      this._tooltip.style({
        left: (xPosition + 10) + "px",
        top: (yPosition + 10) + "px"
      });
      this._tooltip.select(".route-name").text(d.properties.name_route);
      this._tooltip.select(".stop-name").text(d.properties.name_stop);
      return this._tooltip.classed("hidden", false);
    };

    LeafletMap.prototype._busStopMouseout = function(elem, d) {
      d3.select(elem).attr("r", 5).classed("hover", false);
      return this._tooltip.classed("hidden", true);
    };

    LeafletMap.prototype._routeMouseover = function(elem, d) {
      var route;

      route = d3.select(elem);
      return route.classed("highlighted", true);
    };

    LeafletMap.prototype._routeMouseout = function(elem, d) {
      var route;

      route = d3.select(elem);
      return route.classed("highlighted", false);
    };

    LeafletMap.prototype.cancelOtherVis = function() {
      var req, timerId, _i, _j, _len, _len1, _ref, _ref1;

      _ref = this._remoteRequests;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        req = _ref[_i];
        req.abort();
      }
      _ref1 = this.visTimers;
      for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
        timerId = _ref1[_j];
        clearTimeout(timerId);
      }
      this._remoteRequests = [];
      this.visTimers = [];
      d3.selectAll('#route_vis > svg').remove();
      return this.g.selectAll("circle.bus-stop").classed('highlighted', false);
    };

    LeafletMap.prototype.newRouteVis = function() {
      var call_ts_vis, newDate, self, url;

      self = this;
      newDate = $('select#weekday option:selected').val();
      url = "http://hidden-cove-4519.herokuapp.com/schedule?" + ("route_id=" + this.currentRouteID);
      console.log('loading', url);
      $('#loading-msg').show();
      call_ts_vis = function(error, data) {
        $('#loading-msg').hide();
        return show_ts(error, data, self);
      };
      return this._remoteRequests.push(d3.json(url, call_ts_vis));
    };

    LeafletMap.prototype.dateChange = function() {
      this.cancelOtherVis();
      return this.newRouteVis();
    };

    LeafletMap.prototype.advanceDate = function() {
      var curDate, nextDay;

      curDate = +$('select#weekday option:selected').val();
      nextDay = curDate < 20121007 ? curDate + 1 : 20121001;
      $('select#weekday').val(nextDay);
      return this.dateChange();
    };

    LeafletMap.prototype._routeClick = function(elem, d) {
      var route, route_id, __this;

      __this = this;
      route = d3.select(elem);
      route_id = d.properties.route_id;
      this.currentRouteID = route_id;
      d3.selectAll('#route_name').text(d.properties.route_long_name);
      this.cancelOtherVis();
      return this.newRouteVis();
    };

    LeafletMap.prototype._loadData = function() {
      var _this = this;

      return d3.json("/data/" + this.city + "/stops.json", function(stops) {
        var __this;

        __this = _this;
        _this._stopCoordinates = topojson.object(stops, {
          type: "MultiPoint",
          coordinates: stops.objects.stops.geometries.map(function(d) {
            return d.coordinates;
          })
        }).coordinates;
        _this._busStops = _this.g.selectAll("circle.bus-stop").data(stops.objects.stops.geometries).enter().append("circle").attr({
          r: _this.busStopRadius,
          "class": function(d) {
            return "bus-stop bus-stop-" + d.properties.stop_id;
          }
        }).on("mouseover", function(d) {
          return __this._busStopMouseover(this, d);
        }).on("mouseout", function(d) {
          return __this._busStopMouseout(this, d);
        });
        _this._bounds = [
          [
            d3.min(_this._stopCoordinates, function(d) {
              return d[0];
            }) - 10, d3.min(_this._stopCoordinates, function(d) {
              return d[1];
            }) - 10
          ], [
            d3.max(_this._stopCoordinates, function(d) {
              return d[0];
            }) + 10, d3.max(_this._stopCoordinates, function(d) {
              return d[1];
            }) + 10
          ]
        ];
        _this._map.on("viewreset", function() {
          return __this.redraw();
        });
        _this.redraw();
        d3.json("/data/" + _this.city + "/routes.json", function(routes) {
          var defaultRoute;

          _this._busRoutes = _this.g.selectAll("path.bus-route").data(topojson.object(routes, routes.objects.routes).geometries).enter().append("path").attr({
            "class": function(d) {
              return "bus-route bus-route-" + d.properties.route_id;
            },
            d: _this._path
          }).style("stroke", function(d) {
            return '#' + d.properties.route_color;
          }).on("mouseover", function(d) {
            return __this._routeMouseover(this, d);
          }).on("mouseout", function(d) {
            return __this._routeMouseout(this, d);
          }).on("click", function(d) {
            return __this._routeClick(this, d);
          });
          $('select#weekday').change(_this.dateChange);
          defaultRoute = routes.objects.routes.geometries.filter(function(route) {
            return ("" + route.properties.route_id) === ("" + DEFAULT_ROUTES[__this.city]);
          });
          _this._routeClick(null, defaultRoute[0]);
        });
      });
    };

    return LeafletMap;

  })();

  new LeafletMap("map", window.city_name);

}).call(this);
