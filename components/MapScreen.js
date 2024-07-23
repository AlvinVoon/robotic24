import React, { useState, useEffect } from "react";
import { StyleSheet, View, Text, Button, Alert, Image } from "react-native";
import MapView, { Marker, Polygon, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import axios from 'axios';
import { database } from "../firebase"; // Adjust the path based on your structure
import { ref, set } from "firebase/database";
import CustomButton from "../CustomButton"; // Adjust the path based on your structure
import Slider from '@react-native-community/slider';
import { polygon as turfPolygon } from "@turf/helpers";
import area from "@turf/area";
import bbox from "@turf/bbox";
import pointGrid from "@turf/point-grid";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import * as Haptics from 'expo-haptics';
import Checkbox from 'expo-checkbox';
import MangroveIcon from '../assets/mangrove_icon.png'; // Adjust the path as necessary
import Animated, { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import SVGComponent from "./svgComponent"; // Adjust the path as necessary

const MapScreen = () => {
  const [location, setLocation] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [points, setPoints] = useState([]);
  const [lines, setLines] = useState([]);
  const [gridSize, setGridSize] = useState(0.001);
  const [isChecked, setIsChecked] = useState(false);
  const [polygonArea, setPolygonArea] = useState(0);
  const [highTide, setHighTide] = useState([]);
  const [lowTide, setLowTide] = useState([]);
  const svgPosition = useSharedValue(500); // Start position below the screen
  const [tideHeight, setTideHeight] = useState(0);

  useEffect(() => {
    if (isChecked) {
      uploadMarkers();
    }
  }, [isChecked]);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission to access location was denied');
        return;
      }
      let location = await Location.getCurrentPositionAsync({});
      setLocation(location.coords);
    })();
  }, []);

  const handleMapPress = (e) => {
    const newMarker = {
      coordinate: e.nativeEvent.coordinate,
      key: Math.random().toString(),
    };
    setMarkers([...markers, newMarker]);
  };

  const deleteMarker = (key) => {
    setMarkers(markers.filter(marker => marker.key !== key));
  };

  const generateGrid = () => {
    if (markers.length > 2) {
      const coordinates = markers.map(marker => [marker.coordinate.longitude, marker.coordinate.latitude]);
      coordinates.push(coordinates[0]);

      const poly = turfPolygon([coordinates]);
      const polygonArea = area(poly);
      setPolygonArea(polygonArea);

      const boundingBox = bbox(poly);
      const grid = pointGrid(boundingBox, gridSize, { units: 'degrees' });
      const pointsInPolygon = grid.features.filter(point => booleanPointInPolygon(point, poly));

      const pointCoordinates = pointsInPolygon.map(point => ({
        latitude: point.geometry.coordinates[1],
        longitude: point.geometry.coordinates[0],
      }));

      const lineCoordinates = [];
      const pointsHash = {};
      pointCoordinates.forEach((point, index) => {
        pointsHash[`${point.latitude},${point.longitude}`] = point;
      });
      pointCoordinates.forEach((point) => {
        const rightPoint = pointsHash[`${point.latitude},${point.longitude + gridSize}`];
        const belowPoint = pointsHash[`${point.latitude - gridSize},${point.longitude}`];

        if (rightPoint) {
          lineCoordinates.push([point, rightPoint]);
        }
        if (belowPoint) {
          lineCoordinates.push([point, belowPoint]);
        }
      });

      setPoints(pointCoordinates);
      setLines(lineCoordinates);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const uploadMarkers = async () => {
    try {
      const markersRef = ref(database, 'markers');
      await set(markersRef, {
        markers: markers.map((marker) => marker.coordinate),
        timestamp: new Date().toISOString(),
      });
      alert("Markers uploaded successfully!");
    } catch (error) {
      alert("Error uploading markers: " + error.message);
    }
  };

  const reloadPage = () => {
    setMarkers([]);
    setPoints([]);
    setLines([]);
    setPolygonArea(0);
    setLocation(null);
    setIsChecked(false);
    (async () => {
      let location = await Location.getCurrentPositionAsync({});
      setLocation(location.coords);
    })();
  };

  const convertUtcToLocal = (utcDateString) => {
    const date = new Date(utcDateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short'
    }).format(date);
  };

  const fetchTideData = async () => {
    if (!location) {
      Alert.alert('Location not available', 'Please wait until location data is available.');
      return;
    }
    try {
      console.log(`Fetching tide data for location: ${location.latitude}, ${location.longitude}`);
      const response = await axios.get(`https://api.marea.ooo/v2/tides`, {
        params: {
          latitude: location.latitude,
          longitude: location.longitude,
          duration: '1440',
          interval: '60',
          model: 'FES2014',
          datum: 'MSL'
        },
        headers: {
          'x-marea-api-token': '6b7eb4c0-406d-47f6-9c03-b49e19d8d11d'
        }
      });

      if (response.status === 200 && response.data.extremes) {
        const tideEvents = response.data.extremes.map(extreme => ({
          time: convertUtcToLocal(extreme.datetime),
          height: extreme.height,
          state: extreme.state
        }));

        setHighTide(tideEvents.filter(tide => tide.state.includes("HIGH")));
        setLowTide(tideEvents.filter(tide => tide.state.includes("LOW")));

        Alert.alert('Tide Data', tideEvents.map(tide => `${tide.state} at ${tide.time}: ${tide.height} m`).join('\n'));

        // Animate the SVG based on tide height
        const maxTideHeight = Math.max(...tideEvents.map(tide => tide.height));
        setTideHeight(maxTideHeight);
        svgPosition.value = withTiming(maxTideHeight * 50, { // Multiply by 100 to adjust the height scaling
          duration: 2000,
          easing: Easing.out(Easing.ease),
        });
      } else {
        Alert.alert('Error', 'No tide data found or invalid response structure');
      }
    } catch (error) {
      Alert.alert('Error', `Failed to fetch tide data: ${error.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: location ? location.latitude : 37.78825,
          longitude: location ? location.longitude : -122.4324,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
        onPress={handleMapPress}
      >
        {markers.map((marker) => (
          <Marker
            key={marker.key}
            coordinate={marker.coordinate}
            onPress={() => deleteMarker(marker.key)}
          />
        ))}
        {markers.length > 2 && (
          <Polygon
            coordinates={markers.map(marker => marker.coordinate)}
            fillColor="rgba(0, 200, 0, 0.5)"
            strokeColor="rgba(0,0,0,0.5)"
            strokeWidth={2}
          />
        )}
        {points.map((point, index) => (
          <Marker
            key={index}
            coordinate={point}
            image={MangroveIcon}
          />
        ))}
        {lines.map((line, index) => (
          <Polyline
            key={index}
            coordinates={line}
            strokeColor="rgba(0, 0, 255, 0.5)"
            strokeWidth={2}
          />
        ))}
      </MapView>
      <View style={styles.topContainer}>
        <Button title="Reload" onPress={reloadPage} />
        <Button title="Fetch Tide Data" onPress={fetchTideData} />
      </View>
      <View style={StyleSheet.absoluteFill}>
        <View style={StyleSheet.svgContainer}>
        <SVGComponent animatedValue={svgPosition} />
        </View>
      </View>
      <View style={styles.controlsContainer}>
        <View style={styles.sliderContainer}>
          <Slider
            style={{ width: 300, height: 40 }}
            minimumValue={0.0001}
            maximumValue={0.01}
            step={0.0001}
            value={gridSize}
            onValueChange={value => setGridSize(value)}
          />
          <Text>High Tide: {highTide.map(tide => `${tide.time}: ${tide.height} m`).join(', ')}</Text>
          <Text>Low Tide: {lowTide.map(tide => `${tide.time}: ${tide.height} m`).join(', ')}</Text>
          <Text>Grid Size: {gridSize.toFixed(4)} degrees</Text>
        </View>
        <CustomButton title="Generate Grid" onPress={generateGrid} />
        <Text>Polygon Area: {polygonArea.toFixed(2)} square meters</Text>
        <View style={styles.checkboxContainer}>
          <Checkbox
            style={styles.checkbox}
            value={isChecked}
            onValueChange={setIsChecked}
            color={isChecked ? '#4630EB' : undefined}
          />
          <Text style={styles.checkboxLabel}>Upload Markers</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  topContainer: {
    position: 'absolute',
    top: 40,
    left: 10,
    right: 10,
    zIndex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 30,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 8,
    padding: 10,
    zIndex: 1,
  },
  sliderContainer: {
    marginBottom: 10,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    marginRight: 8,
  },
  checkboxLabel: {
    fontSize: 16,
  },
  svgContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
});

export default MapScreen;
